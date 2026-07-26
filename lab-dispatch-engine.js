// ============================================================================
// GIAI ĐOẠN 2A — ENGINE ĐIỀU PHỐI PXN
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Chứa TOÀN BỘ logic tính toán, KHÔNG đụng giao diện — để test độc lập:
//   • Gọi RPC find_candidate_labs (DB đã lọc BSL/năng lực/công suất)
//   • Gọi OSRM public tính đường ĐI THẬT (km + phút), fallback Haversine
//   • Chấm điểm 3 chiều: Gần + Trống + Nhanh, theo trọng số tùy chỉnh
//   • Trả về Top N đã xếp hạng, kèm hình học tuyến đường để vẽ Leaflet
//
// NHÚNG: <script src="lab-dispatch-engine.js"></script>  (sau lab-admin.js)
//
// TEST NHANH trong Console (sau khi đã có PXN + sự cố có tọa độ):
//   const r = await window.LabDispatch.findBestLabs({
//     testTypeId: '<uuid loại XN>',
//     sampleCount: 50,
//     originLat: 10.7769, originLng: 106.7009,
//     preset: 'balanced'
//   });
//   console.table(r.ranked);
// ============================================================================

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // CẤU HÌNH
  // --------------------------------------------------------------------------
  const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
  const OSRM_TIMEOUT_MS = 4000; // quá 4s coi như OSRM chết → fallback
  const OSRM_GAP_MS = 250; // giãn cách giữa các request (né rate-limit)

  // Preset trọng số (tổng = 1.0). 3 chiều: gần (near) / trống (free) / nhanh (fast)
  const PRESETS = {
    urgent: {
      near: 0.45,
      free: 0.1,
      fast: 0.45,
      label: '⚡ Khẩn — ưu tiên tốc độ',
    },
    balanced: { near: 0.34, free: 0.33, fast: 0.33, label: '⚖️ Cân bằng' },
    capacity: {
      near: 0.2,
      free: 0.6,
      fast: 0.2,
      label: '📦 Nhiều mẫu — ưu tiên công suất',
    },
  };

  // --------------------------------------------------------------------------
  // HAVERSINE — khoảng cách chim bay (km), dùng khi OSRM không phản hồi
  // --------------------------------------------------------------------------
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // --------------------------------------------------------------------------
  // GỌI OSRM cho 1 tuyến A→B. Trả về { km, minutes, geometry, source }.
  // source = 'osrm' (đường thật) | 'haversine' (ước lượng chim bay).
  // --------------------------------------------------------------------------
  async function routeOne(originLat, originLng, destLat, destLng) {
    // OSRM nhận thứ tự lng,lat
    const url =
      `${OSRM_BASE}/${originLng},${originLat};${destLng},${destLat}` +
      `?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.length)
        throw new Error('OSRM no route');

      const route = data.routes[0];
      return {
        km: +(route.distance / 1000).toFixed(2),
        minutes: Math.round(route.duration / 60),
        geometry: route.geometry, // GeoJSON LineString {type, coordinates:[[lng,lat],...]}
        source: 'osrm',
      };
    } catch (err) {
      clearTimeout(timer);
      // FALLBACK: đường chim bay + ước tính thời gian (giả định ~30 km/h nội đô)
      const km = +haversineKm(originLat, originLng, destLat, destLng).toFixed(
        2
      );
      return {
        km,
        minutes: Math.round((km / 30) * 60),
        geometry: {
          type: 'LineString',
          coordinates: [
            [originLng, originLat],
            [destLng, destLat],
          ], // đường thẳng
        },
        source: 'haversine',
        _reason: err.message,
      };
    }
  }

  // Gọi OSRM tuần tự (có giãn cách) để tránh rate-limit server public
  async function routeAll(originLat, originLng, candidates) {
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const r = await routeOne(originLat, originLng, c.lat, c.lng);
      results.push({ ...c, route: r });
      if (i < candidates.length - 1) {
        await new Promise((res) => setTimeout(res, OSRM_GAP_MS));
      }
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // CHUẨN HÓA & CHẤM ĐIỂM 3 CHIỀU
  //   diemGan  = 100 * (1 - phút/phútXaNhất)      → gần/nhanh tới nơi = điểm cao
  //   diemTrong= 100 * (còn lại / công suất tối đa) → còn nhiều chỗ = điểm cao
  //   diemNhanh= 100 * (1 - trảKQ/trảKQchậmNhất)   → trả KQ nhanh = điểm cao
  //   tổng     = gan*wNear + trong*wFree + nhanh*wFast
  // --------------------------------------------------------------------------
  function scoreAndRank(routed, weights) {
    if (!routed.length) return [];

    const maxMinutes = Math.max(...routed.map((r) => r.route.minutes || 0), 1);
    const maxTurnaround = Math.max(
      ...routed.map((r) => r.turnaround_hours ?? 0),
      1
    );

    const scored = routed.map((r) => {
      const minutes = r.route.minutes || 0;
      const remaining = r.remaining_today ?? 0;
      const maxCap = r.max_capacity_per_day || 1;
      const turnaround = r.turnaround_hours ?? maxTurnaround; // thiếu dữ liệu → coi như chậm nhất

      const diemGan = 100 * (1 - minutes / maxMinutes);
      const diemTrong = 100 * Math.max(0, Math.min(1, remaining / maxCap));
      const diemNhanh = 100 * (1 - turnaround / maxTurnaround);

      const total =
        diemGan * weights.near +
        diemTrong * weights.free +
        diemNhanh * weights.fast;

      return {
        ...r,
        scores: {
          gan: Math.round(diemGan),
          trong: Math.round(diemTrong),
          nhanh: Math.round(diemNhanh),
          total: Math.round(total * 10) / 10,
        },
      };
    });

    // Xếp hạng: điểm tổng giảm dần; hòa điểm thì ưu tiên đủ công suất, rồi gần hơn
    scored.sort((a, b) => {
      if (b.scores.total !== a.scores.total)
        return b.scores.total - a.scores.total;
      if ((b.is_enough ? 1 : 0) !== (a.is_enough ? 1 : 0))
        return (b.is_enough ? 1 : 0) - (a.is_enough ? 1 : 0);
      return (a.route.minutes || 0) - (b.route.minutes || 0);
    });

    return scored.map((s, i) => ({ ...s, rank: i + 1 }));
  }

  // --------------------------------------------------------------------------
  // HÀM CHÍNH — tìm PXN tốt nhất
  //   opts: {
  //     testTypeId, sampleCount, originLat, originLng,
  //     preset ('urgent'|'balanced'|'capacity') hoặc weights {near,free,fast},
  //     excludeLabIds [] (PXN admin đã loại trừ tại trận),
  //     candidateLimit (mặc định 10), topN (mặc định 3),
  //     includeFull (mặc định true: vẫn xét PXN đã đầy, đánh dấu is_enough=false)
  //   }
  //   Trả về: { ranked: [...], top: [...], meta: {...} }
  // --------------------------------------------------------------------------
  async function findBestLabs(opts) {
    const {
      testTypeId,
      sampleCount = 1,
      originLat,
      originLng,
      preset = 'balanced',
      weights: customWeights,
      excludeLabIds = [],
      candidateLimit = 10,
      topN = 3,
      includeFull = true,
    } = opts || {};

    if (!testTypeId) throw new Error('Thiếu testTypeId');
    if (originLat == null || originLng == null)
      throw new Error('Thiếu tọa độ điểm sự cố (originLat/originLng)');

    const weights =
      customWeights ||
      PRESETS[preset]?.weights ||
      PRESETS[preset] ||
      PRESETS.balanced;

    // [1] DB lọc BSL/năng lực/công suất + trả ~N PXN gần nhất (chim bay)
    const { data: candidates, error } = await window.supabaseClient.rpc(
      'find_candidate_labs',
      {
        p_test_type_id: testTypeId,
        p_sample_count: sampleCount,
        p_lat: originLat,
        p_lng: originLng,
        p_limit: candidateLimit,
        p_include_full: includeFull,
      }
    );
    if (error) throw new Error('Lỗi RPC find_candidate_labs: ' + error.message);

    let list = (candidates || []).filter(
      (c) => !excludeLabIds.includes(c.lab_id)
    );

    const meta = {
      totalCandidates: candidates?.length || 0,
      afterExclude: list.length,
      weights,
      preset: customWeights ? 'custom' : preset,
      osrmFailures: 0,
    };

    if (list.length === 0) {
      return { ranked: [], top: [], meta };
    }

    // [3] OSRM tính đường thật cho từng ứng viên (tuần tự, có fallback)
    const routed = await routeAll(originLat, originLng, list);
    meta.osrmFailures = routed.filter(
      (r) => r.route.source === 'haversine'
    ).length;

    // [4] Chấm điểm & xếp hạng
    const ranked = scoreAndRank(routed, weights);

    return {
      ranked,
      top: ranked.slice(0, topN),
      meta,
    };
  }

  // --------------------------------------------------------------------------
  // XUẤT API
  // --------------------------------------------------------------------------
  window.LabDispatch = {
    findBestLabs,
    routeOne, // export để 2B vẽ lại 1 tuyến khi cần
    haversineKm,
    PRESETS,
  };

  console.log(
    '[lab-dispatch-engine.js] ✅ Engine điều phối Phòng Xét nghiệm sẵn sàng. (window.LabDispatch)'
  );
})();
