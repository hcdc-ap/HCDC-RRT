// ============================================================================
// ENGINE ĐIỀU PHỐI PXN — BẢN CHỐT (quy trình mới 2026)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// GIỮ NGUYÊN (đang tốt):
//   • Gọi RPC find_candidate_labs (DB lọc BSL CỨNG + năng lực + công suất)
//   • OSRM đường ĐI THẬT (km + phút), fallback Haversine
//   • Gọi tuần tự có giãn cách né rate-limit
// THÊM MỚI (theo quy trình chuyên gia nhập tiêu chí):
//   • Truyền p_min_bsl / p_min_qsm / p_max_turnaround xuống RPC
//   • Chấm điểm 5 CHIỀU: Gần + Trống + Nhanh + Chất lượng(QSM) + Mạng lưới(tier)
//   • Giữ cờ cảnh báo từ RPC (warn_qsm/warn_capacity/warn_turnaround) cho UI
//   • Thêm preset 'quality' (ưu tiên chất lượng)
//
// NHÚNG: <script src="lab-dispatch-engine.js"></script>  (sau lab-admin.js)
//
// TEST NHANH trong Console:
//   const r = await window.LabDispatch.findBestLabs({
//     testTypeId: '<uuid loại XN>', sampleCount: 50,
//     originLat: 10.7769, originLng: 106.7009,
//     preset: 'balanced', minQsm: 4, maxTurnaround: 24
//   });
//   console.table(r.ranked);
// ============================================================================

(function () {
  'use strict';

  const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
  const OSRM_TIMEOUT_MS = 4000;
  const OSRM_GAP_MS = 250;

  // Preset trọng số (tổng = 1.0). 5 chiều:
  //   near = gần (phút đi thật) · free = còn công suất · fast = trả KQ nhanh
  //   qual = chất lượng (QSM) · net = phân cấp mạng lưới
  const PRESETS = {
    urgent:   { near: 0.40, free: 0.10, fast: 0.30, qual: 0.10, net: 0.10, label: '⚡ Khẩn — ưu tiên tốc độ' },
    balanced: { near: 0.25, free: 0.20, fast: 0.20, qual: 0.20, net: 0.15, label: '⚖️ Cân bằng' },
    capacity: { near: 0.15, free: 0.45, fast: 0.15, qual: 0.15, net: 0.10, label: '📦 Nhiều mẫu — ưu tiên công suất' },
    quality:  { near: 0.15, free: 0.10, fast: 0.15, qual: 0.40, net: 0.20, label: '🏅 Ưu tiên chất lượng (QSM)' },
  };

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

  async function routeOne(originLat, originLng, destLat, destLng) {
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
        geometry: route.geometry,
        source: 'osrm',
      };
    } catch (err) {
      clearTimeout(timer);
      const km = +haversineKm(originLat, originLng, destLat, destLng).toFixed(2);
      return {
        km,
        minutes: Math.round((km / 30) * 60),
        geometry: {
          type: 'LineString',
          coordinates: [
            [originLng, originLat],
            [destLng, destLat],
          ],
        },
        source: 'haversine',
        _reason: err.message,
      };
    }
  }

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
  // CHẤM ĐIỂM 5 CHIỀU
  //   diemGan  = 100*(1 - phút/phútXaNhất)            gần/nhanh tới nơi
  //   diemTrong= 100*(còn lại / công suất tối đa)      còn nhiều chỗ
  //   diemNhanh= 100*(1 - trảKQ/trảKQchậmNhất)         trả KQ nhanh
  //   diemChatLuong = 100*(qsm_level/5)                QSM cao (0..5)
  //   diemMangLuoi  = 100*(network_tier/5)             phân cấp mạng lưới (0..5)
  //   tổng = Σ diem_i * weight_i
  // --------------------------------------------------------------------------
  function scoreAndRank(routed, weights) {
    if (!routed.length) return [];

    const maxMinutes = Math.max(...routed.map((r) => r.route.minutes || 0), 1);
    const maxTurnaround = Math.max(...routed.map((r) => r.turnaround_hours ?? 0), 1);

    const scored = routed.map((r) => {
      const minutes = r.route.minutes || 0;
      const remaining = r.remaining_today ?? 0;
      const maxCap = r.max_capacity_per_day || 1;
      const turnaround = r.turnaround_hours ?? maxTurnaround;
      const qsm = r.qsm_level ?? 0;              // 0..5
      const netTier = r.capability_tier ?? 0;    // 0..5 (chỉ số TÍNH từ QSM + kỹ thuật)

      const diemGan = 100 * (1 - minutes / maxMinutes);
      const diemTrong = 100 * Math.max(0, Math.min(1, remaining / maxCap));
      const diemNhanh = 100 * (1 - turnaround / maxTurnaround);
      const diemChatLuong = 100 * Math.max(0, Math.min(1, qsm / 5));
      const diemMangLuoi = 100 * Math.max(0, Math.min(1, netTier / 5));

      const total =
        diemGan * weights.near +
        diemTrong * weights.free +
        diemNhanh * weights.fast +
        diemChatLuong * (weights.qual || 0) +
        diemMangLuoi * (weights.net || 0);

      return {
        ...r,
        scores: {
          gan: Math.round(diemGan),
          trong: Math.round(diemTrong),
          nhanh: Math.round(diemNhanh),
          chatLuong: Math.round(diemChatLuong),
          mangLuoi: Math.round(diemMangLuoi),
          total: Math.round(total * 10) / 10,
        },
      };
    });

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
  //     preset ('urgent'|'balanced'|'capacity'|'quality') hoặc weights {near,free,fast,qual,net},
  //     minBsl (override BSL yêu cầu — CỨNG), minQsm (ưu tiên), maxTurnaround (ưu tiên),
  //     excludeLabIds [], candidateLimit (10), topN (3), includeFull (true)
  //   }
  //   Trả về: { ranked, top, meta }
  // --------------------------------------------------------------------------
  async function findBestLabs(opts) {
    const {
      testTypeId,
      sampleCount = 1,
      originLat,
      originLng,
      preset = 'balanced',
      weights: customWeights,
      minBsl = null,
      minQsm = null,
      maxTurnaround = null,
      excludeLabIds = [],
      candidateLimit = 10,
      topN = 3,
      includeFull = true,
    } = opts || {};

    if (!testTypeId) throw new Error('Thiếu testTypeId');
    if (originLat == null || originLng == null)
      throw new Error('Thiếu tọa độ điểm sự cố (originLat/originLng)');

    const weights = customWeights || PRESETS[preset] || PRESETS.balanced;

    // [1] DB lọc BSL CỨNG + năng lực + công suất, trả ~N PXN kèm QSM/tier/đầu mối
    const { data: candidates, error } = await window.supabaseClient.rpc(
      'find_candidate_labs',
      {
        p_test_type_id: testTypeId,
        p_sample_count: sampleCount,
        p_lat: originLat,
        p_lng: originLng,
        p_limit: candidateLimit,
        p_include_full: includeFull,
        p_min_bsl: minBsl,
        p_min_qsm: minQsm,
        p_max_turnaround: maxTurnaround,
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
      criteria: { minBsl, minQsm, maxTurnaround },
      osrmFailures: 0,
    };

    if (list.length === 0) return { ranked: [], top: [], meta };

    // [2] OSRM đường thật cho từng ứng viên
    const routed = await routeAll(originLat, originLng, list);
    meta.osrmFailures = routed.filter((r) => r.route.source === 'haversine').length;

    // [3] Chấm điểm 5 chiều & xếp hạng
    const ranked = scoreAndRank(routed, weights);

    return { ranked, top: ranked.slice(0, topN), meta };
  }

  window.LabDispatch = {
    findBestLabs,
    routeOne,
    haversineKm,
    PRESETS,
  };

  console.log(
    '[lab-dispatch-engine.js] ✅ Engine điều phối PXN (5 chiều: gần/trống/nhanh/chất lượng/mạng lưới) sẵn sàng.'
  );
})();
