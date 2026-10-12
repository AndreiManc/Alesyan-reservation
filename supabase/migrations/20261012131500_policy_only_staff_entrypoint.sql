-- Ensure staff booking creation goes through the policy-aware RPC only.
-- Internal SECURITY DEFINER routines remain callable by their owner, but not
-- directly by ordinary signed-in clients.
revoke execute on function public.staff_auto_allocate_booking(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid) from authenticated;
revoke execute on function public.staff_save_reservation_v2(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,boolean) from authenticated;
revoke execute on function public.staff_create_joined_reservation(uuid,text,text,text,text,date,time,integer,text,text,uuid) from authenticated;
revoke execute on function public.staff_save_reservation(uuid,text,date,time,integer,text,text,uuid,uuid,uuid) from authenticated;
grant execute on function public.staff_save_booking_with_policy(uuid,text,text,text,text,date,time,integer,text,text,uuid,uuid,uuid,integer,boolean,text) to authenticated;