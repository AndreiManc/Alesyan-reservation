-- Staff booking with customer contact details and automatic table rearrangement.
-- Dedicated Reservations project ONLY. Public demo still stores synthetic data only.
create or replace function public.staff_save_reservation_v2(
 p_site_id uuid,p_first_name text,p_last_name text,p_phone text,p_email text,
 p_day date,p_time time,p_party integer,p_source text default 'Phone',
 p_notes text default '',p_preferred_table_id uuid default null,
 p_reservation_id uuid default null,p_request_id uuid default null,
 p_allow_rearrange boolean default true
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid; v_guest uuid; v_name text;
 v_site public.sites%rowtype; v_settings public.site_settings%rowtype;
 v_start timestamptz; v_end timestamptz; v_duration integer;
 v_target record; v_blocker record; v_alt uuid;
 v_day date; v_locked boolean:=false;
begin
 if not private.is_site_staff(p_site_id) then raise exception 'Not authorised' using errcode='42501';end if;
 if length(btrim(coalesce(p_first_name,'')))>80 or length(btrim(coalesce(p_last_name,''))) not between 1 and 80
  or length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 7 and 15
  or length(coalesce(p_phone,''))>30 or length(coalesce(p_email,''))>254
  or (nullif(btrim(coalesce(p_email,'')),'') is not null and p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 then raise exception 'Valid last name and telephone number are mandatory; email must be valid if supplied';end if;
 v_name:=btrim(coalesce(p_first_name,'')||' '||btrim(p_last_name));
 select * into v_site from public.sites where id=p_site_id;
 select * into v_settings from public.site_settings where site_id=p_site_id;
 if v_site.id is null or v_settings.site_id is null then raise exception 'Restaurant not configured';end if;
 v_start:=(p_day+p_time) at time zone v_site.timezone;
 v_duration:=(case when p_party>4 then v_settings.large_duration_mins else v_settings.small_duration_mins end)+v_settings.turnover_buffer_mins;
 v_end:=v_start+make_interval(mins=>v_duration);

 -- Serialize ALL v2 allocations on this site for deterministic multi-booking rearrangement.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site_id::text,47291));
 -- Do not rearrange an explicitly selected table or an existing booking.
 if p_reservation_id is null and p_preferred_table_id is null and p_allow_rearrange and v_start>now() then
  -- Only try rearranging when the normal automatic allocator has no free table.
  if not exists(
   select 1 from public.dining_tables t where t.site_id=p_site_id and t.active and t.capacity>=p_party
   and not exists(select 1 from public.reservations r where r.dining_table_id=t.id
    and r.status not in ('cancelled','no-show')
    and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
  ) then
   -- Rearrange at most ONE existing CONFIRMED booking, NEVER a seated or completed one.
   -- Existing booking moves only if an alternative can hold its entire occupied duration.
   for v_target in
    select t.id,t.capacity from public.dining_tables t
    where t.site_id=p_site_id and t.active and t.capacity>=p_party order by t.capacity,t.label
   loop
    select r.* into v_blocker from public.reservations r
    where r.dining_table_id=v_target.id and r.status not in ('cancelled','no-show')
      and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
    order by r.starts_at limit 1;
    if not found or v_blocker.status<>'confirmed' then continue;end if;
    -- Moving the blocking reservation must free this table across the new booking's full span.
    if exists(select 1 from public.reservations r where r.dining_table_id=v_target.id and r.id<>v_blocker.id
     and r.status not in ('cancelled','no-show')
     and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_start,v_end,'[)')) then continue;end if;
    select t.id into v_alt from public.dining_tables t
    where t.site_id=p_site_id and t.active and t.capacity>=v_blocker.party_size and t.id<>v_target.id
      and not exists(select 1 from public.reservations r where r.dining_table_id=t.id
      and r.status not in ('cancelled','no-show') and r.id<>v_blocker.id
      and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_blocker.starts_at,v_blocker.ends_at,'[)'))
    order by t.capacity,t.label limit 1;
    if v_alt is null then continue;end if;
    update public.reservations set dining_table_id=v_alt,updated_at=now() where id=v_blocker.id;
    insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
    values(p_site_id,v_blocker.id,(select auth.uid()),'updated',
      jsonb_build_object('automatic_rearrangement',true,'previous_table_id',v_target.id,'new_table_id',v_alt));
    v_locked:=true;
    exit;
   end loop;
  end if;
 end if;
 -- The existing validated and exclusion-protected allocation remains source of truth.
 v_id:=public.staff_save_reservation(p_site_id,v_name,p_day,p_time,p_party,p_source,p_notes,
                                   p_preferred_table_id,p_reservation_id,p_request_id);
 select guest_id into strict v_guest from public.reservations where id=v_id and site_id=p_site_id;
 update public.guests set full_name=v_name,phone=btrim(p_phone),email=nullif(btrim(coalesce(p_email,'')),'')
   where id=v_guest and site_id=p_site_id;
 return v_id;
end $$;
revoke all on function public.staff_save_reservation_v2(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.staff_save_reservation_v2(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,boolean) to authenticated;
