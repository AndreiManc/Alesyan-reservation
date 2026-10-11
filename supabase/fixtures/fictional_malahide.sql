-- This fixture is exclusively for the NEW isolated Reservations project.
-- It contains fictional, non-identifying venue and customer data, and does
-- not configure OpenTable, real emails, payments or any actual restaurant.
do $$
declare
  v_org uuid; v_site uuid; v_main uuid; v_terrace uuid;
  v_guest uuid; v_booking uuid; v_table uuid;
  rec record; v_date date; v_start timestamptz; v_mins integer;
begin
  if exists(select 1 from public.sites where slug='alesyan-demo-malahide') then
    raise exception 'Fictional site already installed. Refusing duplicate fixture.';
  end if;
  insert into public.organisations(name) values('Alesyan Reservations Demonstration')
    returning id into v_org;
  insert into public.sites(organisation_id,name,slug,timezone)
    values(v_org,'Alesyan Demo — Malahide','alesyan-demo-malahide','Europe/Dublin')
    returning id into v_site;
  insert into public.site_settings(site_id) values(v_site);
  insert into public.dining_areas(site_id,name)
    values(v_site,'Main Dining') returning id into v_main;
  insert into public.dining_areas(site_id,name)
    values(v_site,'Terrace') returning id into v_terrace;
  insert into public.dining_tables(site_id,area_id,label,capacity,shape,x,y) values
    (v_site,v_main,'T1',2,'square',20,20),
    (v_site,v_main,'T2',2,'square',120,20),
    (v_site,v_main,'T3',4,'rectangle',20,110),
    (v_site,v_main,'T4',4,'rectangle',120,110),
    (v_site,v_main,'T5',6,'rectangle',220,110),
    (v_site,v_main,'T6',6,'rectangle',220,20),
    (v_site,v_terrace,'T7',2,'round',20,20),
    (v_site,v_terrace,'T8',4,'round',130,20);
  for rec in
    select * from (values
      ('Alex Murphy',0,'12:00'::time,2,'T1','completed','Website','Window requested'),
      ('Sarah Kelly',0,'12:30'::time,4,'T3','completed','Phone','Birthday'),
      ('Daniel Byrne',0,'13:00'::time,2,'T2','completed','OpenTable (historic)',''),
      ('Niamh Walsh',0,'17:30'::time,6,'T5','confirmed','Website','Vegetarian guest (synthetic)'),
      ('Jamie Ryan',0,'18:00'::time,4,'T4','seated','Phone',''),
      ('Erin Doyle',0,'19:00'::time,2,'T1','confirmed','Website',''),
      ('Eoin OBrien',0,'19:30'::time,4,'T8','cancelled','Other',''),
      ('Anna Nolan',1,'11:30'::time,2,'T1','confirmed','Website',''),
      ('Michael Reilly',1,'12:30'::time,4,'T4','confirmed','Phone',''),
      ('Cian Burke',1,'18:00'::time,6,'T6','confirmed','Website',''),
      ('Megan Flynn',1,'19:00'::time,4,'T3','confirmed','Phone',''),
      ('Lara Smith',1,'19:30'::time,2,'T7','confirmed','Website','')
    ) x(guest_name,day_offset,arrival,party,table_label,booking_status,booking_source,note)
  loop
    select id into strict v_table from public.dining_tables
      where site_id=v_site and label=rec.table_label;
    v_date := (now() at time zone 'Europe/Dublin')::date+rec.day_offset;
    v_start := (v_date+rec.arrival) at time zone 'Europe/Dublin';
    v_mins := case when rec.party>4 then 120 else 90 end+15;
    insert into public.guests(site_id,full_name) values(v_site,rec.guest_name)
      returning id into v_guest;
    insert into public.reservations(site_id,guest_id,dining_table_id,party_size,
      starts_at,ends_at,status,source,notes)
      values(v_site,v_guest,v_table,rec.party,v_start,
        v_start+make_interval(mins=>v_mins),rec.booking_status,rec.booking_source,rec.note)
      returning id into v_booking;
    insert into public.reservation_events(site_id,reservation_id,event,payload)
      values(v_site,v_booking,'created',jsonb_build_object('synthetic',true));
  end loop;
end $$;