-- Dedicated Alesyan Reservations: explicit manager-approved movable table pairs.
alter table public.dining_tables add column if not exists movable boolean not null default false;
alter table public.dining_tables add column if not exists auto_large_booking_enabled boolean not null default true;

create table public.table_join_pairs(
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 table_a uuid not null,table_b uuid not null,
 enabled boolean not null default true,
 constraint join_pair_order check(table_a<table_b),
 unique(site_id,table_a,table_b),
 foreign key(site_id,table_a) references public.dining_tables(site_id,id),
 foreign key(site_id,table_b) references public.dining_tables(site_id,id)
);
alter table public.table_join_pairs enable row level security;
revoke all on public.table_join_pairs from public,anon;
grant select on public.table_join_pairs to authenticated;
create policy join_pair_site_read on public.table_join_pairs for select to authenticated using(private.is_site_staff(site_id));

create table public.reservation_extra_tables(
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null,
 reservation_id uuid not null references public.reservations(id) on delete cascade,
 dining_table_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 active boolean not null default true,
 foreign key(site_id,dining_table_id) references public.dining_tables(site_id,id),
 constraint extra_table_time_valid check(ends_at>starts_at),
 constraint extra_table_slot_exclusion exclude using gist(dining_table_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(active)
);
create index reservation_extra_tables_res_idx on public.reservation_extra_tables(reservation_id);
alter table public.reservation_extra_tables enable row level security;
revoke all on public.reservation_extra_tables from public,anon;
grant select on public.reservation_extra_tables to authenticated;
create policy reservation_extra_site_read on public.reservation_extra_tables for select to authenticated using(private.is_site_staff(site_id));

-- Check conflicts in both directions. Existing single-table staff/public RPCs remain safe.
create or replace function private.check_primary_against_extras()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status not in ('cancelled','no-show') and exists(
 select 1 from public.reservation_extra_tables x
 where x.dining_table_id=new.dining_table_id and x.active and x.reservation_id<>new.id
 and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
 raise exception 'Table is occupied by a joined reservation' using errcode='23P01';
 end if;
 return new;
end $$;
create trigger reservation_primary_joins_guard before insert or update of dining_table_id,starts_at,ends_at,status
on public.reservations for each row execute function private.check_primary_against_extras();

create or replace function private.check_extra_against_primaries()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype;
begin
 select * into r from public.reservations where id=new.reservation_id;
 if r.site_id<>new.site_id or r.dining_table_id=new.dining_table_id then
   raise exception 'Invalid joined table assignment';
 end if;
 if new.active and (r.status in ('cancelled','no-show') or new.starts_at<>r.starts_at or new.ends_at<>r.ends_at) then
   raise exception 'Joined table time/status mismatch';
 end if;
 if new.active and exists(select 1 from public.reservations b where b.dining_table_id=new.dining_table_id
  and b.status not in ('cancelled','no-show')
  and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
  raise exception 'Joined table conflicts with another booking' using errcode='23P01';
 end if;
 return new;
end $$;
create trigger reservation_extra_primary_guard before insert or update on public.reservation_extra_tables
for each row execute function private.check_extra_against_primaries();

create or replace function private.sync_join_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('cancelled','no-show') then
   update public.reservation_extra_tables set active=false where reservation_id=new.id;
 elsif old.status in ('cancelled','no-show') and new.status not in ('cancelled','no-show') then
   update public.reservation_extra_tables set active=true,starts_at=new.starts_at,ends_at=new.ends_at where reservation_id=new.id;
 elsif new.starts_at<>old.starts_at or new.ends_at<>old.ends_at then
   update public.reservation_extra_tables set starts_at=new.starts_at,ends_at=new.ends_at where reservation_id=new.id and active;
 end if;
 return null;
end $$;
create trigger reservation_join_status_sync after update of status,starts_at,ends_at on public.reservations
for each row execute function private.sync_join_status();

create or replace function public.staff_set_table_rules(
 p_site uuid,p_table uuid,p_movable boolean,p_allow_large boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
 update public.dining_tables set movable=p_movable,auto_large_booking_enabled=p_allow_large
 where site_id=p_site and id=p_table;
 if not found then raise exception 'Table not found';end if;
end $$;

create or replace function public.staff_set_join_pair(p_site uuid,p_table_a uuid,p_table_b uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare a public.dining_tables%rowtype;b public.dining_tables%rowtype;
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
 if p_table_a=p_table_b then raise exception 'Distinct tables required';end if;
 select * into a from public.dining_tables where id=p_table_a and site_id=p_site;
 select * into b from public.dining_tables where id=p_table_b and site_id=p_site;
 if a.id is null or b.id is null or a.area_id<>b.area_id then raise exception 'Only tables in the same dining area can be paired';end if;
 if p_enabled and (not a.movable or not b.movable) then raise exception 'Mark both tables as movable first';end if;
 insert into public.table_join_pairs(site_id,table_a,table_b,enabled)
 values(p_site,least(p_table_a,p_table_b),greatest(p_table_a,p_table_b),p_enabled)
 on conflict(site_id,table_a,table_b) do update set enabled=excluded.enabled;
end $$;

-- Staff-only join booking; uses explicit configured pairs, serialized per site, and
-- exclusion/trigger constraints for atomic cross-channel conflict prevention.
create or replace function public.staff_create_joined_reservation(
 p_site uuid,p_first text,p_last text,p_phone text,p_email text,
 p_day date,p_time time,p_party int,p_source text default 'Phone',
 p_notes text default '',p_request uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.sites%rowtype;cfg public.site_settings%rowtype;
 j record; start_time timestamptz;end_time timestamptz;
 rid uuid; gid uuid; dur int;
begin
 if not private.is_site_staff(p_site) then raise exception 'Not authorised' using errcode='42501';end if;
 if length(btrim(coalesce(p_last,''))) not between 1 and 80
  or length(btrim(coalesce(p_first,'')))>80
  or length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 7 and 15
  or length(coalesce(p_phone,''))>30 or length(coalesce(p_email,''))>254
  or (nullif(btrim(coalesce(p_email,'')),'') is not null and p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 then raise exception 'Last name and valid phone required';end if;
 if p_source not in ('Phone','Website','Walk-in','OpenTable (historic)','Other') then raise exception 'Invalid source';end if;
 if length(coalesce(p_notes,''))>500 then raise exception 'Notes too long';end if;
 select * into s from public.sites where id=p_site;
 select * into cfg from public.site_settings where site_id=p_site;
 if s.id is null or cfg.site_id is null or p_party is null or p_party<1 or p_party>cfg.max_party_size
 or p_day is null or p_time is null then raise exception 'Invalid booking request';end if;
 if p_day<(now() at time zone s.timezone)::date or p_day>(now() at time zone s.timezone)::date+cfg.max_advance_days
 or not ((p_time between cfg.lunch_from and cfg.lunch_to) or (p_time between cfg.dinner_from and cfg.dinner_to))
 then raise exception 'Date or time outside booking window';end if;
 start_time:=(p_day+p_time) at time zone s.timezone;
 dur:=(case when p_party>4 then cfg.large_duration_mins else cfg.small_duration_mins end)+cfg.turnover_buffer_mins;
 end_time:=start_time+make_interval(mins=>dur);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site::text,47291));
 if p_request is not null then
   select id into rid from public.reservations where site_id=p_site and idempotency_key=p_request;
   if found then return rid;end if;
 end if;
 for j in
  select a.id a_id,b.id b_id,a.capacity+b.capacity total
  from public.table_join_pairs pair
  join public.dining_tables a on a.id=pair.table_a
  join public.dining_tables b on b.id=pair.table_b
  where pair.site_id=p_site and pair.enabled and a.active and b.active and a.movable and b.movable
  and a.auto_large_booking_enabled and b.auto_large_booking_enabled
  and a.capacity+b.capacity>=p_party
  -- Only join if party cannot fit on either constituent table alone.
  and greatest(a.capacity,b.capacity)<p_party
  order by a.capacity+b.capacity,a.label,b.label
 loop
  if exists(select 1 from public.reservations r
    where r.status not in ('cancelled','no-show') and r.dining_table_id in(j.a_id,j.b_id)
    and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(start_time,end_time)) then continue;end if;
  if exists(select 1 from public.reservation_extra_tables x
    where x.active and x.dining_table_id in(j.a_id,j.b_id)
    and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(start_time,end_time)) then continue;end if;
  insert into public.guests(site_id,full_name,phone,email)
  values(p_site,btrim(coalesce(p_first,'')||' '||btrim(p_last)),btrim(p_phone),nullif(btrim(coalesce(p_email,'')),''))
  returning id into gid;
  insert into public.reservations(site_id,guest_id,dining_table_id,party_size,starts_at,ends_at,status,source,notes,idempotency_key,created_by)
  values(p_site,gid,j.a_id,p_party,start_time,end_time,'confirmed',p_source,coalesce(p_notes,''),p_request,(select auth.uid()))
  returning id into rid;
  insert into public.reservation_extra_tables(site_id,reservation_id,dining_table_id,starts_at,ends_at)
  values(p_site,rid,j.b_id,start_time,end_time);
  insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
  values(p_site,rid,(select auth.uid()),'created',jsonb_build_object('joined_tables',jsonb_build_array(j.a_id,j.b_id),'automatic',true));
  return rid;
 end loop;
 raise exception 'No eligible movable table pair available';
end $$;
revoke all on function public.staff_set_table_rules(uuid,uuid,boolean,boolean) from public,anon;
revoke all on function public.staff_set_join_pair(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.staff_create_joined_reservation(uuid,text,text,text,text,date,time,int,text,text,uuid) from public,anon;
grant execute on function public.staff_set_table_rules(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.staff_set_join_pair(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.staff_create_joined_reservation(uuid,text,text,text,text,date,time,int,text,text,uuid) to authenticated;
