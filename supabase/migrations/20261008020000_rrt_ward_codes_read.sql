-- ============================================================================
-- Danh mục 168 xã/phường/đặc khu (ward_codes): cho tài khoản đăng nhập ĐỌC.
--
-- Vì sao: bảng bật RLS nhưng không có quy tắc nào → webapp không đọc được danh
-- mục để thống kê lịch trực theo ngày (bao nhiêu Trạm Y tế có lịch / chưa có —
-- góp ý diễn tập 08/10, 1.2 & 1.5). Đây là danh mục hành chính công khai (tên +
-- mã xã), không có dữ liệu cá nhân. Chỉ đọc; ghi vẫn bị chặn như cũ.
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP POLICY IF EXISTS ward_codes_read ON public.ward_codes;
-- ============================================================================
BEGIN;
DROP POLICY IF EXISTS ward_codes_read ON public.ward_codes;
CREATE POLICY ward_codes_read ON public.ward_codes FOR SELECT TO authenticated USING (true);
COMMIT;
