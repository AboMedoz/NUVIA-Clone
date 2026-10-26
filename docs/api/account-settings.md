# Account settings and contact

All private paths below are relative to `/api/v1` and require a verified cookie
session. Mutations require exact Origin/CSRF. Strict validation rejects unknown
fields. Settings belong to the signed-in user. Secrets and session digests never
enter DTOs.

| Method      | Path                                      | Behavior                                                                                                                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/PATCH   | `/account`                                | Saved `{name,title,phone,country,photo}`. Photo is a bounded PNG/JPEG/WebP data URL; the UI scales uploads.                                 |
| PUT         | `/account/preferences`                    | `{language,region,zone,date,time}` with a valid IANA timezone.                                                                              |
| PUT         | `/account/notifications`                  | `{toggles,delivery}`; essential security notices remain enabled.                                                                            |
| GET         | `/account/notifications`                  | Current user's saved notifications.                                                                                                         |
| POST        | `/account/notifications/read`             | `{ids?:UUID[]}` marks selected/all own records read. Foreign IDs do not alter another user's state.                                         |
| GET         | `/account/sessions`                       | Own valid sessions and a current-session marker; no invented geolocation.                                                                   |
| DELETE      | `/account/sessions/:id`                   | Revoke another own session.                                                                                                                 |
| DELETE      | `/account/sessions`                       | Revoke all own sessions, including current. The UI reboots anonymous CSRF state.                                                            |
| POST        | `/account/password`                       | `{currentPassword,password,code?}` updates the hash and rotates sessions.                                                                   |
| POST        | `/account/email`                          | `{currentPassword,email,code?}` queues confirmation to the new email. Old email stays active until proof is consumed.                       |
| POST/DELETE | `/account/email/resend`, `/account/email` | Resend/cancel. Proofs are single-use, expiring and credential-version-bound; password changes invalidate pending proofs.                    |
| POST        | `/account/two-factor/setup`               | Password proof creates a short-lived encrypted enrollment and returns an `otpauth` URI. It does not enable it.                              |
| POST        | `/account/two-factor`                     | `{currentPassword,enabled,code}` verifies enrollment/current second factor. Recovery codes appear once after enabling; only hashes persist. |
| POST        | `/public/contact`                         | Public bounded `{name,email,company}`; Origin/rate-limited. `202 accepted` means saved, not inbox delivery or a scheduled meeting.          |

TOTP or an unused recovery code is accepted where second-factor proof is
required. Public login accepts optional `code`; correct passwords return
`TWO_FACTOR_REQUIRED` when another factor is needed. See
[external integrations](../development/external-integrations.md) for Google
linking and billing.

Response/report events create branch-authorized notifications. Immediate emails
and digests use the encrypted outbox and existing worker. Digest windows use the
saved timezone at 09:00, weekly on Monday; a stopped worker cannot deliver at a
scheduled time. File mode writes private JSON; SMTP acceptance remains external.
Bodies use generic metadata and links, not copied customer feedback text.

Weekly report generation requires an explicit saved `weekly` toggle (default false).
Monday at 09:00 in the saved timezone, the worker creates one report per workspace
and local week for the previous seven full local days. A unique schedule key
prevents duplicates. The job pump produces model content later; unavailable and
insufficient-evidence states remain explicit. Notifications are filtered by the
selected workspace and current branch permissions.

`GET /public/content/:page` exposes supported public information pages using optional
`PUBLIC_*_TEXT` operator configuration. `/public/content/status` checks API/database
reachability with a bounded database probe; it is not production availability proof.

Read-only account navigation has its own 600-request/15-minute budget; ordinary
mutations retain 120/15 minutes and sensitive credential proofs retain 10/15
minutes. Billing reads use 300/15 minutes; checkout/portal mutations retain
30/15 minutes. Reading badges/settings does not exhaust mutation attempts.
