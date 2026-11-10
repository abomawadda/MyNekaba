-- Phase 1: account flows (registration by job code, admin approval, recovery).
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Rate limiting for unauthenticated flows. Service role only (RLS on, no policies).
create table public.auth_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null,             -- register | recover
  subject    text not null,             -- job code or ip
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup on public.auth_attempts (kind, subject, created_at desc);
alter table public.auth_attempts enable row level security;

create table public.recovery_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  handled_by  uuid references auth.users (id),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index recovery_requests_profile_idx on public.recovery_requests (profile_id);
create unique index recovery_requests_one_pending on public.recovery_requests (profile_id) where status = 'pending';
alter table public.recovery_requests enable row level security;
create policy recovery_admin_read on public.recovery_requests for select to authenticated using (public.is_admin());

-- A user may clear their own must_change_password flag only through this function (after changing password).
create or replace function public.ack_password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;
revoke execute on function public.ack_password_changed() from anon, public;
grant execute on function public.ack_password_changed() to authenticated;

-- Members read their own profile joined with member record in one call.
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'role', p.role, 'account_status', p.account_status, 'username', p.username,
    'display_name', p.display_name, 'title', p.title, 'phone', p.phone, 'email', p.email,
    'member_id', p.member_id, 'must_change_password', p.must_change_password,
    'permission_overrides', p.permission_overrides,
    'member', case when m.id is null then null else to_jsonb(m) - 'legacy_data' end
  )
  from public.profiles p left join public.members m on m.id = p.member_id
  where p.id = auth.uid()
$$;
revoke execute on function public.my_account() from anon, public;
grant execute on function public.my_account() to authenticated;

-- must_change_password becomes a protected field (cleared only via ack_password_changed()).
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if not public.is_admin() and (
       new.role is distinct from old.role
    or new.account_status is distinct from old.account_status
    or new.member_id is distinct from old.member_id
    or new.permission_overrides is distinct from old.permission_overrides
    or new.legacy_account_id is distinct from old.legacy_account_id
    or new.approved_by is distinct from old.approved_by
    or new.must_change_password is distinct from old.must_change_password
    or new.username is distinct from old.username
  ) then
    raise exception 'not allowed to change protected profile fields';
  end if;
  return new;
end $$;
