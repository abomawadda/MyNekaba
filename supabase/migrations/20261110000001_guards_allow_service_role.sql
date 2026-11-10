-- Guards restrict end-user sessions only; service role / direct DB access (server code, migrations) pass.
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
  ) then
    raise exception 'not allowed to change protected profile fields';
  end if;
  return new;
end $$;

create or replace function public.guard_booking_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_staff_writer() then return new; end if;
  if tg_op = 'INSERT' then
    if new.member_id is distinct from public.my_member_id() or new.requested_by is distinct from auth.uid()
       or new.status <> 'pending' or new.reviewed_by is not null then
      raise exception 'invalid booking request';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'pending' or new.status <> 'cancelled'
       or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'members may only cancel their pending requests';
    end if;
  end if;
  return new;
end $$;
