/**
 * Creating a Supabase auth account from SQL.
 *
 * GoTrue normally does this over its admin API, which needs the service
 * role key. The same account can be written directly: a bcrypt hash in
 * `auth.users` (pgcrypto does the hashing, so the plaintext never leaves
 * the database session) plus a matching `auth.identities` row.
 *
 * The identity row is the part that is easy to miss. Without it the
 * account exists, shows up in the dashboard, and cannot sign in.
 */

import type pg from "pg";

/**
 * Creates an auth user the way GoTrue does: a bcrypt hash in auth.users
 * plus an auth.identities row for the email provider. Without the
 * identity, the account exists but cannot sign in.
 */
export async function createAuthUser(
  db: pg.Client,
  opts: { email: string; password: string; fullName: string; role: string; phone?: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000',
       gen_random_uuid(), 'authenticated', 'authenticated',
       lower($1),
       extensions.crypt($2, extensions.gen_salt('bf')),
       now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', $3::text, 'role', $4::text)
         || case when $5::text is null then '{}'::jsonb
                 else jsonb_build_object('phone', $5::text) end,
       now(), now(), '', '', '', ''
     )
     returning id`,
    [opts.email, opts.password, opts.fullName, opts.role, opts.phone ?? null],
  );

  const userId = rows[0].id;

  await db.query(
    `insert into auth.identities (
       provider_id, user_id, identity_data, provider,
       last_sign_in_at, created_at, updated_at
     ) values (
       $1::text, $1::uuid,
       jsonb_build_object(
         'sub', $1::text, 'email', lower($2::text),
         'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
     )`,
    [userId, opts.email],
  );

  return userId;
}
