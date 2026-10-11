# Alesyan Reserve

Independent, mobile-friendly restaurant reservations prototype for Alesyan. Separate from Food Safe Hub / HACCP.

**DEMO ONLY:** Runs in one browser using localStorage and synthetic data. No production database, real authentication, cross-device sync, confirmation email/SMS, or OpenTable/Google integration. NOT safe for live reservations.

## Run locally

Node.js 22+ required. Run npm install then npm run dev and open the Vite local URL. npm run build validates TypeScript and builds. npm test checks overlap logic. Use Reset Demo in Settings to restore examples.

## Features, first iteration
- Daily manager dashboard, searchable booking diary and status changes
- Create/edit staff and website demo bookings and table allocation with local collision checks
- Simple floor/table management, guest listing, restaurant operating settings
- A public-style test form, clearly marked as DEMO and limited to synthetic guest data
- Responsive layout and local browser persistence

## Before real reservations
Use a separate backend project, staff authentication/permissions and site isolation, atomic server-side booking transactions, privacy/retention controls, real service timezone rules, integration testing and a security audit. Demo collision checks in the browser do not protect concurrent real visitors.

NEVER commit passwords, API secrets, service-role keys or real guest information. The repo was public when work started; consider making it private.

Planned target price €79–€99 per location monthly with no per-cover commissions is a research hypothesis, not an activated plan.
