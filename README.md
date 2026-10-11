# Alesyan Reserve

Independent restaurant reservation and table-management software under development. **Completely separate from Food Safe Hub / Alesyan HACCP.** Source code is developed directly in GitHub, without Lovable.

## Current development status

**Frontend**
- Responsive staff dashboard, reservation diary, status changes, table inventory and settings.
- Two modes:
  - **Local fictional demo:** works when Supabase environment variables are absent, using synthetic bookings saved only in that browser. No real users or authentication.
  - **Secure Supabase staff mode:** automatically enabled when a dedicated Reservations project URL and publishable key are configured. Staff sign-in, site selector, booking CRUD/status, dining tables and settings call Supabase directly.
- The public-facing page is **only a fictional demo**. No real public customer booking service is live.

**Database migration (written and SQL-tested, NOT deployed):**
- \`supabase/migrations/20261011190000_reservations_initial.sql\`
- Multi-site organisations and owner/manager/host membership roles.
- Explicit grants and Row Level Security on every exposed reservation table.
- Narrow, authenticated staff RPCs for reservations and restaurant changes.
- PostgreSQL GiST exclusion constraint to atomically prevent two non-cancelled bookings overlapping on the same table.
- Reservation event history.
- Staff cannot directly write underlying tables or access other restaurants' data.

**Tests:** GitHub Actions runs a TypeScript/Vite build, unit tests and a separate disposable PostgreSQL 17 schema test (SQL migration application, booking overlap, RLS and staff RPC). Passing tests **do not** mean production readiness.

## First-time setup

Read **[Supabase setup](docs/SUPABASE_SETUP.md)** before creating the database. Do **not** use the existing \`alesyan-staging\` project, because it contains the HACCP system.

1. Have the owner approve a **new separate Supabase project** and any associated charges.
2. Apply the SQL migration only to the new project.
3. Create a fictional test venue, initial owner membership and table inventory using the documented bootstrap example.
4. Configure \`.env.local\` with the new project's \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_PUBLISHABLE_KEY\`. Never put a service-role/secret key in browser configuration.
5. \`npm install\`, \`npm run dev\`, \`npm run build\`, \`npm test\`.

The repository has no production credentials. Any local changes to \`.env.local\` stay ignored by git.

## Security and roadmap

- Live customer reservations are **not** enabled.
- Public customer booking will require a rate-limited edge API with tamper-resistant cancellation, spam protection, atomic booking checks, privacy controls and secure guest messaging.
- More restaurant features still to build: joined tables, pacing limits, drag-and-drop floor editor, complete customer profiles, bookings widget, confirmations/reminders, Google integrations, deposits, full multivenue administration.
- Before customer data use: owner authorisation, GDPR legal review, privacy/retention arrangements, vulnerability review, audit and operational acceptance.

This project was initially created as a **public GitHub repository**; if it is still public, change visibility in GitHub Settings before any private commercial information is added. Never commit credentials or actual customer records.

Proposed €79–€99/month per location without per-cover commission is a future pricing hypothesis only, not implemented billing.
