// ============================================================
// PHẢN HỒI SỰ KIỆN — Thành viên xác nhận / từ chối tham gia
// (gộp bản trong roster.js và bản vá cũ trong fix-patches.js — bản vá không
//  bao giờ có hiệu lực vì roster.js gán lại hàm trong DOMContentLoaded)
// ============================================================

/**
 * Cập nhật danh sách members / declined_members của sự kiện.
 * Ưu tiên RPC atomic `update_incident_membership` (tránh mất dữ liệu khi 2
 * người phản hồi cùng lúc). Nếu database chưa có RPC này thì quay về cách cũ
 * (đọc → sửa → ghi) để không làm hỏng chức năng.
 */
async function updateIncidentMembership(incidentId, email, actionType) {
  const { error: rpcErr } = await window.supabaseClient.rpc(
    'update_incident_membership',
    { p_incident_id: incidentId, p_email: email, p_action: actionType }
  );
  if (!rpcErr) return;

  const rpcMissing =
    rpcErr.code === 'PGRST202' || /could not find the function/i.test(rpcErr.message || '');
  if (!rpcMissing) throw rpcErr;
  console.warn('[submitIncidentResponse] Chưa có RPC update_incident_membership, dùng cách cũ.');

  const { data: inc, error: fetchErr } = await window.supabaseClient
    .from('incidents')
    .select('members, declined_members')
    .eq('id', incidentId)
    .single();
  if (fetchErr) throw fetchErr;

  const split = (s) =>
    (s || '')
      .split(';')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  let confirmedArr = split(inc.members);
  let declinedArr = split(inc.declined_members);

  if (actionType === 'confirm') {
    if (!confirmedArr.includes(email)) confirmedArr.push(email);
    declinedArr = declinedArr.filter((e) => e !== email);
  } else if (actionType === 'decline') {
    if (!declinedArr.includes(email)) declinedArr.push(email);
    confirmedArr = confirmedArr.filter((e) => e !== email);
  }

  const { error: updateErr } = await window.supabaseClient
    .from('incidents')
    .update({
      members: confirmedArr.join(';'),
      declined_members: declinedArr.join(';'),
      confirmations: confirmedArr.length,
    })
    .eq('id', incidentId);
  if (updateErr) throw updateErr;
}

/**
 * Ghi lịch sử điều động: cập nhật bản ghi có sẵn, chưa có thì tạo mới.
 * Lỗi ở bước này chỉ cảnh báo, không chặn luồng chính.
 */
async function recordDeploymentHistory(incidentId, userId, actionType) {
  const stdAction = actionType === 'confirm' ? 'deployed' : 'declined';
  const stdReason =
    actionType === 'confirm'
      ? 'Xác nhận tham gia (trong app)'
      : 'Không thể tham gia (trong app)';

  const { data: updated, error: updErr } = await window.supabaseClient
    .from('deployment_history')
    .update({ action_type: stdAction, reason: stdReason })
    .eq('incident_id', incidentId)
    .eq('user_id', userId)
    // Không gồm 'replace_in': dòng thay quân (user_id = người bị thay) phải giữ nguyên
    .in('action_type', ['deployed', 'declined'])
    .select('id');
  if (updErr) {
    console.warn('Lỗi lưu lịch sử thực chiến:', updErr);
    return;
  }
  if (!updated || updated.length === 0) {
    const { error: insErr } = await window.supabaseClient
      .from('deployment_history')
      .insert({
        incident_id: incidentId,
        user_id: userId,
        action_type: stdAction,
        reason: stdReason,
      });
    if (insErr) console.warn('Lỗi lưu lịch sử thực chiến:', insErr);
  }
}

window.submitIncidentResponse = async function (actionType) {
  const incidentId = window.selectedIncidentId;
  if (!incidentId) return;

  const myEmail = String(window.userSession?.email || '')
    .toLowerCase()
    .trim();
  const myUserId = window.getCurrentUserId?.() || window.userSession?.id;

  if (!myEmail) {
    showToast('Lỗi: Không tìm thấy email của bạn', 'error');
    return;
  }

  showLoadingSpinner();
  try {
    await updateIncidentMembership(incidentId, myEmail, actionType);

    // Đánh dấu thông báo của sự kiện này là đã đọc
    const { error: notiErr } = await window.supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('incident_id', incidentId)
      .eq('user_email', myEmail)
      .eq('is_read', false);
    if (notiErr) console.warn('Lỗi đánh dấu thông báo đã đọc:', notiErr);

    if (myUserId) await recordDeploymentHistory(incidentId, myUserId, actionType);

    // Danh sách thành viên đã đổi → bỏ cache sự kiện
    window.QueryCache?.invalidate('incidents');

    showToast(
      actionType === 'confirm' ? 'Đã xác nhận tham gia!' : 'Không thể tham gia!',
      'success'
    );

    // Làm mới giao diện
    const { data: updatedInc } = await window.supabaseClient
      .from('incidents')
      .select('*')
      .eq('id', incidentId)
      .single();

    if (updatedInc) {
      const newIncString = encodeURIComponent(JSON.stringify(updatedInc));
      window.currentDossierString = newIncString;
      const list = window.appState?.trackingIncidents;
      if (list) {
        const idx = list.findIndex((i) => String(i.id) === String(updatedInc.id));
        if (idx !== -1) list[idx] = updatedInc;
      }
      if (typeof window.openDossierView === 'function')
        window.openDossierView(newIncString);
    }
    if (typeof window.renderTrackingPage === 'function')
      window.renderTrackingPage(true);
    if (!window.isUserAdmin?.() && typeof window.renderUserDashboard === 'function')
      window.renderUserDashboard();
  } catch (error) {
    console.error('[submitIncidentResponse] Lỗi:', error);
    showToast('Lỗi hệ thống: ' + error.message, 'error');
  } finally {
    hideLoadingSpinner();
  }
};
