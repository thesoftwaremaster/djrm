-- Keep tester seeding as an explicit maintainer-only SQL action.
-- The function is intentionally not callable by browser/API roles.

revoke all on function public.seed_tester_crm_data() from public;
revoke all on function public.seed_tester_crm_data() from anon;
revoke all on function public.seed_tester_crm_data() from authenticated;
