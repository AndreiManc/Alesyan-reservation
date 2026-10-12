-- Prevent joining the photographed, fixed-position table groups in this demo site.
create or replace function private.protect_fixed_floor_tables()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.movable and new.label in ('10','11','12','51','52','53','54','55','56','57')
 and exists(select 1 from public.sites s where s.id=new.site_id and s.slug='alesyan-demo-malahide') then
   raise exception 'This fixed-position table cannot be joined automatically';
 end if;
 return new;
end $$;
create trigger protect_fixed_demo_floor before insert or update of movable,label on public.dining_tables
for each row execute function private.protect_fixed_floor_tables();