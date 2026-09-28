-- Giả lập phần tối thiểu của Supabase trên Postgres thường để chạy test RLS:
-- role anon/authenticated/service_role và auth.uid()/auth.role() đọc từ
-- request.jwt.claims (giống PostgREST).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA supabase_functions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('request.jwt.claims', true)::json->>'role', 'anon') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT current_setting('request.jwt.claims', true)::json->>'email' $$;
-- Webhook gửi thông báo: bỏ qua khi test
CREATE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RETURN NEW; END $$;
GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
