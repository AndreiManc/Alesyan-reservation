-- Synthetic demonstration bookings only. The random client-generated request UUID
-- is a bearer amendment capability. Never use this mechanism for real guest data.
create or replace function public.public_demo_amend(
 p_slug text,p_token uuid,p_day date,p_time time,p_party integer,p_fingerprint text
) returns text language plpgsql security definer set search_path=''
as $$
declare s public.sites%rowtype;cfg public.site_settings%rowtype;r public.reservations%rowtype;
v_start timestamptz;v_end timestamptz;dur integer;t uuid;v_now timestamptz:=now();
begin
 if p_slug<>'alesyan-demo-malahide' or p_token is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid demo amendment';
 end if;
 select * into s from public.sites where slug=p_slug;
 if not found then raise exception 'Demo restaurant unavailable';end if;
 -- Lock site allocator: serializes with staff automatic allocations.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.id::text,47291));
 select * into r from public.reservations where site_id=s.id and idempotency_key=p_token for update;
 if not found or r.source<>'Website' or r.notes<>'PUBLIC DEMO ONLY' or r.status<>'confirmed' then
  raise exception 'Amendment link is invalid or booking is no longer amendable';
 end if;
 select * into cfg from public.site_settings where site_id=s.id;
 if p_day is null or p_time is null or p_party is null or p_party<1 or p_party>least(cfg.max_party_size,9) then
  raise exception 'Invalid date or party size';end if;
 if p_day<(v_now at time zone s.timezone)::date or p_day>(v_now at time zone s.timezone)::date+cfg.max_advance_days then
  raise exception 'Date outside the booking window';end if;
 if exists(select 1 from public.site_booking_closures where site_id=s.id and service_day=p_day) and p_day<>(r.starts_at at time zone s.timezone)::date then
  raise exception 'Restaurant closed for bookings on the requested date';end if;
 if extract(minute from p_time) not in (0,30) or extract(second from p_time)<>0 or
  not (p_time between cfg.lunch_from and cfg.lunch_to or p_time between cfg.dinner_from and cfg.dinner_to) then
  raise exception 'Invalid service time';end if;
 v_start:=(p_day+p_time) at time zone s.timezone;
 if v_start<v_now+interval '45 minutes' then raise exception 'Amendment too close to service';end if;
 dur:=coalesce((select duration_mins from public.booking_duration_rules where site_id=s.id and party_size=p_party),
 case when p_party>4 then cfg.large_duration_mins else cfg.small_duration_mins end)+cfg.turnover_buffer_mins;
 v_end:=v_start+make_interval(mins=>dur);
 -- A moved party can remain at its old table only if the table is large enough.
 select dt.id into t from public.dining_tables dt
 where dt.site_id=s.id and dt.active and dt.capacity>=p_party
 and (p_party<=4 or dt.auto_large_booking_enabled)
 and not exists(select 1 from public.reservations other where other.id<>r.id and other.dining_table_id=dt.id
  and other.status not in ('cancelled','no-show') and tstzrange(other.starts_at,other.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
 and not exists(select 1 from public.reservation_extra_tables extra where extra.active and extra.reservation_id<>r.id
  and extra.dining_table_id=dt.id and tstzrange(extra.starts_at,extra.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
 order by (dt.id=r.dining_table_id) desc,dt.capacity,dt.label limit 1;
 if t is null then raise exception 'No table available for that date, time and party size';end if;
 -- No bookings using joined tables may be amended via this demo capability.
 if exists(select 1 from public.reservation_extra_tables where reservation_id=r.id and active) then
  raise exception 'Please contact the restaurant to change a combined-table booking';end if;
 if r.starts_at=v_start and r.ends_at=v_end and r.party_size=p_party and r.dining_table_id=t then
  return upper(substr(replace(r.id::text,'-',''),1,10));end if;
 update public.reservations set starts_at=v_start,ends_at=v_end,party_size=p_party,dining_table_id=t,updated_at=now()
 where id=r.id;
 insert into public.reservation_events(site_id,reservation_id,event,payload)
 values(s.id,r.id,'updated',jsonb_build_object('synthetic',true,'channel','customer_demo_amend',
  'old_day',(r.starts_at at time zone s.timezone)::date,'new_day',p_day,
  'old_party',r.party_size,'new_party',p_party,'old_table',r.dining_table_id,'new_table',t));
 return upper(substr(replace(r.id::text,'-',''),1,10));
exception when exclusion_violation then
 raise exception 'This table just became unavailable. Choose another slot';
end $$;
revoke all on function public.public_demo_amend(text,uuid,date,time,integer,text) from public,anon,authenticated;
grant execute on function public.public_demo_amend(text,uuid,date,time,integer,text) to service_role;