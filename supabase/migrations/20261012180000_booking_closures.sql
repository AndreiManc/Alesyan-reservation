-- Venue closure dates: shared backend guard across all reservation channels.
create table if not exists public.site_booking_closures(
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 service_day date not null,
 reason text not null check(length(btrim(reason)) between 3 and 250),
 created_by uuid,
 created_at timestamptz not null default now(),
 unique(site_id,service_day)
);
alter table public.site_booking_closures enable row level security;
revoke all on public.site_booking_closures from public,anon;
grant select on public.site_booking_closures to authenticated;
create policy staff_read_closures on public.site_booking_closures for select to authenticated using(private.is_site_staff(site_id));

create or replace function public.staff_set_booking_closure(p_site uuid,p_date date,p_reason text,p_block boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date; v_timezone text;
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501'; end if;
 select timezone into v_timezone from public.sites where id=p_site;
 if v_timezone is null then raise exception 'Restaurant not found';end if;
 v_today:=(now() at time zone v_timezone)::date;
 if p_date is null or p_date<v_today or p_date>v_today+365 then raise exception 'Closure date must be within next 365 days';end if;
 if p_block then
 if length(btrim(coalesce(p_reason,''))) not between 3 and 250 then raise exception 'Closure reason required';end if;
 insert into public.site_booking_closures(site_id,service_day,reason,created_by)
 values(p_site,p_date,btrim(p_reason),(select auth.uid()))
 on conflict(site_id,service_day) do update set reason=excluded.reason;
 else
 delete from public.site_booking_closures where site_id=p_site and service_day=p_date;
 end if;
end $$;
revoke all on function public.staff_set_booking_closure(uuid,date,text,boolean) from public,anon;
grant execute on function public.staff_set_booking_closure(uuid,date,text,boolean) to authenticated;

create or replace function private.prevent_booking_on_closed_day()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_timezone text; v_date date;
begin
 if new.status in ('cancelled','no-show') then return new;end if;
 if tg_op='UPDATE' and old.site_id=new.site_id and old.starts_at=new.starts_at then return new;end if;
 select timezone into v_timezone from public.sites where id=new.site_id;
 if v_timezone is null then raise exception 'Restaurant site missing';end if;
 v_date:=(new.starts_at at time zone v_timezone)::date;
 if exists(select 1 from public.site_booking_closures c where c.site_id=new.site_id and c.service_day=v_date) then
 raise exception 'Restaurant is not accepting new bookings on this date';
 end if;
 return new;
end $$;
create trigger prevent_closed_day_reservations
before insert or update of site_id,starts_at,status on public.reservations
for each row execute function private.prevent_booking_on_closed_day();