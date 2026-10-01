-- ============================================================================
-- Bật realtime cho tin nhắn sự kiện, lịch trực, lịch sử điều động.
--
-- Vì sao: màn hình (nhất là HCDC theo dõi diễn tập) phải hiện ngay tin nhắn mới,
-- lịch trực mới, thay đổi nhân sự — không phải bấm Refresh. Trước đây
-- supabase_realtime chỉ có incidents, notifications, roster_assignments...
--
-- Realtime vẫn áp RLS theo từng người nhận (chỉ nhận dòng mình được SELECT).
-- Chỉ THÊM bảng vào publication; không đổi dữ liệu, không ảnh hưởng LIMS.
-- Chạy lại được nhiều lần.
-- Gỡ bỏ: ALTER PUBLICATION supabase_realtime DROP TABLE public.<bảng>;
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Không có publication supabase_realtime — bỏ qua (môi trường test)';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['incident_logs', 'roster_schedules', 'deployment_history'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
