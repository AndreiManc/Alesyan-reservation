-- Database hardening for dedicated Alesyan Reservations (2026-10-11).
-- Supabase default grants include an explicit anon role EXECUTE on newly-created
-- functions. Revoking only from PUBLIC does NOT revoke the direct anon grant.
revoke execute on function public.staff_save_reservation(uuid,text,date,time,integer,text,text,uuid,uuid,uuid) from anon, public;
revoke execute on function public.staff_change_reservation_status(uuid,text) from anon, public;
revoke execute on function public.staff_upsert_table(uuid,text,integer,text,boolean,uuid) from anon, public;
revoke execute on function public.staff_update_settings(uuid,time,time,time,time,integer,integer,integer,integer,integer) from anon, public;
grant execute on function public.staff_save_reservation(uuid,text,date,time,integer,text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.staff_change_reservation_status(uuid,text) to authenticated;
grant execute on function public.staff_upsert_table(uuid,text,integer,text,boolean,uuid) to authenticated;
grant execute on function public.staff_update_settings(uuid,time,time,time,time,integer,integer,integer,integer,integer) to authenticated;
alter extension btree_gist set schema extensions;
create index if not exists sites_organisation_id_idx on public.sites(organisation_id);
create index if not exists reservations_site_guest_idx on public.reservations(site_id,guest_id);
create index if not exists reservations_site_table_idx on public.reservations(site_id,dining_table_id);
create index if not exists reservations_created_by_idx on public.reservations(created_by) where created_by is not null;
create index if not exists reservation_events_reservation_id_idx on public.reservation_events(reservation_id);
create index if not exists reservation_events_actor_id_idx on public.reservation_events(actor_id) where actor_id is not null;
