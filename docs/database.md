# Database Architecture

## Overview

This project uses Supabase/Postgres for a CRM that manages:

* Clients
* Enquiries
* Bookings
* Events
* Invoices
* Invoice Items
* Payments
* Booking Contracts
* Activity Logs

Primary workflow:

Client → Enquiry → Booking → Invoice → Payment

Bookings represent jobs/work already converted from enquiries.

Core CRM tables are isolated by `user_id`, which stores the authenticated
Supabase Auth user id. Browser RLS policies require `user_id = auth.uid()` for
reads and writes.

---

## Table Relationships

### clients

Represents a person or company customer.

Key fields:

* `id`
* `user_id`
* `name`
* `email`
* `phone`

Relationships:

* one client can have many enquiries
* one client can have many invoices

---

### enquiries

Represents a lead/opportunity before or during conversion.

Key fields:

* `id`
* `user_id`
* `client_id`
* `event_type`
* `event_date`
* `venue`
* `status`
* `notes`

Relationships:

* belongs to one client
* can be converted into a booking

Status values used:

* `new`
* `contacted`
* `quoted`
* `booked`
* `lost`
* `completed`

Notes:

* booking creation should update enquiry status to `booked`
* venue is stored on enquiries before conversion, then copied to `events.location`
* existing working conversion logic should be preserved

---

### bookings

Represents an active/confirmed job created from an enquiry.

Key fields:

* `id`
* `user_id`
* `enquiry_id`
* `status`
* `total_price`

Relationships:

* belongs to one enquiry
* can have one related event row
* can have many invoices
* can have many payments
* can have one current booking_contracts row

Status values used:

* `pending`
* `confirmed`
* `completed`
* `cancelled`

Notes:

* when linked invoice is fully paid, booking may become `confirmed`
* do not overwrite `completed` or `cancelled`

---

### events

Represents timing/location information for a booking.

Key fields:

* `id`
* `user_id`
* `booking_id`
* `location`
* `start_time`
* `end_time`
* `notes`
* `created_at`

Relationships:

* belongs to one booking

Notes:

* events do NOT contain client_id, enquiry_id, event_type, or event_date columns
* only use actual schema columns when inserting/updating events
* `created_at` is used only for deterministic ordering when a booking has more than one event row

---

### invoices

Represents billing for a client/booking.

Key fields:

* `id`
* `user_id`
* `client_id`
* `booking_id`
* `invoice_number`
* `status`
* `subtotal`
* `tax`
* `total`
* `due_date`
* `notes`

Relationships:

* belongs to one client
* may belong to one booking
* has many invoice_items
* may have many payments through `payments.invoice_id`

Status values used:

* `draft`
* `sent`
* `part_paid`
* `paid`
* `overdue`
* `cancelled`

Automation rules:

* if paid amount >= total, invoice should become `paid`
* if paid amount is greater than 0 and less than total, invoice should become `part_paid`
* if unpaid and due_date is in the past, invoice should become `overdue`
* never overwrite `cancelled`

Important:

* correct invoice columns are:

  * `client_id`
  * `booking_id`
  * `invoice_number`
  * `status`
  * `subtotal`
  * `tax`
  * `total`
  * `due_date`
  * `notes`

Do NOT use non-existent fields like:

* `total_amount`
* `issue_date`

---

### invoice_items

Represents line items on an invoice.

Key fields:

* `id`
* `user_id`
* `invoice_id`
* `description`
* `quantity`
* `unit_price`
* `line_total`

Relationships:

* belongs to one invoice

Important:

* correct field is `line_total`
* do NOT use `total_amount`

---

### payments

Represents money received against invoices/bookings.

Key fields:

* `id`
* `user_id`
* `booking_id`
* `invoice_id`
* `amount`
* `type`
* `paid`
* `due_date`
* `created_at`

Relationships:

* belongs to one booking
* may belong to one invoice

Type values used:

* `deposit`
* `balance`
* `other`

Notes:

* payment totals are used to derive invoice status
* paid revenue comes from paid payments, not raw invoice totals
* unpaid scheduled payments may have optional due dates for chasing

---

### booking_contracts

Represents the current uploaded contract metadata for a booking.

Key fields:

* `id`
* `user_id`
* `booking_id`
* `file_name`
* `file_path`
* `status`
* `uploaded_at`

Relationships:

* belongs to one booking
* `file_path` points to a private Supabase Storage object in the `contracts` bucket

Status values used:

* `signed`

Notes:

* contract files are stored in Supabase Storage, not directly in table columns
* storage paths are scoped by user: `{auth.uid()}/{booking_id}/{timestamp}-{file_name}`
* only the current contract metadata is shown for each booking
* if no contract row exists, the UI should show `Not uploaded`

---

### activity_logs

Represents lightweight business activity/history.

Key fields:

* `id`
* `user_id`
* `entity_type`
* `entity_id`
* `booking_id`
* `client_id`
* `action`
* `title`
* `description`
* `metadata`
* `created_at`

Relationships:

* may belong to one booking
* may belong to one client
* can reference another primary entity through `entity_type` and `entity_id`

Notes:

* activity logging is best-effort and should not block the main workflow
* metadata should stay minimal
* do not store full file URLs, storage paths, full payment payloads, or sensitive notes in activity metadata

---

## Current Business Logic

### Enquiry to booking conversion

When a booking is created from an enquiry:

* insert booking with `enquiry_id`
* update enquiry status to `booked`

### Invoice-first workflow

Current invoice workflow may:

* find or create client
* create enquiry
* create booking
* optionally create event
* create invoice
* create invoice items
* update enquiry status

### Payment logic

Payments are recorded against:

* `invoice_id`
* `booking_id`

Derived values:

* `totalPaid` = sum of paid payments for invoice
* `remainingBalance` = invoice total - totalPaid (clamped at 0)

Future note:

* invoice deposit support is not implemented yet; when added, default deposit should be 50% of invoice total unless overridden

### Contract upload logic

Booking contracts use:

* private Supabase Storage bucket: `contracts`
* object path: `{auth.uid()}/{booking_id}/{timestamp}-{file_name}`
* metadata table: `booking_contracts`

When a contract is uploaded:

* upload the file to private storage
* upsert the current `booking_contracts` row by `booking_id`
* set metadata status to `signed`
* generate signed URLs on demand for view/download

### Activity logging

Initial activity events:

* enquiry converted to booking
* booking edited
* invoice created from booking
* invoice sent
* payment added
* contract uploaded
* contract replaced

BookingDetails displays activity where `activity_logs.booking_id` matches the current booking.

---

## Dashboard Logic

Dashboard metrics should be based on:

### Enquiries

* total enquiries
* quoted enquiries
* booked enquiries
* conversion rate

### Invoices

* total invoice value
* paid invoices
* unpaid invoices
* overdue invoices

### Payments

* paid revenue = sum of paid payments
* outstanding revenue = total invoice value - paid revenue

Do NOT treat raw invoice totals as cash received.

---

## Filtering / Search Rules

Filtering is done in-memory in the page layer using `useMemo`.

Search is:

* case-insensitive
* debounced using `useDebounce`

Pages own:

* fetched records
* search term
* filter state
* filtered results

List components remain display-only.

---

## Important Implementation Rules

* Use real schema column names exactly
* Prefer minimal, safe edits
* Do not move Supabase logic into small presentational components
* Preserve current working status flows unless explicitly changing them
* Avoid broad refactors unless requested

---

## Common Failure Points to Avoid

### Schema mismatches

Do not invent columns that do not exist.

### RLS issues

Supabase RLS may block inserts/updates on:

* invoices
* invoice_items
* payments

If inserts fail with code `42501`, check policies before changing frontend logic.

### Over-automation

Do not create contradictory status transitions across enquiries, bookings, and invoices.

### Premature abstraction

Do not extract shared components/helpers unless the pattern is clearly repeated and stable.

---

## Summary

The CRM is built around this chain:

* Client owns enquiries
* Enquiry converts to booking
* Booking can have event details
* Booking/client can have invoice(s)
* Invoice can have line items
* Payments roll up into invoice status and dashboard revenue

Any future feature should respect that chain.

## Tester Account

See `docs/tester-account.md` for creating `tester@djrm.co`, optional tester seed data, and the manual isolation checklist.
