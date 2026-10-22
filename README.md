# Your Foodie Friend

Mobile-first storefront and private owner dashboard for a preorder food business serving Port Harcourt, Rivers State, Nigeria. The repository builds two independent Netlify sites and a shared Netlify Functions API backed by Postgres.

**This is deployable source, not a live service.** It has no connected Netlify sites, domains, database, or owner credentials yet. Public checkout remains closed until the owner verifies the current menu, prices/currency, operating hours, pickup/delivery information, fees, policies, and preorder availability.

Start with [`README-NETLIFY.md`](README-NETLIFY.md) for deployment, environment variables, password setup, database migrations, the admin proxy, and pre-launch review gates.

## Local development

- `pnpm install --frozen-lockfile` installs the pinned toolchain dependencies.
- `pnpm dev` runs the inherited development stack on port 3000.
- `pnpm check` type-checks frontend and serverless API code.
- `pnpm build:storefront` creates the storefront static output.
- `pnpm build:admin` creates the separate admin static output.
- `pnpm build:netlify` builds both sites and writes domain metadata/proxy rules; set the site-origin environment values documented in [`README-NETLIFY.md`](README-NETLIFY.md) first.
- `pnpm exec netlify functions:build --src netlify/functions --functions .netlify/functions-build` bundles the API function.

Never run `drizzle-kit push` against the Netlify database. The database migration SQL is under `netlify/database/migrations/`; follow the current Netlify Database workflow documented in the deployment guide.
