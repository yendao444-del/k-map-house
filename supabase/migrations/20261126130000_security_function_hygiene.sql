-- Security review 26/11/2026: clear the remaining Supabase linter warnings.
begin;
-- Trigger-only function: nobody needs to call it through the API.
revoke execute on function public.advance_room_meter_on_invoice_payment() from public, anon, authenticated;
-- Pin search_path on the two remaining functions flagged by the linter.
alter function public.wallet_checkpoint_immutable() set search_path = '';
alter function public.wallet_guard_version() set search_path = '';
commit;
