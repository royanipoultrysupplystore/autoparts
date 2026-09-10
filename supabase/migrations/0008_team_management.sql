-- =====================================================================
-- 0008  Team management from inside the app
--
-- Creating a Supabase account normally goes through GoTrue's admin API,
-- which needs the service role key -- a secret that unlocks everything
-- and therefore should not be sitting in a web app's environment just so
-- the owner can add a partner.
--
-- These functions do the same work in the database instead, guarded by
-- the same role check as everything else. The owner calls them with the
-- session they already have; no extra secret exists to leak.
--
-- Writing an auth account by hand means two rows, not one. `auth.users`
-- holds the bcrypt hash, and `auth.identities` holds the email provider
-- record. Without the second, the account appears in the dashboard and
-- silently cannot sign in.
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_team_member
-- ---------------------------------------------------------------------
create or replace function public.create_team_member(
  p_email     text,
  p_full_name text,
  p_role      public.user_role,
  p_password  text,
  p_phone     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth, pg_temp
as $fn$
declare
  v_email text := lower(btrim(p_email));
  v_id    uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add people to the team'
      using errcode = 'insufficient_privilege';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  -- Eight characters is GoTrue's own floor; rejecting it here means the
  -- owner is told now rather than the new person failing to sign in later.
  if p_password is null or length(p_password) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'weak_password');
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'reason', 'email_taken');
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'role', p_role::text),
    now(), now(), '', '', '', ''
  )
  returning id into v_id;

  -- The row that actually makes email sign-in work.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object(
      'sub', v_id::text, 'email', v_email,
      'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- The auth trigger creates the profile; make sure the role took, and
  -- record the phone if one was given.
  update public.profiles
     set full_name = p_full_name,
         role      = p_role,
         phone     = nullif(btrim(coalesce(p_phone, '')), ''),
         is_active = true
   where id = v_id;

  perform public.log_activity(
    'profile', v_id, 'member_added',
    format('Added %s as %s', p_full_name, p_role),
    null, jsonb_build_object('email', v_email, 'role', p_role)
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'email', v_email);
end;
$fn$;

-- ---------------------------------------------------------------------
-- set_member_role
-- ---------------------------------------------------------------------
create or replace function public.set_member_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_before public.user_role;
  v_name   text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change roles'
      using errcode = 'insufficient_privilege';
  end if;

  -- The owner cannot demote themselves. A yard with no owner has nobody
  -- who can add anyone, and the only way back is the Supabase dashboard.
  if p_user_id = auth.uid() and p_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_demote_self');
  end if;

  select role, full_name into v_before, v_name
  from public.profiles where id = p_user_id;

  if v_before is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  perform public.log_activity(
    'profile', p_user_id, 'role_changed',
    format('Changed %s from %s to %s', v_name, v_before, p_role),
    jsonb_build_object('role', v_before),
    jsonb_build_object('role', p_role)
  );

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- set_member_active
--
-- Switching someone off is the right move when they leave: their sales
-- stay attributed to them in every past report, which deleting the
-- account would take away.
-- ---------------------------------------------------------------------
create or replace function public.set_member_active(
  p_user_id uuid,
  p_active  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can switch accounts on and off'
      using errcode = 'insufficient_privilege';
  end if;

  if p_user_id = auth.uid() and not p_active then
    return jsonb_build_object('ok', false, 'reason', 'cannot_disable_self');
  end if;

  select full_name into v_name from public.profiles where id = p_user_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.profiles set is_active = p_active where id = p_user_id;

  perform public.log_activity(
    'profile', p_user_id,
    case when p_active then 'member_enabled' else 'member_disabled' end,
    format('%s %s', case when p_active then 'Re-enabled' else 'Switched off' end, v_name),
    null, jsonb_build_object('is_active', p_active)
  );

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- set_member_password
--
-- For the partner who has forgotten theirs. The owner sets a temporary
-- one and tells them in person, which in a four-person yard beats
-- waiting on a reset email that may not arrive.
-- ---------------------------------------------------------------------
create or replace function public.set_member_password(
  p_user_id  uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth, pg_temp
as $fn$
declare
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can reset a password'
      using errcode = 'insufficient_privilege';
  end if;

  if p_password is null or length(p_password) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'weak_password');
  end if;

  select full_name into v_name from public.profiles where id = p_user_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  -- Deliberately not logging who reset it beyond the fact that it
  -- happened. The password itself never goes anywhere near the log.
  perform public.log_activity(
    'profile', p_user_id, 'password_reset',
    format('Reset the password for %s', v_name),
    null, null
  );

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Only signed-in callers may even attempt these; each one then re-checks
-- that the caller is the owner.
-- ---------------------------------------------------------------------
revoke all on function public.create_team_member(text, text, public.user_role, text, text) from public, anon;
revoke all on function public.set_member_role(uuid, public.user_role) from public, anon;
revoke all on function public.set_member_active(uuid, boolean) from public, anon;
revoke all on function public.set_member_password(uuid, text) from public, anon;

grant execute on function public.create_team_member(text, text, public.user_role, text, text) to authenticated;
grant execute on function public.set_member_role(uuid, public.user_role) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.set_member_password(uuid, text) to authenticated;
