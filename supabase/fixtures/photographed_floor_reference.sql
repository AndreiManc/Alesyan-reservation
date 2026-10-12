-- Screenshot-based floor reference. Inactive placeholders avoid inventing real seating capacity.
-- Preserve all existing demo tables and sample reservations.
with site as (select id from public.sites where slug='alesyan-demo-malahide'),
area as (select a.id,a.site_id from public.dining_areas a join site s on s.id=a.site_id where a.name='Main Dining'),
reference(label,x,y,shape) as (values
 ('10',24,535,'square'),('11',24,480,'square'),('12',24,425,'square'),
 ('13',24,370,'square'),('14',24,315,'square'),('15',24,260,'square'),('16',24,145,'square'),('17',24,55,'square'),
 ('20',142,55,'round'),('21',390,55,'square'),('22',455,55,'rectangle'),
 ('30',145,245,'square'),('31',200,245,'square'),('32',257,245,'rectangle'),
 ('33',340,245,'rectangle'),('34',385,245,'rectangle'),('35',447,245,'square'),
 ('41',450,455,'square'),('42',450,390,'rectangle'),('43',450,315,'square'),
 ('51',535,480,'rectangle'),('52',535,418,'rectangle'),('53',535,355,'rectangle'),
 ('54',535,292,'rectangle'),('55',535,230,'rectangle'),('56',535,165,'rectangle'),('57',535,55,'rectangle')
)
insert into public.dining_tables(site_id,area_id,label,capacity,shape,x,y,active,movable,auto_large_booking_enabled)
select area.site_id,area.id,reference.label,2,reference.shape,reference.x,reference.y,false,false,true from reference cross join area
where not exists(select 1 from public.dining_tables t where t.site_id=area.site_id and t.label=reference.label);
update public.dining_tables t set movable=false
where t.site_id=(select id from public.sites where slug='alesyan-demo-malahide')
and t.label in ('10','11','12','51','52','53','54','55','56','57');
update public.table_join_pairs p set enabled=false where p.site_id=(select id from public.sites where slug='alesyan-demo-malahide')
and exists (select 1 from public.dining_tables t where t.id in (p.table_a,p.table_b) and t.label in ('10','11','12','51','52','53','54','55','56','57'));