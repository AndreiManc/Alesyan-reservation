-- Separate public-facing restaurant profile metadata; staff management only until approved for publication.
create table if not exists public.site_restaurant_profiles(
 site_id uuid primary key references public.sites(id) on delete cascade,
 display_name text not null default '',
 description text not null default '',
 contact_phone text not null default '',
 website_url text not null default '',
 cuisine text not null default '',
 address_line text not null default '',
 published boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint profile_length_check check(length(display_name)<=140 and length(description)<=2000 and length(contact_phone)<=30 and length(website_url)<=500 and length(cuisine)<=150 and length(address_line)<=350)
);
insert into public.site_restaurant_profiles(site_id,display_name)
select id,name from public.sites on conflict(site_id) do nothing;
alter table public.site_restaurant_profiles enable row level security;
revoke all on public.site_restaurant_profiles from anon;
grant select on public.site_restaurant_profiles to authenticated;
create policy site_profile_read on public.site_restaurant_profiles for select to authenticated using(private.is_site_staff(site_id));

create or replace function public.staff_update_restaurant_profile(
 p_site uuid,p_name text,p_description text,p_phone text,p_website text,p_cuisine text,p_address text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_site_staff(p_site,array['owner','manager']) then raise exception 'Manager access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 140 or
 length(coalesce(p_description,''))>2000 or length(coalesce(p_phone,''))>30 or
 length(coalesce(p_website,''))>500 or length(coalesce(p_cuisine,''))>150 or
 length(coalesce(p_address,''))>350 or
 (nullif(btrim(coalesce(p_website,'')),'') is not null and p_website !~* '^https://[^[:space:]]+$')
 then raise exception 'Invalid restaurant profile; website must use HTTPS';end if;
 insert into public.site_restaurant_profiles(site_id,display_name,description,contact_phone,website_url,cuisine,address_line,published,updated_at)
 values(p_site,btrim(p_name),btrim(coalesce(p_description,'')),btrim(coalesce(p_phone,'')),btrim(coalesce(p_website,'')),btrim(coalesce(p_cuisine,'')),btrim(coalesce(p_address,'')),false,now())
 on conflict(site_id) do update set display_name=excluded.display_name,description=excluded.description,contact_phone=excluded.contact_phone,website_url=excluded.website_url,cuisine=excluded.cuisine,address_line=excluded.address_line,published=false,updated_at=now();
end $$;
revoke all on function public.staff_update_restaurant_profile(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.staff_update_restaurant_profile(uuid,text,text,text,text,text,text) to authenticated;
