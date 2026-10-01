-- ============================================================================
-- Địa điểm trực cho lịch trực định kỳ (roster_schedules.location_text).
--
-- Vì sao: email/Telegram lịch trực luôn ghi "Địa điểm sự kiện: Trực tại đơn vị /
-- Theo phân công". Quản trị HCDC / tuyến cơ sở cần nhập địa điểm cụ thể (góp ý
-- buổi tập dượt 01/10). send-notification-free đọc cột này nếu có giá trị.
--
-- Chỉ THÊM cột cho phép NULL: dữ liệu cũ, LIMS, RLS hiện có không đổi.
-- Chạy lại được nhiều lần.
-- Gỡ bỏ: ALTER TABLE public.roster_schedules DROP COLUMN IF EXISTS location_text;
-- ============================================================================
BEGIN;

ALTER TABLE public.roster_schedules
  ADD COLUMN IF NOT EXISTS location_text text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roster_schedules_location_text_len'
      AND conrelid = 'public.roster_schedules'::regclass
  ) THEN
    ALTER TABLE public.roster_schedules
      ADD CONSTRAINT roster_schedules_location_text_len
      CHECK (location_text IS NULL OR char_length(location_text) <= 300);
  END IF;
END $$;

COMMENT ON COLUMN public.roster_schedules.location_text IS
  'Địa điểm trực (tùy chọn) — hiện ở email/Telegram thông báo lịch trực';

COMMIT;
