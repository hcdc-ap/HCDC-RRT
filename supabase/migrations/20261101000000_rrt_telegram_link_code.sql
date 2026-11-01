-- ============================================================================
-- LIÊN KẾT TELEGRAM BẰNG MÃ DÙNG MỘT LẦN + COPY HỌ TÊN/ĐƠN VỊ/ĐIỆN THOẠI LÚC ĐĂNG KÝ
-- ============================================================================
-- Vì sao:
--  1. Bot Telegram trước đây gắn mã chat vào hồ sơ của BẤT KỲ email nào người gửi
--     gõ vào (không xác thực) -> người ngoài biết email đồng nghiệp là nhận được
--     thông báo điều động của họ. Nay người dùng đăng nhập app, bấm "Liên kết
--     Telegram" để lấy mã 10 ký tự (hiệu lực 10 phút, dùng một lần) rồi gửi cho bot.
--  2. Khi bật "Confirm email", signUp chưa có phiên đăng nhập nên app không ghi được
--     họ tên/đơn vị/điện thoại vào profiles (RLS). App gửi kèm metadata, trigger
--     handle_new_user copy vào hồ sơ.
--
-- Chỉ THÊM: 1 bảng, 1 hàm mới, và sửa handle_new_user (giữ nguyên hành vi cũ khi
-- không có metadata, nên luồng mời tài khoản của LIMS không đổi).
-- Hoàn tác: supabase/migrations/rollback/20261101000000_rrt_telegram_link_code_down.sql
-- ============================================================================

BEGIN;

-- 1. Bảng mã liên kết: chỉ lưu bản băm SHA-256, chỉ service_role (Edge Function) đọc/ghi.
CREATE TABLE IF NOT EXISTS public.rrt_telegram_link_codes (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rrt_tg_link_code_hash ON public.rrt_telegram_link_codes (code_hash);
ALTER TABLE public.rrt_telegram_link_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrt_telegram_link_codes FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrt_telegram_link_codes TO service_role;
-- Không tạo policy: RLS bật + không policy = người dùng thường không thấy dòng nào.

-- 2. Người dùng đã đăng nhập tự xin mã cho chính mình.
CREATE OR REPLACE FUNCTION public.rrt_create_telegram_link_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '28000';
  END IF;
  -- 10 ký tự hex (40 bit) từ gen_random_uuid(); hiệu lực 10 phút, dùng một lần
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.rrt_telegram_link_codes (user_id, code_hash, expires_at)
  VALUES (v_uid, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '10 minutes')
  ON CONFLICT (user_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, created_at = now();
  RETURN v_code;
END;
$$;
-- Supabase tự cấp EXECUTE cho anon/authenticated: thu hồi anon, giữ authenticated.
REVOKE ALL ON FUNCTION public.rrt_create_telegram_link_code() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_create_telegram_link_code() TO authenticated;

-- 3. handle_new_user: copy họ tên/đơn vị/điện thoại từ metadata đăng ký (nếu có).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, approval_status, role, full_name, department, phone)
  values (
    new.id, new.email, 'pending', 'user',
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 200), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'department'), 200), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'phone'), 30), '')
  );
  return new;
end;
$function$;

COMMIT;
