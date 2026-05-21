# Security Review

## Overview

This CRM reads and writes Supabase tables directly from the browser using the publishable client.

Because there is no visible auth flow or protected route layer in the frontend, Supabase RLS is the primary security boundary for application data.

Core sensitive tables:

* clients
* enquiries
* bookings
* events
* invoices
* invoice_items
* payments
* booking_contracts
* activity_logs

---

## Current Security Assumptions

* The frontend uses only the publishable Supabase key
* The frontend directly reads and writes CRM data
* The app relies on Supabase RLS to prevent unauthorized access
* The `send-invoice` Edge Function uses service-role access only after authenticated user verification
* There is currently no clear multi-tenant ownership model documented (`user_id`, `account_id`, `tenant_id`)

---

## Frontend Direct Reads

The browser directly reads:

* clients
* enquiries
* bookings
* events
* invoices
* invoice_items
* payments
* booking_contracts
* activity_logs

The browser also writes contract files to the private Supabase Storage bucket `contracts`.

This means broad read policies could expose:

* personal data
* financial data
* booking/event schedules
* connected relational records via nested queries
* dashboard/business-wide metrics

---

## Frontend Direct Writes

The browser directly writes:

* clients
* enquiries
* bookings
* events
* invoices
* invoice_items
* payments

This means broad write policies could allow:

* fake record creation
* unauthorized status changes
* invoice/payment tampering
* booking/enquiry manipulation
* unauthorized contract upload/replacement if storage policies are too broad
* noisy or sensitive activity history if full payloads are logged

---

## Highest-Risk Areas

### Clients

Contains personal/customer data:

* names
* emails
* phone numbers

### Invoices

Contains financial/customer data:

* invoice numbers
* totals
* due dates
* notes
* linked clients

### Payments

Contains financial records:

* amounts
* paid status
* invoice linkage

### Events

Contains potentially private schedule/location data.

### Booking Contracts

Contains private contract documents and metadata linked to bookings.

Contract files must remain in a private Supabase Storage bucket. The app should generate short-lived signed URLs for view/download instead of storing or exposing public URLs.

### Activity Logs

Contains business history linked to records.

Activity logs should not store full request payloads, full payment details, private contract storage paths, signed URLs, customer contact details, or long free-text notes. Store short titles/descriptions and minimal identifiers only.

### Dashboard

Broad reads across the CRM can expose business-wide metrics if policies are too open.

### Nested queries

A permissive policy on one table may expose linked records through joins.

---

## Supabase Dashboard Checklist

### Authentication

Verify:

* whether real app users exist
* whether public signup is enabled
* whether the CRM is intended for internal/single-user use or multi-user use
* whether only trusted users can sign in

### RLS / Policies

Check these tables:

* clients
* enquiries
* bookings
* events
* invoices
* invoice_items
* payments
* booking_contracts
* activity_logs

Check Supabase Storage:

* `contracts` bucket exists
* bucket is private
* `anon` has no access to `storage.objects` for `contracts`
* `authenticated` policies are limited to `bucket_id = 'contracts'`

For each table verify:

* RLS is enabled
* there is no broad `USING (true)` or `WITH CHECK (true)` for `anon`
* `anon` has no direct CRM read/write access unless explicitly intended
* `authenticated` access matches the intended model
* insert policies use `WITH CHECK`
* update policies restrict who can modify rows
* delete policies exist only if deliberately needed

### Edge Functions

Verify:

* `send-invoice` requires authenticated callers
* JWT verification is enabled if supported by deployment settings
* function secrets exist only in Supabase secrets
* service-role key is never exposed in frontend code

### API / Keys

Verify:

* only publishable key is used in frontend
* service role key is not committed or exposed
* keys are rotated if exposure is suspected

---

## Manual Security Tests

### Logged-out tests

In an incognito/logged-out session:

* attempt direct REST reads using the publishable key
* attempt writes where possible
* all should fail for protected CRM data

### Logged-in tests

As a normal authenticated user:

* try reading records that should not be accessible
* try updating invoice/payment/status records that should not be accessible
* try creating payments on records the user should not control
* try uploading/downloading contracts for records the user should not control
* try reading activity logs for records the user should not control

### Edge Function tests

* invoke `send-invoice` without a session → should return 401
* try sending protected invoices (`paid`, `cancelled`) → should fail safely

---

## Known Current Risks

* The frontend directly accesses CRM tables, so weak RLS would expose real business/customer data
* Frontend protected routes improve logged-out UX, but they are not a database security boundary
* No clear ownership/tenant model is documented
* Browser-side status automation depends on RLS being correctly restrictive
* `send-invoice` currently enforces authenticated user presence, but not app-specific role/tenant ownership
* Sensitive console logging should be avoided in browser code

---

## Recommended Next Hardening Steps

1. Review and tighten all Supabase RLS policies
2. Remove unnecessary sensitive browser logging
3. Define the intended auth model:

   * internal single-user
   * trusted team users
   * multi-tenant SaaS
4. Add ownership fields if multi-user isolation is needed
5. Add frontend route protection once auth UX is introduced

---

## Summary

This CRM is functional, but its security currently depends heavily on correct Supabase RLS and auth configuration.

Before production use, policy review is mandatory.
