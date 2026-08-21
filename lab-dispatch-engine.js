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
//   • Chấm điểm 5 CHIỀU: Gần + Trống + Nhanh + Chất lượng(QMS) + Mạng lưới(tier)
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
  //   qual = chất lượng (QMS) · net = phân cấp mạng lưới
  const PRESETS = {
    urgent: {
      near: 0.4,
      free: 0.1,
      fast: 0.3,
      qual: 0.1,
      net: 0.1,
      label: '⚡ Khẩn — ưu tiên tốc độ',
    },
    balanced: {
      near: 0.25,
      free: 0.2,
      fast: 0.2,
      qual: 0.2,
      net: 0.15,
      label: '⚖️ Cân bằng',
    },
    capacity: {
      near: 0.15,
      free: 0.45,
      fast: 0.15,
      qual: 0.15,
      net: 0.1,
      label: '📦 Nhiều mẫu — ưu tiên công suất',
    },
    quality: {
      near: 0.15,
      free: 0.1,
      fast: 0.15,
      qual: 0.4,
      net: 0.2,
      label: '🏅 Ưu tiên chất lượng (QMS & năng lực xét nghiệm)',
    },
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
 // Hệ số dích dắc đặc thù TPHCM (hẻm, đường 1 chiều, vòng xoay)
 const ROUTING_FACTOR = 1.45; 
 // Thời gian hao phí cố định cho việc đỗ xe và bàn giao mẫu (phút)
 const OVERHEAD_MINUTES = 5; 

 // Vận tốc (km/h) theo giờ thực tế tại TPHCM
 function getSpeedByHour(date) {
   const vn = new Date(
     (date || new Date()).toLocaleString('en-US', {
       timeZone: 'Asia/Ho_Chi_Minh',
     })
   );
   const h = vn.getHours();
   const m = vn.getMinutes();
   const t = h * 60 + m; 

   const between = (a, b) => t >= a && t < b;

   // Cao điểm: 07:00–08:30 và 16:30–18:30 (Kẹt xe)
   if (between(420, 510) || between(990, 1110)) {
     return { speed: 12, label: 'Giờ cao điểm', level: 'peak' };
   }
   // Ban đêm: 22:00–06:00 (Vắng xe, ít dừng đèn đỏ)
   if (t >= 1320 || t < 360) {
     return { speed: 30, label: 'Giờ thấp điểm', level: 'night' };
   }
   // Bình thường: Tốc độ đô thị tiêu chuẩn
   return { speed: 18, label: 'Giờ bình thường', level: 'normal' };
 }

 // Ước tính quãng đường + thời gian OFFLINE
 function estimateTravel(originLat, originLng, destLat, destLng, atDate) {
   // Lưu ý: Đảm bảo hàm haversineKm đã được định nghĩa ở nơi khác trong script
   const straightKm = haversineKm(originLat, originLng, destLat, destLng);
   const roadKm = +(straightKm * ROUTING_FACTOR).toFixed(2);
   
   const { speed, label, level } = getSpeedByHour(atDate);
   
   // Tính phút di chuyển lăn bánh + hao phí giao nhận (nếu có di chuyển thực tế)
   let minutes = Math.round((roadKm / speed) * 60);
   if (roadKm > 0.1) {
     minutes += OVERHEAD_MINUTES;
   }

   return {
     km: roadKm,
     minutes,
     speed,
     trafficLabel: label,
     trafficLevel: level,
     source: 'offline',
     geometry: {
       type: 'LineString',
       coordinates: [
         [originLng, originLat],
         [destLng, destLat],
       ],
     },
   };
 }

 // Tính offline cho tất cả ứng viên
 async function routeAll(originLat, originLng, candidates) {
   const now = new Date();
   return (candidates || []).map((c) => ({
     ...c,
     route: estimateTravel(originLat, originLng, c.lat, c.lng, now),
   }));
 }

 // Truy vấn đơn lẻ
 function routeOne(originLat, originLng, destLat, destLng) {
   return Promise.resolve(
     estimateTravel(originLat, originLng, destLat, destLng)
   );
 }
  // --------------------------------------------------------------------------
  // CHẤM ĐIỂM 5 CHIỀU
  //   diemGan  = 100*(1 - phút/phútXaNhất)            gần/nhanh tới nơi
  //   diemTrong= 100*(còn lại / công suất tối đa)      còn nhiều chỗ
  //   diemNhanh= 100*(1 - trảKQ/trảKQchậmNhất)         trả KQ nhanh
  //   diemChatLuong = 100*(qsm_level/5)                QMS cao (0..5)
  //   diemMangLuoi  = 100*(network_tier/5)             phân cấp mạng lưới (0..5)
  //   tổng = Σ diem_i * weight_i
  // --------------------------------------------------------------------------
  // ============================================================================
  // scoreAndRank — SỬA CÔNG THỨC 5 CHIỀU (xử lý trường hợp dữ liệu ĐỒNG NHẤT)
  // ----------------------------------------------------------------------------
  // VẤN ĐỀ CŨ: khi mọi phòng cùng 1 giá trị (VD turnaround_hours=24 mặc định),
  //   diem = 100*(1 - x/max) = 100*(1 - 1) = 0 → tiêu chí đó "ăn" mất điểm oan,
  //   dù thực chất các phòng KHÔNG khác nhau ở tiêu chí này.
  // CÁCH SỬA: khi min==max (mọi phòng bằng nhau) ở một tiêu chí → cho ĐIỂM TRUNG
  //   TÍNH (50) cho tất cả, thay vì 0. Tiêu chí "trung lập" khi không phân biệt được.
  //   Đồng thời chuẩn hóa theo KHOẢNG [min,max] (không phải chia cho max) → phân biệt
  //   tốt hơn khi giá trị sát nhau. Áp dụng cho cả 3 tiêu chí có "hướng":
  //     gần (phút ít = tốt), nhanh (turnaround ít = tốt), trống (còn nhiều = tốt).
  // ============================================================================
  function scoreAndRank(routed, weights) {
    if (!routed.length) return [];

    // Gom các mảng giá trị để tính min/max từng tiêu chí
    const minutesArr = routed.map((r) => r.route.minutes || 0);
    const turnaroundArr = routed.map((r) => r.turnaround_hours ?? null);

    const minMinutes = Math.min(...minutesArr);
    const maxMinutes = Math.max(...minutesArr);

    // turnaround: chỉ tính trên giá trị có thật (bỏ null); nếu tất cả null/đồng nhất → xử lý riêng
    const validTa = turnaroundArr.filter((v) => v != null);
    const minTa = validTa.length ? Math.min(...validTa) : null;
    const maxTa = validTa.length ? Math.max(...validTa) : null;

    // Helper chuẩn hóa "ít hơn = tốt hơn" theo khoảng [min,max].
    //   - Nếu min==max (mọi phòng bằng nhau) → trả 50 (trung lập, không phân biệt).
    //   - value nhỏ nhất → 100 điểm; lớn nhất → 0 điểm.
    const scoreLowerBetter = (value, mn, mx) => {
      if (value == null || mn == null || mx == null) return 50; // thiếu dữ liệu → trung lập
      if (mx === mn) return 50; // đồng nhất → trung lập
      return 100 * (1 - (value - mn) / (mx - mn));
    };

    const scored = routed.map((r) => {
      const minutes = r.route.minutes || 0;
      const remaining = r.remaining_today ?? 0;
      const maxCap = r.max_capacity_per_day || 1;
      const turnaround = r.turnaround_hours ?? null;
      const qsm = r.qsm_level ?? 0; // 0..5
      const netTier = r.capability_tier ?? 0; // 0..5

      // GẦN: phút ít = tốt (chuẩn hóa theo khoảng, đồng nhất → 50)
      const diemGan = scoreLowerBetter(minutes, minMinutes, maxMinutes);
      // TRỐNG: còn nhiều chỗ = tốt (tỉ lệ còn lại / công suất; giữ nguyên logic tốt)
      const diemTrong = 100 * Math.max(0, Math.min(1, remaining / maxCap));
      // NHANH: turnaround ít = tốt (chuẩn hóa theo khoảng; đồng nhất/null → 50)
      const diemNhanh = scoreLowerBetter(turnaround, minTa, maxTa);
      // CHẤT LƯỢNG: QMS 0..5
      const diemChatLuong = 100 * Math.max(0, Math.min(1, qsm / 5));
      // MẠNG LƯỚI: tier 0..5
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
  // ============================================================================
  // ƯU TIÊN PXN CÔNG LẬP (Cách B — group riêng)
  //   Công lập LUÔN xếp trên, tư nhân LUÔN xếp dưới; trong mỗi nhóm xếp theo điểm.
  //   Nhận diện tư nhân: field `level` chứa chữ "tư nhân".
  // ----------------------------------------------------------------------------
  // GHÉP vào lab-dispatch-engine.js: đặt hàm này trong IIFE (cạnh scoreAndRank).
  // Gọi NGAY SAU khi đã tính điểm + sort theo total, TRƯỚC khi cắt `top` & gán rank.
  // ============================================================================

  window.isPrivateLab = function (lab) {
    return String(lab.level || '')
      .toLowerCase()
      .includes('tư nhân');
  };
  window.regroupPublicFirst = function (scoredLabs) {
    const cong = [],
      tu = [];
    (scoredLabs || []).forEach((lab) => {
      (window.isPrivateLab(lab) ? tu : cong).push(lab);
    });
    const byScoreDesc = (a, b) =>
      (b.scores?.total ?? 0) - (a.scores?.total ?? 0);
    cong.sort(byScoreDesc);
    tu.sort(byScoreDesc);
    const merged = [...cong, ...tu];
    merged.forEach((lab, i) => {
      lab.rank = i + 1;
      lab.sector = window.isPrivateLab(lab) ? 'tu_nhan' : 'cong_lap';
    });
    return merged;
  };

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
      testTypeIds,
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

    // Chuẩn hóa về MẢNG uuid (ưu tiên testTypeIds; nếu chỉ có testTypeId → bọc mảng)
    const ttIds =
      Array.isArray(testTypeIds) && testTypeIds.length
        ? testTypeIds
        : testTypeId
        ? [testTypeId]
        : [];
    if (!ttIds.length)
      throw new Error('Thiếu kỹ thuật xét nghiệm (testTypeIds)');
    if (originLat == null || originLng == null)
      throw new Error(
        'Thiếu tọa độ điểm sự kiện khẩn cấp (originLat/originLng)'
      );

    const weights = customWeights || PRESETS[preset] || PRESETS.balanced;

    // [1] DB lọc BSL CỨNG + năng lực + công suất, trả ~N PXN kèm QMS/tier/đầu mối
    const { data: candidates, error } = await window.supabaseClient.rpc(
      'find_candidate_labs',
      {
        p_test_type_ids: ttIds,
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
    meta.routingMode = 'offline';
    meta.trafficInfo = routed[0]?.route?.trafficLabel || '';

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
