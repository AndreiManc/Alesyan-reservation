-- ALESYAN RESERVE: initial independent Supabase schema.
-- IMPORTANT: ONLY apply to a NEW, dedicated Alesyan Reservations Supabase project.
-- NEVER run against the existing "alesyan-staging" / Food Safe Hub database.
-- No customer data, secrets or organisation memberships are seeded by this migration.

create extension if not exists btree_gist;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check(length(btrim(name)) between 2 and 120),
  slug text not null unique check(slug ~ '^[a-z0-9-]{3,80}$'),
  timezone text not null default 'Europe/Dublin',
  created_at timestamptz not null default now()
);

create table public.site_memberships (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','manager','host')),
  created_at timestamptz not null default now(),
  primary key(site_id,user_id)
);
create index site_memberships_user_id_idx on public.site_memberships(user_id,site_id);

create table public.site_settings (
  site_id uuid primary key references public.sites(id) on delete cascade,
  lunch_from time not null default '11:30',
  lunch_to time not null default '14:30',
  dinner_from time not null default '17:00',
  dinner_to time not null default '20:30',
  small_duration_mins integer not null default 90 check(small_duration_mins between 30 and 300),
  large_duration_mins integer not null default 120 check(large_duration_mins between 30 and 300),
  turnover_buffer_mins integer not null default 15 check(turnover_buffer_mins between 0 and 120),
  max_party_size integer not null default 8 check(max_party_size between 1 and 30),
  max_advance_days integer not null default 45 check(max_advance_days between 1 and 365),
  updated_at timestamptz not null default now(),
  constraint valid_meal_windows check (
    lunch_from < lunch_to and dinner_from < dinner_to and lunch_to <= dinner_from
  )
);

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 60),
  unique(site_id,name),
  unique(site_id,id)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  area_id uuid not null,
  label text not null check(length(btrim(label)) between 1 and 20),
  capacity integer not null check(capacity between 1 and 30),
  shape text not null default 'square' check(shape in ('round','square','rectangle')),
  x integer not null default 0, y integer not null default 0,
  active boolean not null default true,
  unique(site_id,label),
  unique(site_id,id),
  foreign key(site_id,area_id) references public.dining_areas(site_id,id)
);
create index dining_tables_site_area_idx on public.dining_tables(site_id,area_id);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  full_name text not null check(length(btrim(full_name)) between 2 and 100),
  phone text, email text,
  created_at timestamptz not null default now(),
  unique(site_id,id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  guest_id uuid not null,
  dining_table_id uuid not null,
  party_size integer not null check(party_size between 1 and 30),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check(status in ('confirmed','seated','completed','cancelled','no-show')),
  source text not null default 'Phone' check(source in ('Phone','Website','Walk-in','OpenTable (historic)','Other')),
  notes text not null default '' check(length(notes) <= 500),
  idempotency_key uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(site_id,guest_id) references public.guests(site_id,id),
  foreign key(site_id,dining_table_id) references public.dining_tables(site_id,id),
  constraint reservation_time_positive check(ends_at > starts_at),
  constraint reservation_duration_max check(ends_at <= starts_at + interval '8 hours'),
  constraint table_time_exclusion exclude using gist
    (dining_table_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
    where (status not in ('cancelled','no-show'))
);
create unique index reservation_idempotency_idx on public.reservations(site_id,idempotency_key) where idempotency_key is not null;
create index reservations_site_start_idx on public.reservations(site_id,starts_at);
create index reservations_guest_idx on public.reservations(guest_id,starts_at desc);

create table public.reservation_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check(event in ('created','updated','status_changed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index reservation_events_site_created_idx on public.reservation_events(site_id,created_at desc);

-- Explicitly remove default public API execution/row access.
revoke all on all tables in schema public from anon;
-- The above only affects this isolated, brand-new Reservations database.
revoke all on public.organisations,public.sites,public.site_memberships,
  public.site_settings,public.dining_areas,public.dining_tables,
  public.guests,public.reservations,public.reservation_events from authenticated;
grant select on public.organisations,public.sites,public.site_memberships,
  public.site_settings,public.dining_areas,public.dining_tables,
  public.guests,public.reservations,public.reservation_events to authenticated;

alter table public.organisations enable row level security;
alter table public.sites enable row level security;
alter table public.site_memberships enable row level security;
alter table public.site_settings enable row level security;
alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_events enable row level security;

-- Narrow, explicit membership check. In a NON-EXPOSED schema with a fixed search path.
-- Its SECURITY DEFINER privilege is needed to avoid recursive membership policies.
create or replace function private.is_site_staff(p_site uuid,p_roles text[] default array['owner','manager','host'])
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.site_memberships m
    where m.site_id=p_site and m.user_id=(select auth.uid()) and m.role=any(p_roles)
  );
$$;
revoke all on function private.is_site_staff(uuid,text[]) from public;
grant execute on function private.is_site_staff(uuid,text[]) to authenticated;

create policy memberships_read_own on public.site_memberships
  for select to authenticated using (user_id=(select auth.uid()));
create policy sites_read on public.sites
  for select to authenticated using (private.is_site_staff(id));
create policy organisations_read on public.organisations
  for select to authenticated using (
    exists(select 1 from public.sites s
      where s.organisation_id=organisations.id and private.is_site_staff(s.id))
  );
create policy settings_read on public.site_settings
  for select to authenticated using (private.is_site_staff(site_id));
create policy areas_read on public.dining_areas
  for select to authenticated using (private.is_site_staff(site_id));
create policy tables_read on public.dining_tables
  for select to authenticated using (private.is_site_staff(site_id));
create policy guests_read on public.guests
  for select to authenticated using (private.is_site_staff(site_id));
create policy reservations_read on public.reservations
  for select to authenticated using (private.is_site_staff(site_id));
create policy events_read on public.reservation_events
  for select to authenticated using (private.is_site_staff(site_id));

-- All writes happen via narrow functions. No staff member has direct table write privileges.
-- The database exclusion constraint provides atomic anti-double-booking protection.
create or replace function public.staff_save_reservation(
  p_site_id uuid,
  p_guest_name text,
  p_day date,
  p_time time,
  p_party integer,
  p_source text default 'Phone',
  p_notes text default '',
  p_preferred_table_id uuid default null,
  p_reservation_id uuid default null,
  p_request_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_settings public.site_settings%rowtype;
  v_old public.reservations%rowtype;
  v_existing uuid;
  v_table_id uuid;
  v_guest_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.is_site_staff(p_site_id) then
    raise exception 'Not authorised for this restaurant' using errcode='42501';
  end if;
  select * into v_site from public.sites where id=p_site_id;
  select * into v_settings from public.site_settings where site_id=p_site_id;
  if not found or v_site.id is null then
    raise exception 'Restaurant settings are not configured';
  end if;
  if p_guest_name is null or length(btrim(p_guest_name)) not between 2 and 100
     or p_party is null or p_party not between 1 and v_settings.max_party_size
     or p_day is null or p_time is null
     or p_source not in ('Phone','Website','Walk-in','OpenTable (historic)','Other')
     or length(coalesce(p_notes,''))>500 then
    raise exception 'Invalid reservation details';
  end if;
  if not ((p_time >= v_settings.lunch_from and p_time <= v_settings.lunch_to) or
          (p_time >= v_settings.dinner_from and p_time <= v_settings.dinner_to)) then
    raise exception 'Time is outside the configured booking windows';
  end if;
  if p_day > ((now() at time zone v_site.timezone)::date + v_settings.max_advance_days) then
    raise exception 'Date is beyond booking window';
  end if;
  if p_day < (now() at time zone v_site.timezone)::date then
    raise exception 'Historical reservations cannot be created or rescheduled';
  end if;

  if p_request_id is not null then
    select id into v_existing from public.reservations
    where site_id=p_site_id and idempotency_key=p_request_id;
    if found then return v_existing; end if;
  end if;

  if p_reservation_id is not null then
    select * into v_old from public.reservations
    where id=p_reservation_id and site_id=p_site_id for update;
    if not found then raise exception 'Reservation not found'; end if;
  end if;

  v_start := (p_day + p_time) at time zone v_site.timezone;
  v_duration := (case when p_party > 4 then v_settings.large_duration_mins
                else v_settings.small_duration_mins end) + v_settings.turnover_buffer_mins;
  v_end := v_start + make_interval(mins => v_duration);

  -- Prefer preserving existing assignment on edit, but do not reserve an invalid table.
  select t.id into v_table_id from public.dining_tables t
  where t.site_id=p_site_id and t.active and t.capacity>=p_party
    and (p_preferred_table_id is null or t.id=p_preferred_table_id)
    and (p_preferred_table_id is not null or p_reservation_id is null or t.id=v_old.dining_table_id)
    and not exists(
      select 1 from public.reservations r
      where r.dining_table_id=t.id and r.id is distinct from p_reservation_id
        and r.status not in ('cancelled','no-show')
        and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
    )
  order by t.capacity,t.label limit 1;

  if v_table_id is null and p_preferred_table_id is null then
    select t.id into v_table_id from public.dining_tables t
    where t.site_id=p_site_id and t.active and t.capacity>=p_party
      and not exists(
        select 1 from public.reservations r
        where r.dining_table_id=t.id and r.id is distinct from p_reservation_id
          and r.status not in ('cancelled','no-show')
          and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
      )
    order by t.capacity,t.label limit 1;
  end if;
  if v_table_id is null then
    raise exception 'No available table for the requested party and time' using errcode='P0001';
  end if;

  if p_reservation_id is null then
    insert into public.guests(site_id,full_name) values(p_site_id,btrim(p_guest_name)) returning id into v_guest_id;
    insert into public.reservations(site_id,guest_id,dining_table_id,party_size,starts_at,ends_at,status,source,notes,idempotency_key,created_by)
      values(p_site_id,v_guest_id,v_table_id,p_party,v_start,v_end,'confirmed',p_source,coalesce(p_notes,''),p_request_id,(select auth.uid()))
      returning id into v_id;
    insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
      values(p_site_id,v_id,(select auth.uid()),'created',jsonb_build_object('party',p_party,'source',p_source));
  else
    update public.guests set full_name=btrim(p_guest_name) where id=v_old.guest_id and site_id=p_site_id;
    update public.reservations set dining_table_id=v_table_id,party_size=p_party,
      starts_at=v_start,ends_at=v_end,source=p_source,notes=coalesce(p_notes,''),updated_at=now()
      where id=p_reservation_id and site_id=p_site_id returning id into v_id;
    insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
      values(p_site_id,v_id,(select auth.uid()),'updated',jsonb_build_object('party',p_party,'source',p_source));
  end if;
  return v_id;
exception
  when exclusion_violation then
    raise exception 'That table was just booked. Refresh and choose another time.' using errcode='23P01';
end;
$$;
revoke all on function public.staff_save_reservation(uuid,text,date,time,integer,text,text,uuid,uuid,uuid) from public;
grant execute on function public.staff_save_reservation(uuid,text,date,time,integer,text,text,uuid,uuid,uuid) to authenticated;

create or replace function public.staff_change_reservation_status(p_reservation_id uuid,p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_row public.reservations%rowtype;
begin
  if p_status not in ('confirmed','seated','completed','cancelled','no-show') then
    raise exception 'Unsupported status';
  end if;
  select * into v_row from public.reservations where id=p_reservation_id for update;
  if not found or not private.is_site_staff(v_row.site_id) then
    raise exception 'Reservation not found or access denied' using errcode='42501';
  end if;
  if p_status='confirmed' and v_row.status in ('cancelled','no-show') then
    -- Reinstatement must also pass the exclusion constraint atomically.
    if v_row.ends_at <= now() then raise exception 'Cannot reinstate an expired booking'; end if;
  end if;
  update public.reservations set status=p_status, updated_at=now() where id=p_reservation_id;
  insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
    values(v_row.site_id,p_reservation_id,(select auth.uid()),'status_changed',
      jsonb_build_object('from',v_row.status,'to',p_status));
exception when exclusion_violation then
  raise exception 'Cannot reinstate: table is occupied during this booking window' using errcode='23P01';
end;
$$;
revoke all on function public.staff_change_reservation_status(uuid,text) from public;
grant execute on function public.staff_change_reservation_status(uuid,text) to authenticated;

create or replace function public.staff_upsert_table(
  p_site_id uuid,p_label text,p_capacity integer,p_area text,p_active boolean default true,p_table_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_area uuid;v_result uuid;
begin
  if not private.is_site_staff(p_site_id,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
  if length(btrim(coalesce(p_label,''))) not between 1 and 20 or p_capacity not between 1 and 30
    or length(btrim(coalesce(p_area,''))) not between 1 and 60 then raise exception 'Invalid table settings';end if;
  insert into public.dining_areas(site_id,name) values(p_site_id,btrim(p_area))
    on conflict(site_id,name) do update set name=excluded.name returning id into v_area;
  if p_table_id is null then
    insert into public.dining_tables(site_id,area_id,label,capacity,active)
    values(p_site_id,v_area,btrim(p_label),p_capacity,p_active) returning id into v_result;
  else
    update public.dining_tables set area_id=v_area,label=btrim(p_label),capacity=p_capacity,active=p_active
      where id=p_table_id and site_id=p_site_id returning id into v_result;
    if not found then raise exception 'Table does not belong to this location';end if;
  end if;
  return v_result;
end;
$$;
revoke all on function public.staff_upsert_table(uuid,text,integer,text,boolean,uuid) from public;
grant execute on function public.staff_upsert_table(uuid,text,integer,text,boolean,uuid) to authenticated;

create or replace function public.staff_update_settings(
 p_site_id uuid,p_lunch_from time,p_lunch_to time,p_dinner_from time,p_dinner_to time,
 p_small integer,p_large integer,p_buffer integer,p_max_party integer,p_advance integer
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_site_staff(p_site_id,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
  update public.site_settings set lunch_from=p_lunch_from,lunch_to=p_lunch_to,
    dinner_from=p_dinner_from,dinner_to=p_dinner_to,small_duration_mins=p_small,
    large_duration_mins=p_large,turnover_buffer_mins=p_buffer,max_party_size=p_max_party,
    max_advance_days=p_advance,updated_at=now() where site_id=p_site_id;
  if not found then raise exception 'Site settings not found'; end if;
end;
$$;
revoke all on function public.staff_update_settings(uuid,time,time,time,time,integer,integer,integer,integer,integer) from public;
grant execute on function public.staff_update_settings(uuid,time,time,time,time,integer,integer,integer,integer,integer) to authenticated;

-- These functions are intentionally STAFF-ONLY. No anon/public booking RPC is exposed.
-- Public booking requires a separate rate-limited edge function and abuse prevention.
