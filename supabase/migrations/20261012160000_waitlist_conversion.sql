-- Convert a waitlist entry into a confirmed reservation atomically.
-- Only staff assigned to the restaurant can invoke this function.
create or replace function public.staff_confirm_waitlist(
 p_waitlist uuid,p_first_name text,p_last_name text,p_email text default '',
 p_duration_override integer default null,p_waiver_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.waitlist_entries%rowtype;v_id uuid;v_site public.sites%rowtype;
begin
 select * into w from public.waitlist_entries where id=p_waitlist for update;
 if w.id is null or not private.is_site_staff(w.site_id) then
 raise exception 'Waitlist entry unavailable or not authorised' using errcode='42501';end if;
 if w.status not in ('waiting','contacted') then raise exception 'Waitlist entry already closed';end if;
 select * into v_site from public.sites where id=w.site_id;
 if w.service_day<(now() at time zone v_site.timezone)::date then raise exception 'Requested date is in the past';end if;
 v_id:=public.staff_save_booking_with_policy(
  w.site_id,p_first_name,p_last_name,w.phone,coalesce(p_email,''),
  w.service_day,w.requested_time,w.party_size,'Phone',
  left('Waitlist conversion: '||w.note,500),null,null,w.id,
  p_duration_override,false,p_waiver_reason);
 update public.waitlist_entries set status='booked',reservation_id=v_id,updated_at=now() where id=w.id;
 insert into public.waitlist_events(site_id,waitlist_id,actor_id,event,old_status,new_status)
 values(w.site_id,w.id,(select auth.uid()),'converted_to_booking',w.status,'booked');
 return v_id;
end $$;
revoke all on function public.staff_confirm_waitlist(uuid,text,text,text,integer,text) from public,anon;
grant execute on function public.staff_confirm_waitlist(uuid,text,text,text,integer,text) to authenticated;