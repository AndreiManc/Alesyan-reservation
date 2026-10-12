-- Privacy and no-show payment metadata scaffolding; NO raw card details.
create table public.site_privacy_settings (
 site_id uuid primary key references public.sites(id) on delete cascade,
 controller_name text not null default '',
 privacy_contact_email text not null default '',
 privacy_notice_url text,
 guest_retention_days integer not null default 365 check(guest_retention_days between 30 and 2555),
 booking_retention_days integer not null default 730 check(booking_retention_days between 30 and 2555),
 no_show_fee_cents integer not null default 0 check(no_show_fee_cents between 0 and 50000),
 cancellation_cutoff_hours integer not null default 24 check(cancellation_cutoff_hours between 0 and 168),
 no_show_card_requirement_enabled boolean not null default false,
 reviewed_at timestamptz,
 constraint require_policy_for_cards check(not no_show_card_requirement_enabled or (length(btrim(controller_name))>1 and privacy_notice_url is not null and no_show_fee_cents>0))
);
insert into public.site_privacy_settings(site_id)
select id from public.sites on conflict do nothing;
alter table public.site_privacy_settings enable row level security;
revoke all on public.site_privacy_settings from anon;
grant select on public.site_privacy_settings to authenticated;
create policy site_privacy_settings_read on public.site_privacy_settings
for select to authenticated using(private.is_site_staff(site_id));

create table public.reservation_card_authorizations (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null references public.sites(id) on delete cascade,
 reservation_id uuid not null unique references public.reservations(id) on delete cascade,
 processor text not null check(processor in ('stripe')),
 processor_reference text not null check(length(processor_reference) between 5 and 255),
 payment_method_reference text,
 brand text check(brand is null or length(brand)<=40),
 last4 text check(last4 is null or last4~'^[0-9]{4}$'),
 policy_version text not null,
 policy_accepted_at timestamptz not null,
 amount_cap_cents integer not null check(amount_cap_cents between 0 and 50000),
 currency char(3) not null default 'EUR',
 status text not null check(status in ('pending','setup_complete','revoked','expired')) default 'pending',
 created_at timestamptz not null default now(),
 constraint no_pan_or_cvv check(
 processor_reference !~ '[0-9]{13,19}' and
 coalesce(payment_method_reference,'') !~ '[0-9]{13,19}'
 )
);
create index reservation_card_auth_site_idx on public.reservation_card_authorizations(site_id,reservation_id);
alter table public.reservation_card_authorizations enable row level security;
revoke all on public.reservation_card_authorizations from anon,authenticated;
-- Staff are not given payment provider tokens. Show an audited and restricted summary instead.
create or replace function public.staff_card_status(p_site uuid,p_reservation uuid)
returns table(status text,brand text,last4 text,amount_cap_cents integer,policy_accepted_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not private.is_site_staff(p_site) then raise exception 'Not authorised' using errcode='42501';end if;
 return query select a.status,a.brand,a.last4,a.amount_cap_cents,a.policy_accepted_at
 from public.reservation_card_authorizations a where a.site_id=p_site and a.reservation_id=p_reservation;
end $$;
revoke all on function public.staff_card_status(uuid,uuid) from public,anon;
grant execute on function public.staff_card_status(uuid,uuid) to authenticated;

create or replace function public.staff_update_privacy_settings(
 p_site uuid,p_controller text,p_email text,p_notice text,p_guest_days integer,p_booking_days integer
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager required' using errcode='42501';end if;
 if length(btrim(coalesce(p_controller,'')))<2 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_notice !~ '^https://[^[:space:]]+$' then raise exception 'Controller, privacy contact and HTTPS notice URL required';end if;
 update public.site_privacy_settings set controller_name=btrim(p_controller),
 privacy_contact_email=btrim(p_email),privacy_notice_url=p_notice,
 guest_retention_days=p_guest_days,booking_retention_days=p_booking_days,reviewed_at=now()
 where site_id=p_site;
 if not found then raise exception 'Site privacy settings not found';end if;
end $$;
revoke all on function public.staff_update_privacy_settings(uuid,text,text,text,integer,integer) from public,anon;
grant execute on function public.staff_update_privacy_settings(uuid,text,text,text,integer,integer) to authenticated;
