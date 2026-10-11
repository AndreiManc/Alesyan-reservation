# Supabase setup — Alesyan Reserve

**Do not apply these steps to \`alesyan-staging\`. That project already contains the HACCP application.** Reservations must have a newly created, isolated Supabase project, with costs/organisation confirmed by the owner beforehand.

## 1. Prerequisites

- A dedicated Supabase Reservations project (its own URL and publishable key).
- The app source code in the independent GitHub repository \`AndreiManc/Alesyan-reservation\`.
- An administrator/test staff email that is controlled by the project owner.
- **No real restaurant customer records** during the development phase.

## 2. Create the database

In the **new** Supabase project's SQL Editor, execute the entire file:

\`supabase/migrations/20261011190000_reservations_initial.sql\`

It creates organisations, sites, memberships, service settings, areas, tables, guests, reservations, and append-only reservation events. Row Level Security is enabled for all tables.

It implements:
- authenticated site-member-only reads;
- manager/owner-only settings and table editing;
- server-authorised staff reservation creation and editing;
- one-table booking overlap protection with a GiST exclusion constraint;
- immutable (to app users) event history and server-side idempotency keys.

No authenticated user can directly INSERT/UPDATE/DELETE protected tables. Public/anon booking writes are deliberately **not** enabled.

**Verification:** GitHub CI's Postgres test job checks migration syntax, overlapping reservations, access isolation and staff RPCs in a disposable database. These tests are necessary but do not replace production security review.

## 3. Provision a fictional demo venue and owner

1. In Supabase → Authentication → Users, create or invite a **test** staff user. Obtain the user's UUID.
2. Replace \`REPLACE_WITH_TEST_AUTH_USER_UUID\` in the script below, then run it **only in the new Reservations project**.
3. Sign in to the app using that test staff email and password.

~~~sql
do $$
declare
  v_org uuid;
  v_site uuid;
  v_main uuid;
  v_terrace uuid;
  v_test_user uuid := 'REPLACE_WITH_TEST_AUTH_USER_UUID'::uuid;
begin
  if not exists(select 1 from auth.users where id = v_test_user) then
    raise exception 'Auth user not found; create a test user first';
  end if;

  insert into public.organisations(name)
  values ('Alesyan Reservations Demonstration')
  returning id into v_org;

  insert into public.sites(organisation_id,name,slug,timezone)
  values (v_org,'Alesyan Demo — Malahide','alesyan-demo-malahide','Europe/Dublin')
  returning id into v_site;

  insert into public.site_memberships(site_id,user_id,role)
  values (v_site,v_test_user,'owner');

  insert into public.site_settings(site_id)
  values (v_site);

  insert into public.dining_areas(site_id,name)
  values(v_site,'Main Dining') returning id into v_main;
  insert into public.dining_areas(site_id,name)
  values(v_site,'Terrace') returning id into v_terrace;

  insert into public.dining_tables(site_id,area_id,label,capacity,x,y) values
   (v_site,v_main,'T1',2,20,20),
   (v_site,v_main,'T2',2,110,20),
   (v_site,v_main,'T3',4,20,120),
   (v_site,v_main,'T4',4,110,120),
   (v_site,v_main,'T5',6,200,120),
   (v_site,v_terrace,'T6',4,30,30);
end $$;
~~~

Do not run the fixture twice. It intentionally does not create any real bookings, customers or integrations.

## 4. Configure the app

Copy \`.env.example\` to \`.env.local\` and supply values from the **new dedicated project**:

~~~dotenv
VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_NEW_PROJECT_KEY
~~~

These two values are public browser configuration values. **Never** commit any secret/service-role key, database password or test staff credentials to GitHub.

When the environment variables are present, the app displays the **Supabase staff interface**, enforcing staff authentication and RLS. With variables absent, it displays a browser-local **fictional data demo** instead. The two modes do not share data.

~~~bash
npm install
npm run dev
npm run build
npm test
~~~

In Supabase → Authentication → URL Configuration, eventually add your verified preview/deployment URL as appropriate before password reset or email-link sign-in flows are enabled. For now, standard email/password sign-in is used. Disable open public signups unless the business explicitly chooses to support them.

## 5. Limits before any real restaurant pilot

- Current connected mode is **staff-only**; the public booking page remains a fictional browser demo until a rate-limited, abuse-resistant public booking API exists.
- The reservation engine allocates a single table, not joined tables, pacing limits, capacity by service, deposits or shift-based restrictions.
- No emails, SMS, Google Reserve, POS or OpenTable marketplace discovery have been built.
- GDPR: privacy notice, data minimisation, lawful basis, retention/deletion, logging, permissions review and data-processing agreements are still required.
- Manager onboarding, role/invite flows and true multivenue administration are not yet self-service.
- No live restaurant deployment, actual guest imports or real-world operational approval is authorised.

**Do not turn on public customer bookings or import Gourmet Food Parlour data without the restaurant owner's explicit authorisation and production hardening.**
