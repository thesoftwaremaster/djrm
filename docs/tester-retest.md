# Tester Retest

## Tester Login

Use `tester@djrm.co`. The password is shared separately by the app owner and is intentionally not stored in this repository.

## Retest Checklist

1. Log in as `tester@djrm.co` and confirm the tester banner says the data is isolated and safe to edit.
2. Open `/settings`, `/schedule`, `/tasks`, `/security`, and `/invoices` directly in the browser and from the app navigation. None should show a 404.
3. Create a tester customer, enquiry, booking, and invoice. Use obvious names such as `TESTER Client - Retest`.
4. Convert an enquiry to a booking and confirm the invoice workflow still opens normally.
5. Send an invoice without a payment link and confirm the app shows either a success message or a clear email configuration error.
6. Create a Stripe payment link on a tester-owned invoice and confirm the invoice detail page shows the latest link, amount paid, balance due, and payment status.
7. Send the invoice again after creating the payment link and confirm the email includes the payment link.
8. Pay the Stripe Checkout link with a Stripe test card after the owner has deployed the webhook and test secrets.
9. Confirm the webhook creates one payment record only, updates amount paid and balance due, and marks the invoice partially paid or paid as appropriate.
10. Record a manual payment on a separate tester invoice and confirm manual payment tracking still updates invoice status.
11. Confirm `demo@djrm.co` cannot create a real Stripe payment session.
12. Confirm tester data is not visible from a personal account, and personal/demo data is not visible from the tester account.

## Known Limitations

Stripe payment links require deployed Edge Functions, configured Supabase secrets, and a Stripe webhook endpoint before online payment updates can complete.

The browser redirect after Stripe Checkout is not treated as proof of payment. The Stripe webhook is the source of truth.

Payment links currently create a Checkout session for the first unpaid deposit or balance payment when one exists, otherwise for the invoice balance due. This is not a full customer billing portal.

## Feedback To Send Back

Include the account used, page URL, invoice number, exact error text, expected result, actual result, and approximate time. For Stripe issues, include the Stripe test event id or Checkout session id if available.
