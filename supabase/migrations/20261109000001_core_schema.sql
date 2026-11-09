-- =====================================================================
-- MyNekaba — Phase 0 core schema (identity, members, activities, board, news, audit)
-- Finance tables (transactions, checks, settlements) come in phase 3.
-- Every table keeps `legacy_id` (Firestore doc id) + `legacy_data` (original doc)
-- so the Firebase import is lossless and re-runnable (upsert on legacy_id).
-- =====================================================================

create extension if not exists pg_trgm; -- moved to schema "extensions" in 000002

-- ---------- enums ----------
create type public.app_role as enum ('admin', 'treasurer', 'dataEntry', 'auditor', 'viewer', 'member');
create type public.account_status as enum ('pending_approval', 'active', 'suspended', 'rejected');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- ---------- shared trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- members (was: employees) ----------
create table public.members (
  id                uuid primary key default gen_random_uuid(),
  legacy_id         text unique,
  job_id            text unique,
  national_id       text unique,
  name              text not null,
  phone             text,
  email             text,
  gender            text,
  birth_date        date,
  hire_date         date,
  retirement_date   date,
  workplace         text,
  job_title         text,
  address           text,
  governorate       text,
  membership_status text,          -- e.g. عضو جمعية عمومية / نقابة مستقلة / رئيس المجلس ...
  member_state      text,          -- e.g. نشط / وفاة / استقالة / موقوف / معاش
  photo_ref         text,
  legacy_data       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index members_name_trgm on public.members using gin (name gin_trgm_ops);
create index members_phone_idx on public.members (phone);
create trigger members_touch before update on public.members for each row execute function public.touch_updated_at();

-- ---------- profiles (1:1 with auth.users; was: user_accounts) ----------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                public.app_role not null default 'member',
  account_status      public.account_status not null default 'pending_approval',
  member_id           uuid references public.members (id) on delete set null,
  username            text unique,
  display_name        text,
  phone               text,
  email               text,
  title               text,
  permission_overrides jsonb not null default '{}'::jsonb,
  legacy_account_id   text unique,
  legacy_data         jsonb not null default '{}'::jsonb,
  approved_by         uuid references auth.users (id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_member_idx on public.profiles (member_id);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ---------- authorization helpers (security definer => no RLS recursion) ----------
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active'
$$;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.member_id from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active'
$$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = '' as $$ select coalesce(public.my_role() = 'admin', false) $$;

create or replace function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'treasurer', 'dataEntry', 'auditor'), false) $$;

create or replace function public.is_staff_writer() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'treasurer', 'dataEntry'), false) $$;

create or replace function public.is_finance() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'treasurer'), false) $$;

-- New auth user => pending member profile (admin approves & links to a member record).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, phone, display_name)
  values (new.id, new.email, new.phone, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit only harmless profile fields; role/status/link are admin-only.
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
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
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------- member movements ----------
create table public.member_movements (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  member_id   uuid references public.members (id) on delete cascade,
  movement_type text,
  from_value  text,
  to_value    text,
  effective_date date,
  status      text,
  notes       text,
  created_by  uuid references auth.users (id),
  legacy_data jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index member_movements_member_idx on public.member_movements (member_id);

-- ---------- events ----------
create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  legacy_id            text unique,
  title                text not null,
  type                 text,
  activity_type        text,            -- union activity id (trips, resorts, ...)
  event_date           date,
  booking_start        date,
  booking_end          date,
  location             text,
  description          text,
  capacity             integer check (capacity is null or capacity >= 0),
  booked_count         integer not null default 0,
  is_free              boolean not null default false,
  is_public            boolean not null default true,
  member_price         numeric(12,2),
  companion_price      numeric(12,2),
  member_support_value numeric(12,2),
  status               text not null default 'open',
  details              jsonb not null default '{}'::jsonb,  -- device/installment/extra fields
  legacy_data          jsonb not null default '{}'::jsonb,
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index events_date_idx on public.events (event_date);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

-- ---------- event bookings ----------
create table public.event_bookings (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  event_id       uuid not null references public.events (id) on delete restrict,
  member_id      uuid not null references public.members (id) on delete restrict,
  status         public.booking_status not null default 'pending',
  total_pax      integer not null default 1 check (total_pax >= 1),
  companions     jsonb not null default '[]'::jsonb,
  total_cost     numeric(12,2) not null default 0,
  paid_amount    numeric(12,2) not null default 0,
  payment_method text,
  payment_date   date,
  notes          text,
  request_id     uuid,
  legacy_data    jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index event_bookings_event_idx on public.event_bookings (event_id);
create index event_bookings_member_idx on public.event_bookings (member_id);
create trigger event_bookings_touch before update on public.event_bookings for each row execute function public.touch_updated_at();

-- ---------- booking / service requests from the member portal ----------
create table public.booking_requests (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('event', 'service')),
  event_id     uuid references public.events (id) on delete cascade,
  service_id   text,
  member_id    uuid not null references public.members (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  companions   integer not null default 0 check (companions between 0 and 10),
  notes        text check (char_length(notes) <= 500),
  status       public.request_status not null default 'pending',
  review_note  text,
  reviewed_by  uuid references auth.users (id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  check ((kind = 'event' and event_id is not null) or (kind = 'service' and service_id is not null))
);
create index booking_requests_member_idx on public.booking_requests (member_id);
create index booking_requests_status_idx on public.booking_requests (status);
-- one open request per member per target
create unique index booking_requests_open_uniq on public.booking_requests
  (member_id, coalesce(event_id::text, service_id)) where status in ('pending', 'approved');

-- members may only create a pending request for themselves, and only cancel while pending
create or replace function public.guard_booking_request() returns trigger
language plpgsql set search_path = '' as $$
begin
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
create trigger booking_requests_guard before insert or update on public.booking_requests
  for each row execute function public.guard_booking_request();

-- ---------- member benefits ----------
create table public.member_benefits (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  member_id    uuid not null references public.members (id) on delete restrict,
  event_id     uuid references public.events (id) on delete set null,
  benefit_type text not null,
  amount       numeric(12,2) not null default 0,
  benefit_date date,
  status       text not null default 'active',
  notes        text,
  display_label text,
  legacy_data  jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index member_benefits_member_idx on public.member_benefits (member_id);

-- ---------- board ----------
create table public.board_terms (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  title       text not null,
  start_date  date,
  end_date    date,
  status      text not null default 'active',
  legacy_data jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.board_memberships (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  term_id     uuid references public.board_terms (id) on delete set null,
  member_id   uuid references public.members (id) on delete restrict,
  role        text not null,
  status      text not null default 'active',
  start_date  date,
  end_date    date,
  end_reason  text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index board_memberships_member_idx on public.board_memberships (member_id);

-- Board candidates / movements / benefits / meetings: kept as generic records until phase 2 refines them.
create table public.board_records (
  id          uuid primary key default gen_random_uuid(),
  legacy_collection text not null check (legacy_collection in ('board_candidates','board_movements','board_benefits','board_meetings')),
  legacy_id   text not null,
  member_id   uuid references public.members (id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (legacy_collection, legacy_id)
);

-- ---------- news & settings ----------
create table public.site_news (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  title       text not null,
  body        text not null,
  news_date   date not null default current_date,
  active      boolean not null default true,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger site_news_touch before update on public.site_news for each row execute function public.touch_updated_at();

create table public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- audit log (append-only) ----------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid default auth.uid(),
  action      text not null,
  target_id   text,
  page        text,
  risk_level  text not null default 'low',
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------- public, non-sensitive read model for the home page ----------
create or replace function public.public_board() returns table (name text, role text)
language sql stable security definer set search_path = '' as $$
  select m.name, bm.role
  from public.board_memberships bm join public.members m on m.id = bm.member_id
  where bm.status = 'active'
$$;

create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'member_count', (select count(*) from public.members),
    'board_count', (select count(*) from public.board_memberships where status = 'active'),
    'upcoming_events', (select count(*) from public.events where is_public and status <> 'cancelled' and event_date >= current_date)
  )
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.members           enable row level security;
alter table public.profiles          enable row level security;
alter table public.member_movements  enable row level security;
alter table public.events            enable row level security;
alter table public.event_bookings    enable row level security;
alter table public.booking_requests  enable row level security;
alter table public.member_benefits   enable row level security;
alter table public.board_terms       enable row level security;
alter table public.board_memberships enable row level security;
alter table public.board_records     enable row level security;
alter table public.site_news         enable row level security;
alter table public.settings          enable row level security;
alter table public.audit_logs        enable row level security;

-- members
create policy members_read  on public.members for select to authenticated using (public.is_staff() or public.my_role() = 'viewer' or id = public.my_member_id());
create policy members_write on public.members for insert to authenticated with check (public.is_staff_writer());
create policy members_update on public.members for update to authenticated using (public.is_staff_writer()) with check (public.is_staff_writer());
create policy members_delete on public.members for delete to authenticated using (public.is_admin());

-- profiles
create policy profiles_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_admin());

-- member movements
create policy movements_read  on public.member_movements for select to authenticated using (public.is_staff());
create policy movements_write on public.member_movements for all to authenticated using (public.is_staff_writer()) with check (public.is_staff_writer());

-- events: public announcements
create policy events_read_public on public.events for select to anon, authenticated using (is_public or public.is_staff());
create policy events_write on public.events for insert to authenticated with check (public.is_finance());
create policy events_update on public.events for update to authenticated using (public.is_finance()) with check (public.is_finance());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

-- bookings
create policy bookings_read  on public.event_bookings for select to authenticated using (public.is_staff() or member_id = public.my_member_id());
create policy bookings_write on public.event_bookings for insert to authenticated with check (public.is_staff_writer());
create policy bookings_update on public.event_bookings for update to authenticated using (public.is_staff_writer()) with check (public.is_staff_writer());
create policy bookings_delete on public.event_bookings for delete to authenticated using (public.is_finance());

-- booking requests (guard trigger enforces field-level rules)
create policy requests_read   on public.booking_requests for select to authenticated using (public.is_staff() or member_id = public.my_member_id());
create policy requests_insert on public.booking_requests for insert to authenticated with check (public.is_staff_writer() or (public.my_role() = 'member' and member_id = public.my_member_id()));
create policy requests_update on public.booking_requests for update to authenticated using (public.is_staff_writer() or member_id = public.my_member_id()) with check (public.is_staff_writer() or member_id = public.my_member_id());
create policy requests_delete on public.booking_requests for delete to authenticated using (public.is_admin());

-- benefits
create policy benefits_read  on public.member_benefits for select to authenticated using (public.is_staff() or member_id = public.my_member_id());
create policy benefits_write on public.member_benefits for all to authenticated using (public.is_staff_writer()) with check (public.is_staff_writer());

-- board
create policy board_terms_read  on public.board_terms for select to authenticated using (public.is_staff());
create policy board_terms_write on public.board_terms for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy board_m_read      on public.board_memberships for select to authenticated using (public.is_staff());
create policy board_m_write     on public.board_memberships for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy board_r_read      on public.board_records for select to authenticated using (public.is_staff());
create policy board_r_write     on public.board_records for all to authenticated using (public.is_staff_writer()) with check (public.is_staff_writer());

-- news: public read of active items
create policy news_read  on public.site_news for select to anon, authenticated using (active or public.is_staff());
create policy news_write on public.site_news for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- settings
create policy settings_read  on public.settings for select to authenticated using (public.is_staff());
create policy settings_write on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- audit logs: anyone signed in may append their own entry; auditors read; nobody edits
create policy audit_insert on public.audit_logs for insert to authenticated with check (actor_id = auth.uid());
create policy audit_read   on public.audit_logs for select to authenticated using (public.my_role() in ('admin', 'treasurer', 'auditor'));

-- public read model grants
grant execute on function public.public_board() to anon, authenticated;
grant execute on function public.public_stats() to anon, authenticated;
-- helper functions are not meant to be called directly by anon
revoke execute on function public.handle_new_user() from anon, authenticated, public;
