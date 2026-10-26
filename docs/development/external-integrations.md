# Google sign-in and Stripe subscriptions

These integrations are implemented but remain disabled until the operator supplies their own provider credentials. They do not create paid subscriptions, Google identities or successful external actions from demonstration data. Native development reads the existing private root `.env`; never commit secrets or expose them through `VITE_` variables.

## Google sign-in

Create a Google OAuth **Web application** client with an approved consent screen. Set:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Empty derives APP_ORIGIN + /api/v1/auth/google/callback.
GOOGLE_REDIRECT_URI=
```

Register the exact derived URI in Google Cloud; for the default local origin it is `http://127.0.0.1:5173/api/v1/auth/google/callback`. Production uses the configured HTTPS application origin and its same-origin API proxy. Changing origins requires changing the provider registration. The application does not accept caller-selected redirect destinations.

`POST /api/v1/auth/google/start` uses the existing Origin/CSRF-protected anonymous or authenticated browser session. Body: `{terms:boolean, locale:'en'|'ar'}`. It returns a Google authorization URL with OpenID scopes, a random state/nonce and S256 PKCE. Encrypted, ten-minute OAuth records bind the state to the initiating session and are consumed once. The callback exchanges the code on the server and verifies Google's RSA signature, issuer, audience, nonce, expiration and verified email before issuing an ordinary protected NUVIA session. Provider tokens are not persisted or returned to the browser.

An existing password account is **never linked automatically by a matching email**. Sign in with its password, open Account security and explicitly connect Google. Linking calls `/auth/google/start` with `{link:true,currentPassword,code?}` and requires the account password plus its configured second factor. The callback requires the same verified email, initiating session and unchanged credential version; another account's Google subject cannot be reused. `POST /auth/google/unlink` with `{currentPassword,code?}` disconnects it. Both operations rotate credential versions and sessions. A Google-created account can set a local password using verified password recovery before password-protected account changes.

Google sign-up requires terms acceptance. For an already linked Google account with local two-factor protection enabled, the callback returns to `#/login?googleChallenge=...`. Complete it with `POST /api/v1/auth/google/second-factor` and `{challenge,code}` under the initiating browser's CSRF context. The five-minute challenge is bound to that session and credential version, and never authenticates without the valid local TOTP or unused recovery code.

Local two-factor enrollment returns ten 80-bit recovery codes once after successful verification. The interface can display/download them in that response session; it does not put them in browser storage. The database stores only SHA-256 digests. A used recovery code is removed atomically, including during Google second-factor verification. Disabling two-factor authentication clears its recovery codes. Local TOTP codes remain six digits; recovery codes contain twenty hexadecimal characters, optionally separated into five groups of four by hyphens.

Missing credentials return `GOOGLE_NOT_CONFIGURED`; invalid/cancelled callbacks redirect to a safe login error. Callback errors never include authorization codes, tokens, provider responses or secrets. Google-issued identity/email verification does not establish SMTP delivery from this application.

## Stripe billing

Create Stripe recurring **Prices** for the plans offered by your business, configure a customer portal, and supply test-mode credentials first:

```dotenv
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_BUSINESS=
```

No business pricing or payment-provider account is invented. Empty prices keep the corresponding plan unavailable. Credentials alone do not activate any customer subscription. All browser billing endpoints require a verified workspace **owner**; managers and viewers cannot inspect billing or create checkout/portal sessions.

- `GET /api/v1/billing`: actual current plan, subscription status, all-time saved response count, configuration readiness and selectable configured plans.
- `POST /api/v1/billing/checkout` with `{plan:'starter'|'pro'|'business'}`: an authenticated hosted Stripe subscription Checkout session. The server chooses the configured Price, quantity and fixed return URLs. A per-workspace checkout lease prevents simultaneous checkout creation; an existing unexpired same-plan session is reused, and unfinished different-plan sessions are expired first.
- `POST /api/v1/billing/portal` with `{}`: a hosted customer-portal session for that workspace's saved Stripe customer. Payment methods, invoices, cancellation and plan management remain on Stripe's hosted UI.
- `POST /api/v1/billing/webhook`: provider callback with a signature over the **raw** JSON bytes, separate from browser CSRF. This route must stay before `express.json()` and uses a 256 KiB body limit.

Configure the webhook for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`, using API version `2026-09-30.endive`. The handler verifies HMAC signatures with a five-minute timestamp tolerance, deduplicates event IDs transactionally, binds the known Stripe customer to its saved workspace, and retrieves current subscription state from Stripe. Untrusted metadata cannot claim another workspace. An old event cannot restore an older paid state. Returning from Checkout never activates a paid plan. Only authoritative subscription `active`/`trialing` state enables its paid-plan identity; canceled/unpaid/incomplete states are not displayed as active paid subscriptions.

Billing usage currently means **all-time stored responses**, with an explicit `all_time` period. It is not a metered Stripe usage charge or an invented monthly allowance. No customer card data is stored by NUVIA. Starting local development or adding configuration does not initiate a checkout, charge, cancellation or plan change.

For local webhook testing, use Stripe CLI forwarding to the API webhook and set the emitted signing secret privately; do not share CLI output containing secrets. Use isolated synthetic accounts and Stripe test mode. The fixture tests validate protocol/security contracts, not real Google consent, real charges, customer-portal configuration, taxes or production payment acceptance. Those require a separate provider sandbox acceptance run with operator-owned credentials.

Compose does not automatically forward these new optional credentials. For a container-based integration acceptance run, explicitly map the selected private variables into the API service; do not bake them into images or print resolved compose configuration.

## Weekly feedback reports

Weekly reports start only after an owner explicitly enables and saves the weekly notification preference. The persisted `weeklyReportsEnabled` flag defaults to false, including for existing accounts without this new setting; the connected preference shows that actual opt-in state. The existing mail worker must be running during Monday 09:00–09:59 in the owner's saved account timezone. Each owned business gets a snapshot of its previous seven complete local calendar days, in the owner's saved language. Member settings cannot schedule owner-wide reports.

Scheduling uses bounded batches and fair checking metadata. A unique per-business/per-week `Report.scheduleKey` protects against concurrent workers and repeat ticks; the report, schedule metadata and analysis job commit together. The scheduler never calls an AI provider directly. Saved text evidence with no configured model produces `waiting_for_model`; an empty evidence set produces `insufficient_evidence`. A notification links to that actual snapshot and describes its queued/waiting/empty state. The analysis worker sends a separate ready notice only after successful generation, respecting branch permissions. Turning the preference off stops future schedules. A worker that misses the entire Monday scheduling window does not claim to have sent that week's report.

## Sources

Implementation follows [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Stripe subscription Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Stripe event signature and delivery guidance](https://docs.stripe.com/events/manage-webhook-endpoints), and [Stripe API versioning](https://docs.stripe.com/api/versioning), checked on 2026-10-26.
