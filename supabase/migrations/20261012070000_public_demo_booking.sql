-- Public demo-only booking channel. Never use this for real customer information.
-- The service role can call these routines; no anonymous role can execute them.
create table public.public_demo_attempts (
 id bigint generated always as identity primary key,
 site_id uuid not null references public.sites(id) on delete cascade,
 fingerprint text not null check(length(fingerprint)=64),
 created_at timestamptz not null default now()
);
create index public_demo_attempts_recent_idx on public.public_demo_attempts(fingerprint,created_at desc);
alter table public.public_demo_attempts enable row level security;
revoke all on public.public_demo_attempts from anon,authenticated;
revoke execute on all functions in schema public from anon; -- Supabase grants anon defaults: protect this new RPC too.

create or replace function public.public_demo_slots(p_slug text,p_day date,p_party integer)
returns table(slot text) language plpgsql security definer set search_path=''
as $$
declare v_site public.sites%rowtype; v_settings public.site_settings%rowtype; v_time time; v_start timestamptz; v_end timestamptz; v_duration integer; v_now timestamptz:=now(); v_day date;
begin
 if p_slug<>'alesyan-demo-malahide' then return;end if;
 select * into v_site from public.sites where slug=p_slug;
 if not found then return;end if;
 select * into v_settings from public.site_settings where site_id=v_site.id;
 if not found or p_day is null or p_party is null or p_party<1 or p_party>v_settings.max_party_size then return;end if;
 v_day:=(v_now at time zone v_site.timezone)::date;
 if p_day<v_day or p_day>v_day+v_settings.max_advance_days then return;end if;
 v_duration:=(case when p_party>4 then v_settings.large_duration_mins else v_settings.small_duration_mins end)+v_settings.turnover_buffer_mins;
 for v_time in select (time '00:00'+make_interval(mins=>i))::time from generate_series(0,1430,30) i loop
   if not ((v_time between v_settings.lunch_from and v_settings.lunch_to) or (v_time between v_settings.dinner_from and v_settings.dinner_to)) then continue;end if;
   v_start:=(p_day+v_time) at time zone v_site.timezone;
   v_end:=v_start+make_interval(mins=>v_duration);
   if v_start<v_now+interval '45 minutes' then continue;end if;
   if exists(select 1 from public.dining_tables t where t.site_id=v_site.id and t.active and t.capacity>=p_party
      and not exists(select 1 from public.reservations r where r.dining_table_id=t.id and r.status not in ('cancelled','no-show')
      and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))) then
      slot:=to_char(v_time,'HH24:MI');return next;
   end if;
 end loop;
end $$;

create or replace function public.public_demo_book(
 p_slug text,p_day date,p_time time,p_party integer,p_request uuid,p_fingerprint text
) returns text language plpgsql security definer set search_path=''
as $$
declare v_site public.sites%rowtype; v_settings public.site_settings%rowtype; v_table uuid;v_guest uuid;v_res uuid;v_start timestamptz;v_end timestamptz;v_duration integer;v_old uuid;v_now timestamptz:=now();
begin
 if p_slug<>'alesyan-demo-malahide' or p_request is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
   raise exception 'Invalid demo request';
 end if;
 select * into v_site from public.sites where slug=p_slug;
 if not found then raise exception 'Demo site unavailable';end if;
 select * into v_settings from public.site_settings where site_id=v_site.id;
 if not found or p_party is null or p_party<1 or p_party>v_settings.max_party_size or p_day is null or p_time is null
 then raise exception 'Invalid date or party';end if;
 if p_day<(v_now at time zone v_site.timezone)::date or p_day>(v_now at time zone v_site.timezone)::date+v_settings.max_advance_days
 then raise exception 'Booking date outside the demo window';end if;
 if not (extract(minute from p_time) in (0,30) and extract(second from p_time)=0 and (
 p_time between v_settings.lunch_from and v_settings.lunch_to or p_time between v_settings.dinner_from and v_settings.dinner_to))
 then raise exception 'Time is outside configured demo slots';end if;
 v_start:=(p_day+p_time) at time zone v_site.timezone;
 if v_start<v_now+interval '45 minutes' then raise exception 'Booking slot is too soon';end if;
 v_duration:=(case when p_party>4 then v_settings.large_duration_mins else v_settings.small_duration_mins end)+v_settings.turnover_buffer_mins;
 v_end:=v_start+make_interval(mins=>v_duration);
 -- Idempotent request: ensure repeat submissions do not create duplicate bookings.
 select id into v_old from public.reservations where site_id=v_site.id and idempotency_key=p_request;
 if found then return upper(substr(replace(v_old::text,'-',''),1,10));end if;
 -- Serialize demo submissions per fingerprint, across concurrent HTTP requests.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint,2026));
 if (select count(*) from public.public_demo_attempts where fingerprint=p_fingerprint and created_at>v_now-interval '15 minutes')>=5
 then raise exception 'Too many demo requests. Please try again later';end if;
 insert into public.public_demo_attempts(site_id,fingerprint) values(v_site.id,p_fingerprint);
 -- Exclusion constraint catches races after the availability lookup.
 select t.id into v_table from public.dining_tables t
 where t.site_id=v_site.id and t.active and t.capacity>=p_party
 and not exists(select 1 from public.reservations r where r.dining_table_id=t.id and r.status not in ('cancelled','no-show')
 and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
 order by t.capacity,t.label limit 1;
 if v_table is null then raise exception 'No table is available at that time';end if;
 insert into public.guests(site_id,full_name) values(v_site.id,'Demo Online '||upper(substr(replace(p_request::text,'-',''),1,8))) returning id into v_guest;
 insert into public.reservations(site_id,guest_id,dining_table_id,party_size,starts_at,ends_at,status,source,notes,idempotency_key)
 values(v_site.id,v_guest,v_table,p_party,v_start,v_end,'confirmed','Website','PUBLIC DEMO ONLY',p_request) returning id into v_res;
 insert into public.reservation_events(site_id,reservation_id,event,payload)
 values(v_site.id,v_res,'created',jsonb_build_object('source','Public demo','synthetic',true));
 return upper(substr(replace(v_res::text,'-',''),1,10));
exception when exclusion_violation then
 raise exception 'This slot just became unavailable. Select another time';
end $$;
revoke all on function public.public_demo_slots(text,date,integer) from public,anon,authenticated;
revoke all on function public.public_demo_book(text,date,time,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.public_demo_slots(text,date,integer) to service_role;
grant execute on function public.public_demo_book(text,date,time,integer,uuid,text) to service_role;
