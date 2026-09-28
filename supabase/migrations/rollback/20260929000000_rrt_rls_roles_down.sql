-- HOÀN TÁC migration 20260929000000_rrt_rls_roles.sql: trả policy RRT về như
-- ảnh chụp schema 20260928000000_remote_schema.sql. CHỈ dùng khi migration mới
-- làm hỏng chức năng — trạng thái cũ có lỗ hổng (xem đầu file migration).
-- Hoàn tác luôn các migration bổ sung 20260929010000_*, 20260929020000_*, 20260929030000_*, 20260929040000_*.
-- Không hoàn tác cột registration_status đã được điền 'approved' (vô hại).
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename = ANY (ARRAY['incidents', 'incident_logs', 'incident_reports', 'incident_plans', 'incident_assessments', 'incident_objectives', 'incident_activities', 'incident_logistics', 'deployment_history', 'notifications', 'roster_schedules', 'roster_assignments', 'rrt_qualifications', 'logistics_items', 'logistics_logs', 'library_docs', 'helpers', 'helpers_backup_pre_fix'])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS p_self_update ON public.profiles;
DROP POLICY IF EXISTS p_self_insert ON public.profiles;

DROP TRIGGER IF EXISTS trg_rrt_sync_registration_status ON public.profiles;
DROP TRIGGER IF EXISTS trg_rrt_profiles_guard ON public.profiles;
DROP TRIGGER IF EXISTS trg_rrt_incidents_guard ON public.incidents;
DROP TRIGGER IF EXISTS trg_rrt_roster_assignments_guard ON public.roster_assignments;
DROP TRIGGER IF EXISTS trg_rrt_notifications_guard ON public.notifications;
ALTER TABLE public.roster_schedules ALTER COLUMN created_by DROP DEFAULT;

-- Policy cũ
CREATE POLICY "authenticated_full_access" ON "public"."deployment_history" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."helpers" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_activities" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_assessments" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_logistics" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Allow all" ON "public"."incident_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_objectives" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_plans" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_reports" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Super_Admin_duoc_tao_o_dich" ON "public"."incidents" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));
CREATE POLICY "incidents_delete_auth" ON "public"."incidents" AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);
CREATE POLICY "incidents_insert_auth" ON "public"."incidents" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "incidents_select_scoped" ON "public"."incidents" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'ward_admin'::text) AND (p.workplace_ma_xa IS NOT NULL) AND (p.workplace_ma_xa = incidents.ma_xa)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.email IS NOT NULL) AND ((((';'::text || COALESCE(incidents.members, ''::text)) || ';'::text) ~~ (('%;'::text || p.email) || ';%'::text)) OR (((';'::text || COALESCE(incidents.initial_selected_members, ''::text)) || ';'::text) ~~ (('%;'::text || p.email) || ';%'::text))))))));
CREATE POLICY "incidents_update_auth" ON "public"."incidents" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admin can delete library docs" ON "public"."library_docs" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) OR (updated_by = auth.uid())));
CREATE POLICY "Allow authenticated users to insert" ON "public"."library_docs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Authenticated users can create library docs" ON "public"."library_docs" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Authenticated users can update library docs" ON "public"."library_docs" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can view library docs" ON "public"."library_docs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "authenticated_full_access" ON "public"."library_docs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Enable read access for all users" ON "public"."logistics_items" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "authenticated_full_access" ON "public"."logistics_items" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."logistics_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."notifications" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."roster_assignments" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."roster_schedules" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."rrt_qualifications" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- RPC cũ
CREATE OR REPLACE FUNCTION public.update_incident_membership(p_incident_id uuid, p_email text, p_action text)
 RETURNS TABLE(members text, declined_members text, confirmations integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(p_email));
  v_members_raw text;
  v_declined_raw text;
  v_confirmations int;
  v_members text[];
  v_declined text[];
begin
  if p_action not in ('confirm', 'decline') then
    raise exception 'invalid action: %', p_action;
  end if;

  if v_email = '' or v_email is null then
    raise exception 'email is required';
  end if;

  -- Khoá dòng incident trong lúc tính toán để 2 request đồng thời không đè lên nhau
  select i.members, i.declined_members, coalesce(i.confirmations, 0)
    into v_members_raw, v_declined_raw, v_confirmations
  from public.incidents i
  where i.id = p_incident_id
  for update;

  if not found then
    raise exception 'incident % not found', p_incident_id;
  end if;

  -- Tách chuỗi ";" thành mảng, chuẩn hoá lower/trim từng phần tử (giữ đúng
  -- hành vi cũ vốn chuẩn hoá lại toàn bộ mảng mỗi lần đọc), bỏ phần tử rỗng.
  select coalesce(array_agg(lower(trim(x))), '{}')
    into v_members
  from unnest(
    case when coalesce(v_members_raw, '') = '' then '{}'::text[]
         else string_to_array(v_members_raw, ';') end
  ) as x
  where trim(x) <> '';

  select coalesce(array_agg(lower(trim(x))), '{}')
    into v_declined
  from unnest(
    case when coalesce(v_declined_raw, '') = '' then '{}'::text[]
         else string_to_array(v_declined_raw, ';') end
  ) as x
  where trim(x) <> '';

  if p_action = 'confirm' then
    if not (v_email = any (v_members)) then
      v_members := v_members || v_email;
      v_confirmations := v_confirmations + 1;
    end if;
    v_declined := array_remove(v_declined, v_email);
  else
    if not (v_email = any (v_declined)) then
      v_declined := v_declined || v_email;
    end if;
    if v_email = any (v_members) then
      v_members := array_remove(v_members, v_email);
      v_confirmations := greatest(0, v_confirmations - 1);
    end if;
  end if;

  update public.incidents
  set members = case when array_length(v_members, 1) is null then null else array_to_string(v_members, ';') end,
      declined_members = case when array_length(v_declined, 1) is null then null else array_to_string(v_declined, ';') end,
      confirmations = v_confirmations
  where id = p_incident_id;

  return query select
    (case when array_length(v_members, 1) is null then null else array_to_string(v_members, ';') end),
    (case when array_length(v_declined, 1) is null then null else array_to_string(v_declined, ';') end),
    v_confirmations;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.update_incident_membership(uuid, text, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rrt_sync_registration_status();
DROP FUNCTION IF EXISTS public.rrt_profiles_guard();
DROP FUNCTION IF EXISTS public.rrt_incidents_guard();
DROP FUNCTION IF EXISTS public.rrt_roster_assignments_guard();
DROP FUNCTION IF EXISTS public.rrt_notifications_guard();
DROP FUNCTION IF EXISTS public.rrt_can_manage_schedule(uuid);
DROP FUNCTION IF EXISTS public.rrt_email_in_managed_incident(text, uuid);
DROP FUNCTION IF EXISTS public.rrt_is_me(text);
DROP POLICY IF EXISTS rrt_insert_suggestion ON public.lab_dispatch_log;
-- 20260929040000: trả quyền đọc cả bảng (kể cả action_token) như cũ
GRANT SELECT ON public.lab_dispatch_log TO anon, authenticated;
DROP FUNCTION IF EXISTS public.rrt_notify_admins(text, uuid);
DROP FUNCTION IF EXISTS public.rrt_is_leader();
DROP FUNCTION IF EXISTS public.rrt_can_view_schedule(uuid);
DROP FUNCTION IF EXISTS public.rrt_can_view_schedule_row(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.rrt_can_view_incident(uuid);
DROP FUNCTION IF EXISTS public.rrt_can_manage_incident(uuid);
DROP FUNCTION IF EXISTS public.rrt_email_in_list(text, text);
DROP FUNCTION IF EXISTS public.rrt_email_in_my_ward(text);
DROP FUNCTION IF EXISTS public.rrt_profile_in_my_ward(uuid);
DROP FUNCTION IF EXISTS public.rrt_my_email();
DROP FUNCTION IF EXISTS public.rrt_is_ward_admin();
DROP FUNCTION IF EXISTS public.rrt_is_approved();
DROP FUNCTION IF EXISTS public.rrt_is_admin();

COMMIT;
