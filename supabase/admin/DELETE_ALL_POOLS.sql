-- PLYDECK one-time cleanup: remove every existing pool and its dependent records.
-- Preserves Auth users, profiles, admins, categories, shipments and WhatsApp templates.
-- Run this complete file once in Supabase SQL Editor.

begin;

create temporary table _plydeck_pool_cleanup on commit drop as
select id from public.pools;

create temporary table _plydeck_order_cleanup on commit drop as
select id from public.orders
where pool_id in (select id from _plydeck_pool_cleanup);

create temporary table _plydeck_refund_cleanup on commit drop as
select id from public.refunds
where order_id in (select id from _plydeck_order_cleanup);

create temporary table _plydeck_attempt_cleanup on commit drop as
select id from public.payment_attempts
where order_id in (select id from _plydeck_order_cleanup);

create temporary table _plydeck_payment_cleanup on commit drop as
select id from public.payments
where order_id in (select id from _plydeck_order_cleanup)
   or attempt_id in (select id from _plydeck_attempt_cleanup);

-- Delete the deepest dependencies first to satisfy foreign keys.
delete from public.refund_tasks
where refund_id in (select id from _plydeck_refund_cleanup)
   or payment_id in (select id from _plydeck_payment_cleanup);

delete from public.refunds
where id in (select id from _plydeck_refund_cleanup);

delete from public.manual_payments
where order_id in (select id from _plydeck_order_cleanup);

delete from public.payments
where id in (select id from _plydeck_payment_cleanup);

delete from public.payment_attempts
where id in (select id from _plydeck_attempt_cleanup);

delete from public.whatsapp_messages
where pool_id in (select id from _plydeck_pool_cleanup)
   or order_id in (select id from _plydeck_order_cleanup);

delete from public.slot_allocations
where pool_id in (select id from _plydeck_pool_cleanup)
   or order_id in (select id from _plydeck_order_cleanup);

delete from public.vacated_slots
where pool_id in (select id from _plydeck_pool_cleanup)
   or source_order in (select id from _plydeck_order_cleanup);

delete from public.waitlist
where pool_id in (select id from _plydeck_pool_cleanup);

delete from public.blocked_slots
where pool_id in (select id from _plydeck_pool_cleanup);

delete from public.audit_log
where entity_id in (select id from _plydeck_pool_cleanup)
   or entity_id in (select id from _plydeck_order_cleanup);

delete from public.orders
where id in (select id from _plydeck_order_cleanup);

delete from public.pools
where id in (select id from _plydeck_pool_cleanup);

-- The returned counts must all be zero before the transaction commits.
do $$
begin
  if exists(select 1 from public.pools) then
    raise exception 'Pool cleanup did not complete; transaction rolled back.';
  end if;
end;
$$;

commit;

select
  (select count(*) from public.pools) as remaining_pools,
  (select count(*) from public.orders) as remaining_orders,
  (select count(*) from public.slot_allocations) as remaining_slot_allocations,
  (select count(*) from public.blocked_slots) as remaining_blocked_slots;
