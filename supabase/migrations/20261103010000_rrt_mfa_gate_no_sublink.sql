-- ============================================================================
-- VÁ LỖI 20261103000000_rrt_mfa_audit.sql: policy rrt_mfa_gate bọc (SELECT rrt_mfa_ok())
-- làm bảng profiles báo "infinite recursion detected in policy for relation profiles"
-- khi UPDATE. Tạo lại policy với lời gọi hàm trực tiếp. Chạy lại được nhiều lần.
-- ============================================================================
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity AND NOT c.relispartition
      AND c.relname <> 'spatial_ref_sys'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rrt_mfa_gate ON public.%I', r.relname);
    EXECUTE format(
      'CREATE POLICY rrt_mfa_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.rrt_mfa_ok()) WITH CHECK (public.rrt_mfa_ok())',
      r.relname);
  END LOOP;
END $$;
COMMIT;
