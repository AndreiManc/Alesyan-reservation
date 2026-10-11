-- This runs against CI's disposable PostgreSQL 17 database only.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','host@example.test'),
 ('00000000-0000-4000-8000-000000000002','other@example.test');
insert into public.organisations(id,name)
 values ('10000000-0000-4000-8000-000000000001','Test Group');
insert into public.sites(id,organisation_id,name,slug) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Demo One','demo-one'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Demo Two','demo-two');
insert into public.site_memberships(site_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','host'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','manager');
insert into public.site_settings(site_id) values
 ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into public.dining_areas(id,site_id,name) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Dining');
insert into public.dining_tables(id,site_id,area_id,label,capacity) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','T1',4),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','T2',4);
insert into public.guests(id,site_id,full_name) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fictional Guest');
insert into public.reservations(site_id,guest_id,dining_table_id,party_size,starts_at,ends_at)
 values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',4,
        ((current_date+1)+time '12:00') at time zone 'Europe/Dublin',
        ((current_date+1)+time '13:45') at time zone 'Europe/Dublin');
do $$
begin
  begin
    insert into public.reservations(site_id,guest_id,dining_table_id,party_size,starts_at,ends_at)
    values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',2,
      ((current_date+1)+time '12:30') at time zone 'Europe/Dublin',
      ((current_date+1)+time '13:00') at time zone 'Europe/Dublin');
    raise exception 'FAILED: exclusion constraint did not reject an overlap';
  exception when exclusion_violation then
    raise notice 'PASS: database rejects overlapping table allocation';
  end;
end $$;

-- RLS: host sees only their restaurant.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$
begin
  if (select count(*) from public.sites) <> 1
    or (select count(*) from public.reservations) <> 1 then
    raise exception 'FAILED: tenant isolation did not hold';
  end if;
  if private.is_site_staff('20000000-0000-4000-8000-000000000002') then
    raise exception 'FAILED: cross-site privilege leak';
  end if;
  if private.is_site_staff('20000000-0000-4000-8000-000000000001',array['manager','owner']) then
    raise exception 'FAILED: host has manager privileges';
  end if;
end $$;
-- RPC should allocate second table because first one is occupied.
select public.staff_save_reservation(
 '20000000-0000-4000-8000-000000000001'::uuid,
 'Second Fictional Guest',
 (current_date+interval '1 day')::date,
 '12:30'::time,
 2,'Phone','Created through staff RPC'
);
do $$
begin
  if (select count(*) from public.reservations where site_id='20000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FAILED: authenticated staff RPC creation failed';
  end if;
end $$;
rollback;

-- Unassigned person sees no rows and cannot book.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
do $$
begin
  if (select count(*) from public.sites)>0 or (select count(*) from public.guests)>0 then
    raise exception 'FAILED: unassigned person can view tenant data';
  end if;
  begin
    perform public.staff_save_reservation('20000000-0000-4000-8000-000000000001'::uuid,'Bad Actor',
      (current_date+interval '1 day')::date,'12:00'::time,2);
    raise exception 'FAILED: unassigned account could make booking';
  exception when insufficient_privilege then
    raise notice 'PASS: unauthorised staff RPC rejected';
  end;
end $$;
rollback;
select 'All reservation smoke tests passed' as result;
