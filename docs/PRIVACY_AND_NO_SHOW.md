# Privacy and payment design — pre-production

Alesyan Reservations must not collect live customer personal data until a named restaurant controller approves the privacy notice, lawful bases, retention schedule, data processor agreements, DSAR and deletion workflow, incident-response plan, and security review.

## Guest personal data
- Collect first name (optional), surname (required), phone (required), email (optional) only when needed to manage the booking.
- Explain collection purposes, retention and controller identity at collection time.
- Do not treat acceptance of reservation conditions as consent to marketing. Marketing requires a separate, applicable legal basis and opt-in controls where required.
- Minimise sensitive free-text notes; do not use guest notes for unnecessary health or other sensitive information.
- Restaurant-specific RLS, least privilege, audited access and encrypted transport.
- Retention periods are **configuration values only** at present; deletion jobs, legal-hold logic and exports are not implemented. Do not claim automatic GDPR compliance.
- The fictional public booking demo currently validates sample contact details but does not transmit them.

## No-show card guarantee
- Never handle or persist a PAN, full card number, CVV/CVC, PIN, track data or raw payment credentials in Alesyan.
- Use Stripe SetupIntent/Checkout or another compliant payment-provider hosted UI to vault the payment method; store minimal payment-provider IDs, optional brand/last4 and the versioned policy acknowledgment only.
- Show the fee amount or calculation, cancellation deadline, applicable conditions and terms **before** the card is captured. Maintain an explicit record of the guest's acknowledgment to the fee terms. Off-session charging may need Strong Customer Authentication and must handle issuer declines.
- Do not enable fees until the restaurant has documented its legal/commercial policy, an appropriate payment-provider account, dispute handling and refunds.
- Payment tokens are protected and not generally queryable by restaurant employees.
- Payment settings are disabled; no card processor connected, no card collection, no automatic no-show charging.

## Before launch
1. Confirm the role of Alesyan as processor and each restaurant as controller (or adjust based on actual functions); sign Article 28 DPAs.
2. Create controller/processor records of processing and review legitimate-interest or contract-related lawful bases by purpose.
3. Publish plain-language privacy notice and card/no-show terms, consider Irish consumer-protection obligations, and determine necessary retention and erasure exceptions.
4. Design tested access/export/rectification/deletion request handling, along with breach reporting procedures and processor/subprocessor management.
5. Complete DPIA screening and threat modelling for card payments, guest records, internal notes, employee access and possible profiling.
6. Build provider-hosted payment onboarding, setup, webhooks, signature verification, idempotency, fee charges, refunds and reconciliation.
7. Run penetration, permissions, availability and disaster-recovery tests before importing real customer data.

Reference guidance:
- Irish Data Protection Commission: https://www.dataprotection.ie/
- EDPB: https://www.edpb.europa.eu/
- PCI SSC: https://www.pcisecuritystandards.org/
- Stripe Setup Intents: https://docs.stripe.com/payments/setup-intents
