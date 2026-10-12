-- Consistent automatic allocation respects table-level big-party exclusions.
-- A manually selected table remains an intentional manager/staff override.
create or replace function public.staff_auto_allocate_booking(
 p_site uuid,p_first text,p_last text,p_phone text,p_email text,
 p_day date,p_time time,p_party integer,p_source text default 'Phone',p_notes text default '',
 p_preferred uuid default null,p_existing uuid default null,p_request uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.dining_tables%rowtype; s public.sites%rowtype; cfg public.site_settings%rowtype;
 st timestamptz; en timestamptz; dur integer; chosen uuid; bid uuid;
begin
 if not private.is_site_staff(p_site) then raise exception 'Not authorised' using errcode='42501';end if;
 select * into s from public.sites where id=p_site;
 select * into cfg from public.site_settings where site_id=p_site;
 if s.id is null or cfg.site_id is null or p_party is null or p_party<1 or p_party>cfg.max_party_size then
 raise exception 'Invalid booking request';end if;
 st:=(p_day+p_time) at time zone s.timezone;
 dur:=(case when p_party>4 then cfg.large_duration_mins else cfg.small_duration_mins end)+cfg.turnover_buffer_mins;
 en:=st+make_interval(mins=>dur);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site::text,47291));
 if p_request is not null and p_existing is null then
 select id into bid from public.reservations where site_id=p_site and idempotency_key=p_request;
 if found then return bid;end if;
 end if;
 if p_preferred is not null or p_existing is not null then
   -- Explicit table/edits: validated by underlying authoritative function.
   return public.staff_save_reservation_v2(p_site,p_first,p_last,p_phone,p_email,
     p_day,p_time,p_party,p_source,p_notes,p_preferred,p_existing,p_request,false);
 end if;
 for t in select * from public.dining_tables where site_id=p_site and active and capacity>=p_party
    and (p_party<=4 or auto_large_booking_enabled)
    order by capacity,label
 loop
  if exists(select 1 from public.reservations r
   where r.dining_table_id=t.id and r.status not in ('cancelled','no-show')
    and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(st,en,'[)')) then continue;end if;
  if exists(select 1 from public.reservation_extra_tables x where x.active and x.dining_table_id=t.id
   and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(st,en,'[)')) then continue;end if;
  chosen:=t.id;exit;
 end loop;
 if chosen is not null then
  return public.staff_save_reservation_v2(p_site,p_first,p_last,p_phone,p_email,
    p_day,p_time,p_party,p_source,p_notes,chosen,null,p_request,false);
 end if;
 -- For a larger party, only use manager-approved movable pairs;
 -- if none is available, fail closed instead of overriding a blocked table.
 if p_party>4 then
   return public.staff_create_joined_reservation(p_site,p_first,p_last,p_phone,p_email,
     p_day,p_time,p_party,p_source,p_notes,p_request);
 end if;
 raise exception 'No eligible tables available. Check table rules or choose a table manually.';
end $$;
revoke all on function public.staff_auto_allocate_booking(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.staff_auto_allocate_booking(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid) to authenticated;
