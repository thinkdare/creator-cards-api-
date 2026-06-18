# Creator Card Microservice

A Node.js REST API with three endpoints that manages "Creator Cards" — shareable profile pages containing links and service rate cards. Think link-in-bio with a pricing sheet attached. The API is schema-less beyond what MongoDB requires; no auth, no versioning.

- **Repo**: https://github.com/thinkdare/creator-cards-api-
- **Deployed base URL**: https://creator-cards-api-223c.onrender.com

---

## Setup

```bash
npm install
cp .env.example .env
```

Set in `.env`:
- `MONGODB_URI` — MongoDB Atlas (or local) connection string
- `PORT` — defaults handled by the platform in production; set for local dev
- `NO_SINGLE_ERRORS=1` — returns all VSL validation errors at once rather than one at a time

Leave Redis/queue vars blank — not used by this service.

Run locally:

```bash
node bootstrap.js
```

---

## The Entity

| Field | Type | Rules |
|---|---|---|
| `_id` / `id` | ULID string | Internal `_id`, exposed as `id` |
| `title` | string | 3–100 chars, required |
| `description` | string | max 500 chars, optional |
| `slug` | string | 5–50 chars, `[a-z0-9\-_]` only, unique |
| `creator_reference` | string | exactly 20 chars, required |
| `links[]` | array | optional; each needs `title` (1–100) and `url` (http/https, max 200) |
| `service_rates` | object | optional; `currency` enum (NGN/USD/GBP/GHS), `rates[]` non-empty |
| `service_rates.rates[].amount` | number | positive integer, minor units (kobo/cents/pence/pesewas) |
| `status` | enum | `draft` or `published`, required |
| `access_type` | enum | `public` or `private`, defaults to `public` |
| `access_code` | string | exactly 6 alphanumeric chars; required when `private`, forbidden when `public` |
| `created` / `updated` | number | Unix epoch ms |
| `deleted` | number \| null | null until deleted |

---

## The Three Endpoints

### POST `/creator-cards` — Create

**Slug logic:**
- If provided and taken → HTTP 400, `SL02`
- If omitted → auto-generate: lowercase title, spaces→hyphens, strip non-`[a-z0-9\-_]`, then if result < 5 chars or taken → append `-{6-char-random-alphanum}` suffix

**Business rule errors (beyond VSL validation):**
| Code | HTTP | Trigger |
|---|---|---|
| `SL02` | 400 | Client-provided slug already exists |
| `AC01` | 400 | `access_type=private` but `access_code` omitted |
| `AC05` | 400 | `access_code` provided on a public card |

**Success response:** HTTP 200. Returns full card with `access_code` visible (creator needs it), `id` not `_id`.

### GET `/creator-cards/:slug` — Public Retrieval

Access rules applied **in this exact order**:

1. Slug not found → 404, `NF01`
2. Card is `draft` → 404, `NF02`
3. Card is `private`, no `access_code` query param → 403, `AC03`
4. Card is `private`, wrong `access_code` → 403, `AC04`
5. Otherwise → 200

**`access_code` is never returned in this response, even on successful private card access.** Also excluded: deleted cards return `NF01`.

### DELETE `/creator-cards/:slug` — Delete

Body requires `creator_reference` (exactly 20 chars). If slug not found → 404, `NF01`. On success → HTTP 200, returns deleted card in creation-response format with `deleted` set to current Unix ms. After deletion, GET returns `NF01`.

---

## Error Response Shape

All business rule errors:
```json
{ "status": "error", "message": "Human readable message", "code": "SL02" }
```

VSL field-level validation errors use the framework's own format — they still return HTTP 400.

---

## Format Validations Beyond VSL

The VSL DSL only supports length/min/max/enum constraints — it has no character-class or
integer-only constraint. Four rules from the Entity table need a charset or numeric-type
check that VSL can't express, so they're hand-validated in `services/creator-card/create.js`
right after VSL validation runs:

| Field | Rule | Why VSL can't enforce it |
|---|---|---|
| `slug` (client-provided) | `[a-z0-9\-_]` only | VSL has no character-class constraint |
| `links[].url` | must start with `http://` or `https://` | `startsWith` only takes one literal prefix, not an "either/or" |
| `service_rates.rates[].amount` | must be an integer | VSL's `number` type allows decimals; no integer-only constraint exists |
| `access_code` | alphanumeric only | same character-class limitation as `slug` |

These checks throw with the same `errorCode` (`'SPCL_VALIDATION'`) and `details` shape that
`@app-core/validator-vsl` itself throws with internally, so a charset/format violation reads
as an ordinary field validation error (HTTP 400, `{ status: 'error', message, code: 'SPCL_VALIDATION', errors: {...} }`)
rather than introducing a brand-new ad-hoc business code that isn't in the assessment's
documented `SL02`/`AC01`/`AC03`/`AC04`/`AC05`/`NF01`/`NF02` set.

(`slug` auto-generation already strips invalid characters before insert — this check only
applies when a client supplies their own `slug`.)

---

## Deployment Notes

Deployed on Render's free tier. The free tier spins down after ~15 minutes of inactivity, so the **first request after idling can take 30–60 seconds (cold start)** while the instance spins back up. This is expected behavior, not a bug.

---

Claude Sonnet 4.6 <noreply@anthropic.com> was used in this project.
