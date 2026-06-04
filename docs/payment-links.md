# Payment Links

This app uses Stripe Checkout as the payment-link foundation.

## Required Supabase Secrets

Set these in Supabase before deploying the Edge Functions:

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_or_live_value
npx supabase secrets set STRIPE_WEBHOOK_SIGNING_SECRET=whsec_value
npx supabase secrets set APP_BASE_URL=https://your-app-domain.example
npx supabase secrets set RESEND_API_KEY=re_value
npx supabase secrets set INVOICE_FROM_EMAIL="DJ RM <invoices@your-domain.example>"
npx supabase secrets set AUTOMATION_SECRET=use_a_long_random_value
```

Supabase also provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The functions accept either `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` for caller authentication checks.

Do not put Stripe, Resend, or service-role secrets in frontend code.

## Functions

Deploy:

```bash
npx supabase functions deploy send-invoice
npx supabase functions deploy create-payment-link
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy invoice-automation --no-verify-jwt
```

`stripe-webhook` must not rely on Supabase JWT auth because Stripe calls it directly. It verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SIGNING_SECRET`.

## Stripe Webhook

In Stripe Dashboard, create a webhook endpoint:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

* `checkout.session.completed`

Copy the webhook signing secret into `STRIPE_WEBHOOK_SIGNING_SECRET`.

## Data Flow

1. A signed-in user opens an invoice.
2. `create-payment-link` verifies the user and loads only their invoice.
3. Stripe Checkout creates a hosted payment session for the current database balance due.
4. The app stores an immutable `invoice_payment_sessions` row with the Stripe session id, expected amount, expected currency, and payment type.
5. The invoice stores the latest `payment_provider`, `payment_link_url`, and `payment_session_id` for UI/email display.
6. `send-invoice` includes `payment_link_url` when present.
7. Stripe calls `stripe-webhook` after payment.
8. The webhook verifies the Stripe signature.
9. The webhook validates the paid amount and currency against `invoice_payment_sessions`.
10. The webhook records one paid `payments` row through `record_online_invoice_payment`.
11. Database rollup updates invoice `amount_paid`, `balance_due`, `payment_status`, and `status`.
12. Paid invoices are activity-logged and receipt/owner emails are sent once, guarded by `receipt_sent_at` and `owner_notified_at`.

Frontend redirects are not trusted as proof of payment.

Webhook idempotency is enforced with unique provider/session and provider/event indexes. Replayed Stripe events return the existing payment instead of creating duplicates.

## Daily Automation

Deploy `invoice-automation` with `--no-verify-jwt` and protect it with `AUTOMATION_SECRET`. Call it daily from Supabase Scheduled Functions or an external scheduler:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_AUTOMATION_SECRET" \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/invoice-automation
```

It marks overdue unpaid invoices and sends any missing paid-invoice receipt/owner notifications. It does not send overdue reminder emails to clients.

## Demo And Tester Behavior

* `demo@djrm.co` cannot create real payment sessions.
* `tester@djrm.co` can create Stripe test-mode payment links only for tester-owned invoices.
* Personal users cannot see or create payment links for tester invoices because invoice lookup is scoped by `user_id`.

## Local Test Checklist

* Apply migrations.
* Set Stripe test secrets.
* Deploy Edge Functions.
* Create a tester invoice.
* Click `Create payment link`.
* Confirm invoice stores a Stripe Checkout URL.
* Click `Send Invoice`; email should include the payment link.
* Pay with Stripe test card `4242 4242 4242 4242`.
* Confirm webhook creates a paid payment row.
* Confirm invoice shows updated amount paid, balance due, and payment status.
* Confirm manual payment recording still works on a separate invoice.
