# Your Foodie Friend — Netlify deployment handoff

This repository builds two independent static sites and one shared Netlify Functions API. Deploy the storefront and its API first; deploy the separate private admin site second. Both frontends call `/api/*` on their own origin. The admin site's Netlify rewrite proxies those requests to the storefront/API site, so the browser keeps a same-origin session cookie and never receives a database credential.

This is a deployable code package, **not a live deployment**. It has not been connected to the owner's Netlify team, database, custom domains, or administrator credentials. Netlify Database is a paid/credit-based Netlify capability. Do not enable customer ordering until an owner has reviewed the business data gates below.

## Package contents

- `dist/storefront/` — public static site, server-rendered home-page HTML, assets, robots, and sitemap when the real `SITE_ORIGIN` is set.
- `dist/admin/` — separate, non-indexed admin static site; the `/api/*` proxy is generated only after the actual primary-site origin is supplied at build time.
- `netlify/functions/api.ts` — public menu, availability, order, health, login, and authenticated management endpoints.
- `netlify/database/migrations/` — additive Postgres schema and 28 historical menu entries imported as unpublished drafts.
- `netlify.toml` and `netlify.admin.toml` — primary and secondary site build/security settings.

## Prerequisites

- A Netlify account/team able to create two sites and initialize Netlify Database on the primary site. Database availability and plan terms can change; confirm the current Netlify Database entitlement in the account.
- Node.js `22.13.0` and pnpm 10 (the repository contains `pnpm-lock.yaml`). Netlify CLI is pinned in the project dependencies.
- Two Netlify site URLs: the **storefront/API origin** and the **admin origin**. Use HTTPS, exactly as the browser will use them. Custom domains may be connected later, but rebuild/redeploy with the final origins.

## 1. Configure and deploy the storefront/API site

1. Create a Netlify site from this repository with the repository root as base directory and `netlify.toml` as the configuration file. Keep the primary publish directory `dist/storefront` and Functions directory `netlify/functions`.
2. Connect/enable Netlify Database for the primary site using the current site/team workflow. Do not create a second database for the admin site or manually copy a connection URL. The committed `@netlify/database` dependency calls `getDatabase()`, which resolves the branch-aware managed connection (`NETLIFY_DB_URL`) at runtime.
3. Set these **build-time, public values** in the primary site's Netlify build environment before the first production build:

   | Variable                 | Value                                                                                             |
   | ------------------------ | ------------------------------------------------------------------------------------------------- |
   | `SITE_ORIGIN`            | Exact HTTPS storefront/API origin returned by Netlify.                                            |
   | `API_SITE_ORIGIN`        | The same storefront/API origin; the combined build uses it to configure the separate admin proxy. |
   | `VITE_STOREFRONT_ORIGIN` | The same public storefront URL used by the admin dashboard link.                                  |

4. Build and deploy. The configured build runs the frozen pnpm install, produces both static folders, pre-renders the public home page, writes SEO files, and generates the admin-site proxy. Netlify applies committed files from `netlify/database/migrations/` automatically before production publishing (and on deploy previews); a failed migration blocks that deploy. `netlify database migrations apply` is for the local development database, not a substitute for the production deploy lifecycle. The public health endpoint is `GET /api/health`; it does not certify that the database or ordering is configured. See [Netlify Database documentation](https://docs.netlify.com/build/data-and-storage/netlify-database/) and [Netlify's Postgres setup guide](https://www.netlify.com/knowledge-base/how-to-add-a-postgres-database-to-a-netlify-app/).
5. Confirm the migration has applied and request `GET https://<storefront-origin>/api/menu`. Before product review, the expected public menu is empty and online checkout is closed. A missing database returns a clear 503 response, not fake demo data.

### Primary/API site runtime environment

Set these server-side Netlify environment variables. Never copy them to a `VITE_*` variable, commit them, or place them in static files.

| Variable              | Requirement                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `STOREFRONT_ORIGIN`   | Exact public HTTPS storefront origin; used to reject cross-origin order submissions.                   |
| `ADMIN_ORIGIN`        | Exact public HTTPS admin-site origin; used for login and protected writes.                             |
| `ADMIN_EMAIL`         | Owner-controlled sign-in email.                                                                        |
| `ADMIN_PASSWORD_HASH` | Output of the local password-hash helper below; this is a hash, never the plaintext password.          |
| `SESSION_SECRET`      | Random secret with at least 32 characters; keep it private and unique to this deployment.              |
| `COOKIE_SECURE`       | Set to `true` in production. The default is secure. Only set `false` for local plain-HTTP development. |

Generate a hash locally in an interactive terminal (password input is hidden, minimum 14 characters):

```sh
pnpm install --frozen-lockfile
node scripts/hash-admin-password.mjs
```

Copy the resulting `ADMIN_PASSWORD_HASH=...` line into the primary site's protected environment-variable settings. Generate `SESSION_SECRET` locally with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'` or a secure password manager. Set the value in Netlify; do not put it in the repo or share it in chat. If the owner loses the password, generate a new hash and rotate the variable; do not add a default login.

## 2. Deploy the independent admin site

Create a second Netlify site connected to the same repository. Set its configuration file to `netlify.admin.toml`; use the repository root as the base directory. Set these **build-time** values on the admin site's build environment, then deploy:

| Variable                 | Value                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `API_SITE_ORIGIN`        | Exact HTTPS origin of the already deployed storefront/API site.   |
| `VITE_STOREFRONT_ORIGIN` | Public storefront URL for the dashboard's “view storefront” link. |

The admin build writes a same-origin rewrite from `/api/*` to the API origin and sets `robots.txt` to disallow indexing. The build intentionally fails if `API_SITE_ORIGIN` is absent or malformed rather than creating a deploy with a dead proxy. Do not expose `SESSION_SECRET`, the database URL, or owner credentials in the admin site's build environment. Set the same exact admin URL as `ADMIN_ORIGIN` on the primary site's **runtime** environment and redeploy/restart the primary site after changing it.

On the admin site, open `/` and sign in using the owner email and password. Confirm that `GET /api/auth/me` stays unauthenticated before login and authenticated after login, that refreshing preserves the session, and that logout revokes it. Cookies are HTTP-only, Secure and host-only in production, use `SameSite=None` for HTTPS/embedded Preview compatibility, and are time-limited. Explicit local plain-HTTP development uses a separate non-Secure `SameSite=Lax` cookie.

## 3. Build or deploy the two static folders manually

For local inspection or manual upload, run:

```sh
pnpm install --frozen-lockfile
SITE_ORIGIN=https://<storefront-origin> API_SITE_ORIGIN=https://<storefront-origin> VITE_STOREFRONT_ORIGIN=https://<storefront-origin> pnpm build:all
```

`pnpm build:netlify` (used by the primary site) builds only the storefront; `pnpm build:all` also builds the admin folder. The combined build requires the real origins above; `write-admin-proxy.mjs` deliberately fails rather than publishing an invalid placeholder proxy if `API_SITE_ORIGIN` is missing. Upload `dist/storefront/` only to the primary site, where its Netlify Functions and database are also configured. Upload `dist/admin/` to the second Netlify site, including `_redirects` and `robots.txt`. A manual HTML-folder upload by itself does **not** install Functions, initialize the database, or provide persistent ordering; connect the API site to this repository for full service. A neutral prebuilt preview with no owner domain intentionally has no working admin proxy and is not a production deployment. Rebuild both folders with actual origins before uploading them.

To rebuild only the admin static output after setting its origins:

```sh
API_SITE_ORIGIN=https://<storefront-origin> VITE_STOREFRONT_ORIGIN=https://<storefront-origin> pnpm build:admin
node scripts/write-admin-proxy.mjs
```

To compile the serverless handler locally without deploying:

```sh
pnpm exec netlify functions:build --src netlify/functions --functions .netlify/functions-build
```

Use the current Netlify CLI documentation for the exact Database initialization and migration commands supported by your team. This repository intentionally does not run `drizzle-kit push`, reset a database, or destructively rewrite an existing schema. If testing against a non-production Netlify branch/database, remember that a newly created preview database can copy production data; treat customer/order records as sensitive.

## 4. Verify and review before opening ordering

Sign in to the admin dashboard and review each of the 28 imported entries from the historical menu scan dated **30 June 2026**. Source amounts are draft references only; the scan did not specify currency, portions, all size mappings, current availability, or current prices. Confirm today’s item names, variants, descriptions, prices, currency, imagery, and availability. Records remain unpublished until individually confirmed.

Then confirm, in the admin settings, the current Monday/Wednesday/Friday/Saturday schedule (currently an advertised, not verified, source detail), lead time, operating hours, policies, pickup details, delivery zones, fees, and whether pickup/delivery are offered. Add only real future slots and appropriate capacity. Only after those records/settings are reviewed should the owner publish verified products and enable online ordering. Checkout is rejected server-side unless the relevant data and slot are confirmed. The storefront explains that submitting a WhatsApp request is **not** order acceptance; the business must accept the request directly.

Before launch, test on the real production domains:

- An unauthenticated request cannot read or mutate admin data; invalid origins are rejected.
- A valid order is recalculated from current database prices, stored with a line-item snapshot and a unique idempotency key, and reserves one slot capacity unit before WhatsApp opens.
- Duplicate requests do not create duplicate order rows; the resulting WhatsApp message contains the reference, items, quantities, schedule, fulfillment, customer contact, and relevant address/notes.
- Reject/cancel transitions release slot capacity; accepted orders display as accepted only after the business actually accepts them.
- Checkout remains closed with no confirmed published products or available slot.
- The admin origin's proxy works without browser CORS exceptions, the session cookie remains HTTP-only and Secure, and login is rate-limited.
- Verify the supplied Linktree/Instagram/TikTok links before adding/promoting them. The Instagram candidate has not been verified as available and TikTok may show a break notice; do not represent either as active without owner confirmation.

## Configuration and privacy notes

- `SITE_ORIGIN` changes storefront canonical/social metadata and sitemap at build time. No canonical is written if it is unset. Rebuild when the domain changes.
- `API_SITE_ORIGIN` is written into the separate admin `_redirects`; rebuild the admin output when the primary site domain changes.
- Storefront requests go directly to its same-origin API; admin requests are proxied through the admin origin, preserving host-scoped cookie behavior.
- The API stores only data needed to handle an order and exposes no payment processor. Do not collect card details. Add and publish an owner-approved privacy/retention policy before accepting customer information.
- No analytics provider is enabled by default and no order/customer PII is sent to analytics. The storefront dispatches provider-neutral aggregate `yff:analytics` events for `add_to_cart`, `begin_checkout`, `menu_filter`, and `order_request_saved`; add a consent-aware provider only after owner review.
- The proposed plate-and-leaf favicon is a site-side concept, not a verified official business logo. The hero image is illustrative food styling, not the business’s exact product photography.
- Set custom domains and Netlify TLS first, then update `SITE_ORIGIN`, `STOREFRONT_ORIGIN`, `ADMIN_ORIGIN`, `API_SITE_ORIGIN`, and `VITE_STOREFRONT_ORIGIN` to the exact final origins and rebuild/redeploy both sites.
