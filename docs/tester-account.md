# Tester Account Setup

Use this when one external tester needs a safe workspace in the CRM.

## Auth User

Create the tester in Supabase Dashboard:

1. Open Authentication > Users.
2. Add user with email `tester@djrm.co`.
3. Set the temporary password to `ChangeMe123!`.
4. Confirm the user if your project requires confirmed emails before sign-in.

Do not hardcode this password in frontend code or committed environment files.

## Data Isolation

CRM data is isolated by `user_id`, which stores the authenticated Supabase user id.

RLS allows authenticated users to select, insert, update, and delete only rows where `user_id = auth.uid()`. New frontend records include the current user id, and database triggers also fill or validate `user_id` on core CRM writes.

The tester account is not special at the database layer. It gets the same isolated workspace as any normal authenticated user.

## Optional Tester Seed

After creating `tester@djrm.co`, run this in Supabase SQL Editor if sample records are useful:

```sql
select public.seed_tester_crm_data();
```

The seed creates records clearly marked with `TESTER`, including:

* `TESTER Client - Wedding Enquiry`
* `TESTER Booking - Birthday Party`
* `TESTER Invoice - Sample Deposit`

The helper only assigns records to the Auth id for `tester@djrm.co`. It does not assign existing personal records to the tester, and it is safe to run more than once.

## Existing Personal Data

The tenant migration intentionally leaves any unowned historical rows untouched. Assign existing rows only after confirming the correct personal Auth user id.

Use the recovery scripts in `supabase/recovery/` if you need diagnostics or a controlled ownership repair.

## Manual Checklist

* Log in as `tester@djrm.co` and confirm the Tester Mode banner appears.
* Create, edit, and delete a tester customer/enquiry/booking/invoice/payment.
* Confirm the tester cannot see personal records.
* Log in as your personal account and confirm tester records are not visible.
* Log in as `demo@djrm.co` and confirm demo records cannot be deleted.
* In Supabase, verify RLS is enabled for CRM tables and optional file/template tables if present.
