-- Security baseline: organization membership and profile exposure.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = (SELECT auth.uid())
     OR (
       p.auth_user_id IS NULL
       AND lower(p.email) = lower(coalesce((SELECT auth.email()), ''))
     )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;

DROP POLICY IF EXISTS organization_self_select ON public.organizations;
CREATE POLICY organization_self_select
  ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT private.current_organization_id()));

DROP POLICY IF EXISTS profile_self_select ON public.profiles;
CREATE POLICY profile_self_select
  ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (
      auth_user_id IS NULL
      AND lower(email) = lower(coalesce((SELECT auth.email()), ''))
    )
  );

REVOKE ALL ON TABLE public.organizations, public.profiles FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.organizations, public.profiles TO service_role;
