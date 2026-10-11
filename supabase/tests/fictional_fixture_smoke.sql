-- The fixture is fictional and must remain non-identifying.
do $$
declare v_site uuid;
begin
  select id into v_site from public.sites where slug='alesyan-demo-malahide';
  if v_site is null then raise exception 'Fixture site missing'; end if;
  if (select count(*) from public.dining_tables where site_id=v_site) <> 8 then
    raise exception 'Fixture should contain eight tables';
  end if;
  if (select count(*) from public.reservations where site_id=v_site) <> 12 then
    raise exception 'Fixture should contain twelve reservations';
  end if;
  if (select count(*) from public.reservation_events where site_id=v_site) <> 12 then
    raise exception 'Fixture audit events missing';
  end if;
  if exists (select 1 from public.guests where phone is not null or email is not null) then
    raise exception 'Fixture must not contain real contact details';
  end if;
end $$;
select 'Fictional fixture verified' as result;
