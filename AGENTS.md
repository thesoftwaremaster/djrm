# AGENTS.md

## Project Overview

This is a React + Vite + Tailwind + Supabase CRM for managing:

* Clients
* Enquiries
* Bookings
* Invoices
* Payments

The system follows a relational workflow:
Enquiry → Booking → Invoice → Payment

---

## Core Architecture Rules

* Pages are responsible for:

  * data fetching
  * state
  * filtering logic

* Components are:

  * presentational (display-only)
  * do NOT fetch data

* Forms:

  * collect input only
  * pass payload up to parent
  * no direct business logic inside form components

* Supabase:

  * used directly inside pages or workflows
  * never inside small UI components

---

## Code Style

* Use arrow function components:
  const Page = () => {}

* Use PascalCase for components and files

* Keep functions small and readable

* Prefer early returns over nested logic

---

## Design System Rules

* Tailwind is used for all styling

* Reuse existing class patterns

* Do NOT introduce new design systems or UI libraries

* Maintain consistency with:

  * rounded-2xl / rounded-[28px]
  * soft borders (border-[#e7ebf3])
  * subtle shadows

* Mobile-first responsive design must be preserved

---

## State & Filtering Patterns

* Filtering is done in-memory using useMemo
* Do NOT move filtering into Supabase queries
* Use debounced search (useDebounce hook)
* Pages own:

  * searchTerm
  * filters
  * filtered results

---

## Status Automation Rules

### Invoices

* paid → when total payments >= total
* overdue → when due_date < today AND not paid
* never overwrite cancelled

### Bookings

* confirmed → when linked invoice is fully paid
* do not overwrite completed or cancelled

### Enquiries

* booked → when booking is created
* preserve existing working conversion logic

---

## UX Patterns

* Search:

  * debounced
  * case-insensitive

* Filters:

  * dropdown based
  * "all" means no filtering

* Clear button:

  * only appears when filters are active

* Keyboard:

  * Escape clears search

---

## Constraints

* Do NOT refactor large parts of the app unless explicitly asked
* Do NOT redesign UI
* Make minimal, safe edits
* Preserve existing working logic

---

## When Adding Features

* Reuse existing patterns before creating new ones
* Avoid duplication, but do NOT prematurely abstract
* Only extract shared components when 3+ pages use identical structure

---

## Goal

Maintain a clean, scalable SaaS architecture with:

* consistent UX
* minimal bugs
* clear data flow

## Additional Project Docs
- See `docs/database.md` for schema rules, relationships, status meanings, and automation expectations

## Run / Verify
- Install: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Done Means
- requested behavior works
- no broken routes
- responsive layout preserved
- relevant build/lint checks pass where possible

## Safety and Maintainability Rules

* Plan first for any feature that touches auth, payments, PDFs, uploads, email, or database writes.
* Prefer minimal, reviewable changes over broad refactors.
* Do not weaken auth, RLS, or secret handling to make features work.
* Do not add dependencies unless clearly necessary and justified.
* Avoid unsafe serialization/deserialization and arbitrary code execution patterns.
* Keep secrets server-side only.
* Call out any security or architecture issue noticed during implementation.
* Keep business logic explicit and centralized enough for a human maintainer to understand.
* After changes, summarize:

  * changed files
  * security-sensitive decisions
  * assumptions
  * remaining risks
  * verification steps run
