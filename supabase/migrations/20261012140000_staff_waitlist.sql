-- Staff-only waitlist, isolated to the Reservations project (test data only).
create table public.waitlist_entries(
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 service_day date not null,
 requested_time time not null,
 party_size integer not null check(party_size between 1 and 100),
 guest_name text not null check(length(guest_name) between 2 and 160),
 phone text not null check(length(phone) between 7 and 30),
 note text not null default '' check(length(note)<=500),
 status text not null default 'waiting' check(status in ('waiting','contacted','declined','booked','expired')),
 reservation_id uuid references public.reservations(id),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index waitlist_site_day_idx on public.waitlist_entries(site_id,service_day,status,requested_time);
alter table public.waitlist_entries enable row level security;
revoke all on public.waitlist_entries from public,anon;
grant select on public.waitlist_entries to authenticated;
create policy waitlist_staff_site_select on public.waitlist_entries for select to authenticated using(private.is_site_staff(site_id));

create table public.waitlist_events(
 id bigint generated always as identity primary key,
 site_id uuid not null references public.sites(id) on delete cascade,
 waitlist_id uuid not null references public.waitlist_entries(id) on delete cascade,
 actor_id uuid,
 event text not null,
 old_status text,
 new_status text,
 created_at timestamptz not null default now()
);
alter table public.waitlist_events enable row level security;
revoke all on public.waitlist_events from public,anon,authenticated;
create index waitlist_events_entry_idx on public.waitlist_events(waitlist_id,created_at);

create or replace function public.staff_waitlist_add(
 p_site uuid,p_day date,p_time time,p_party integer,
 p_guest text,p_phone text,p_note text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;cfg public.site_settings%rowtype;site public.sites%rowtype;
begin
 if not private.is_site_staff(p_site) then raise exception 'Not authorised' using errcode='42501';end if;
 select * into cfg from public.site_settings where site_id=p_site;
 select * into site from public.sites where id=p_site;
 if cfg.site_id is null or p_party<1 or p_party>cfg.max_party_size
 or p_day<(now() at time zone site.timezone)::date
 or p_day>(now() at time zone site.timezone)::date+cfg.max_advance_days
 or p_time is null or length(btrim(coalesce(p_guest,'')))<2 or length(p_guest)>160
 or length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 7 and 15
 or length(coalesce(p_phone,''))>30 or length(coalesce(p_note,''))>500
 then raise exception 'Invalid waitlist request';end if;
 insert into public.waitlist_entries(site_id,service_day,requested_time,party_size,guest_name,phone,note,created_by)
 values(p_site,p_day,p_time,p_party,btrim(p_guest),btrim(p_phone),coalesce(p_note,''),(select auth.uid()))
 returning id into v;
 insert into public.waitlist_events(site_id,waitlist_id,actor_id,event,new_status)
 values(p_site,v,(select auth.uid()),'created','waiting');
 return v;
end $$;

create or replace function public.staff_waitlist_status(p_id uuid,p_status text,p_reservation uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.waitlist_entries%rowtype; prior text;
begin
 select * into e from public.waitlist_entries where id=p_id for update;
 if e.id is null or not private.is_site_staff(e.site_id) then raise exception 'Not authorised' using errcode='42501';end if;
 if e.status not in ('waiting','contacted') or p_status not in ('waiting','contacted','declined','booked','expired') then
 raise exception 'Invalid waitlist transition';end if;
 if p_status='booked' and (p_reservation is null or not exists(select 1 from public.reservations r
 where r.id=p_reservation and r.site_id=e.site_id and r.status not in ('cancelled','no-show'))) then
 raise exception 'An existing reservation at the same restaurant is required to mark booked';end if;
 prior:=e.status;
 update public.waitlist_entries set status=p_status,reservation_id=case when p_status='booked' then p_reservation else null end,updated_at=now()
 where id=p_id;
 insert into public.waitlist_events(site_id,waitlist_id,actor_id,event,old_status,new_status)
 values(e.site_id,e.id,(select auth.uid()),'status_changed',prior,p_status);
end $$;
revoke all on function public.staff_waitlist_add(uuid,date,time,integer,text,text,text) from public,anon;
revoke all on function public.staff_waitlist_status(uuid,text,uuid) from public,anon;
grant execute on function public.staff_waitlist_add(uuid,date,time,integer,text,text,text) to authenticated;
grant execute on function public.staff_waitlist_status(uuid,text,uuid) to authenticated;
