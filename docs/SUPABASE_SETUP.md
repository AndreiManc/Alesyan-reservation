# Alesyan Reserve — deployed test environment (11 October 2026)

## Current deployment

| Component | Destination | Status |
|---|---|---|
| Frontend | https://alesyan-reservations.onrender.com | Render static site, live |
| GitHub | https://github.com/AndreiManc/Alesyan-reservation | Connected, auto-deploy main |
| Supabase | alesyan-reservations (ref jaxvytkwtnltapyqpqct) | New, independent Frankfurt project |
| Food Safe Hub / HACCP | alesyan-staging | Separate and untouched |

The new Supabase project has **nine reservation tables**, row-level security, authenticated staff RPC functions, a collision-preventing exclusion constraint and audit events. Its anonymous access to privileged RPCs was revoked and checked. Initial and security migrations have already been applied. **Do not re-run these migrations as setup steps or duplicate the fictional fixture.**

### Fictional data installed

- Alesyan Demo — Malahide (not Gourmet Food Parlour and not a commercial partnership)
- 8 dining tables across Main Dining and Terrace
- 12 invented guest names and 12 fictional reservations
- 12 reservation audit events
- No passwords or actual restaurant customer data

The staging project and production HACCP data are not connected to this Reservations frontend. **No real customer reservation page, notifications, payments, or Google/OpenTable integrations are enabled.**

## Enable a test manager account

There are currently **no users and no owner memberships** in the Reservations database.

1. Open the test frontend at https://alesyan-reservations.onrender.com.
2. Choose **Create a test staff account**; register with an email address you control and a new password not reused from HACCP.
3. If Supabase sends a confirmation email, open it. If the redirect fails, return manually to the test URL and attempt **Sign in**. Supabase Authentication URL configuration may need an administrator to add the exact frontend origin and redirect URL.
4. By design, newly registered accounts will see **No restaurant assigned**. Signup does **not** grant access to reservations.
5. Only after verifying the test user's email, a project administrator can explicitly assign that user as the demo site's owner using the following SQL **in the dedicated Reservations project only**.

```sql
-- Replace the address after obtaining the test user's explicit permission.
-- Inspect auth.users first, and require email confirmation before granting ownership.
insert into public.site_memberships(site_id,user_id,role)
select s.id,u.id,'owner'
from public.sites s
join auth.users u on lower(u.email)=lower('REPLACE_WITH_CONFIRMED_TEST_EMAIL')
where s.slug='alesyan-demo-malahide'
  and u.email_confirmed_at is not null
on conflict(site_id,user_id) do nothing;
```

Do not add hardcoded test passwords to the code, SQL or messages. Real workplace/customer data must not be imported.

## Permission model

- All anonymous write and read access to guest/staff tables is denied.
- Staff access is protected by email/password authentication and Supabase RLS.
- Only assigned site members can read the site's data.
- Host: booking CRUD and booking status changes (through narrowly controlled RPC functions).
- Owner/Manager: same, plus table management and service rules.
- Data can only be changed through validated, authenticated RPCs; no broad direct table update permissions.
- Server-side GiST exclusion constraint atomically blocks overlapping occupied reservations.
- Public bookings are **not** connected: no anonymous booking API is available.

## Safety and work before live use

The application's user-facing demo and secured staff backend are an **internal test** only. Before real restaurant operations: secure, rate-limited public-booking endpoint; working cancellation and reminders; full operating-hours and booking-date validation; consent and data-retention policies; backups; capacity pacing; threat testing; hospitality usability testing; and owner approval.

CI: [Build and test](https://github.com/AndreiManc/Alesyan-reservation/actions) and [SQL smoke workflow](https://github.com/AndreiManc/Alesyan-reservation/actions/workflows/sql-verify.yml). Security advisors currently report authenticated-callable SECURITY DEFINER functions as warnings because these are exposed intentionally for signed-in staff; each one must be independently reviewed for site/role authorization prior to production.

**GitHub repository was public on creation.** Before introducing private product plans or anything sensitive, make it private in GitHub Settings → General → Change repository visibility. Do not commit service-role keys or customer data.
