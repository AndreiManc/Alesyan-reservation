-- Per-party booking duration + conservative card guarantee enforcement.
-- No card PAN/CVV is stored. Card collection is NOT enabled.
create table public.booking_duration_rules(
 site_id uuid not null references public.sites(id) on delete cascade,
 party_size integer not null check(party_size between 1 and 100),
 duration_mins integer not null check(duration_mins between 30 and 480),
 primary key(site_id,party_size)
);
alter table public.booking_duration_rules enable row level security;
revoke all on public.booking_duration_rules from anon;
grant select on public.booking_duration_rules to authenticated;
create policy staff_read_booking_durations on public.booking_duration_rules for select to authenticated using(private.is_site_staff(site_id));
insert into public.booking_duration_rules(site_id,party_size,duration_mins)
select id,2,75 from public.sites on conflict do nothing;

alter table public.site_privacy_settings
 add column if not exists card_required_from_party_size integer not null default 10
 check(card_required_from_party_size between 2 and 100);

alter table public.reservations
 add column if not exists card_guarantee_status text not null default 'not_required'
 check(card_guarantee_status in ('not_required','declined','required_pending','staff_waived','secured')),
 add column if not exists card_override_reason text,
 add column if not exists duration_override_mins integer check(duration_override_mins between 30 and 480);

create or replace function public.staff_set_duration_rule(p_site uuid,p_party integer,p_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
 if p_party not between 1 and 100 or p_minutes not between 30 and 480 then raise exception 'Invalid duration rule';end if;
 insert into public.booking_duration_rules(site_id,party_size,duration_mins)
 values(p_site,p_party,p_minutes)
 on conflict(site_id,party_size) do update set duration_mins=excluded.duration_mins;
end $$;

create or replace function public.staff_save_booking_with_policy(
 p_site uuid,p_first text,p_last text,p_phone text,p_email text,
 p_day date,p_time time,p_party integer,p_source text default 'Phone',p_notes text default '',
 p_preferred uuid default null,p_existing uuid default null,p_request uuid default null,
 p_duration_override integer default null,p_card_declined boolean default false,
 p_card_override_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 booking uuid; cfg public.site_settings%rowtype; policy public.site_privacy_settings%rowtype;
 configured_mins integer; effective_mins integer; needs_card boolean;
 actual_start timestamptz; old_status text; approved boolean;
begin
 if not private.is_site_staff(p_site) then raise exception 'Not authorised' using errcode='42501';end if;
 select * into cfg from public.site_settings where site_id=p_site;
 select * into policy from public.site_privacy_settings where site_id=p_site;
 if cfg.site_id is null or policy.site_id is null or p_party<1 or p_party>cfg.max_party_size then raise exception 'Invalid party size';end if;
 if p_duration_override is not null and p_duration_override not between 30 and 480 then raise exception 'Duration must be 30–480 minutes';end if;
 select duration_mins into configured_mins from public.booking_duration_rules where site_id=p_site and party_size=p_party;
 effective_mins:=coalesce(p_duration_override,configured_mins,
   case when p_party>4 then cfg.large_duration_mins else cfg.small_duration_mins end);
 needs_card:=p_party>=policy.card_required_from_party_size;
 approved:=private.is_site_staff(p_site,array['owner','manager']);
 if needs_card and (not approved or length(btrim(coalesce(p_card_override_reason,'')))<8) then
  raise exception 'Parties of % require a card guarantee. Card processing is not enabled. A manager may waive this with a reason.',policy.card_required_from_party_size;
 end if;
 if not needs_card and p_card_override_reason is not null then raise exception 'Card override is only for mandatory-card bookings';end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site::text,47291));
 -- The existing allocator performs authoritative collision checks using its standard duration.
 -- Extend/reduce only inside the same transaction; exclusion and joined-table triggers recheck.
 booking:=public.staff_auto_allocate_booking(p_site,p_first,p_last,p_phone,p_email,p_day,p_time,
             p_party,p_source,p_notes,p_preferred,p_existing,p_request);
 select starts_at,card_guarantee_status into actual_start,old_status from public.reservations
 where id=booking and site_id=p_site;
 if actual_start is null then raise exception 'Reservation not found';end if;
 update public.reservations set
   ends_at=actual_start+make_interval(mins=>effective_mins+cfg.turnover_buffer_mins),
   duration_override_mins=p_duration_override,
   card_guarantee_status=case when needs_card then 'staff_waived'
     when p_card_declined then 'declined' else 'not_required' end,
   card_override_reason=case when needs_card then btrim(p_card_override_reason) else null end,
   updated_at=now()
 where id=booking;
 insert into public.reservation_events(site_id,reservation_id,actor_id,event,payload)
 values(p_site,booking,(select auth.uid()),'updated',
   jsonb_build_object('booking_duration_mins',effective_mins,
    'duration_override',p_duration_override,
    'card_requirement',case when needs_card then 'staff_waived' when p_card_declined then 'declined' else 'not_required' end,
    'card_override_reason',case when needs_card then btrim(p_card_override_reason) else null end));
 return booking;
end $$;
revoke all on function public.staff_set_duration_rule(uuid,integer,integer) from public,anon;
grant execute on function public.staff_set_duration_rule(uuid,integer,integer) to authenticated;
revoke all on function public.staff_save_booking_with_policy(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,integer,boolean,text) from public,anon;
grant execute on function public.staff_save_booking_with_policy(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,integer,boolean,text) to authenticated;
