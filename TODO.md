# TODO

## 1. Mobile-first storefront and verified menu experience
- [x] Build the Your Foodie Friend storefront as a complete, responsive, mobile-first website for the Port Harcourt, Rivers State preorder business, using cream `#F6F0E7`, terracotta `#C65D35`, forest green `#304B39`, dark brown `#49392D`, and white unless an official business brand asset overrides them.
- [x] Create a premium, warm, appetizing, modern visual identity and use excellent Nigerian food photography; do not represent illustrative imagery as actual product photography. Do not invent products, testimonials, discounts, certifications, customer counts, or other business claims.
- [x] Implement clear navigation, accessible typography, searchable menu, category filters, and product detail views. Import the 28 entries from the supplied 30 June 2026 menu only as unpublished drafts until the owner confirms current prices/currency, item variants, availability, portions, and other details. Keep products editable and do not invent product descriptions or allergens.
- [x] Provide responsive, keyboard-accessible cart and checkout interfaces with visible focus, semantic labels, loading, validation, error, success, unavailable-slot and empty-menu states. Do not claim current menu prices or accept an order while unverified menu/availability data remains unpublished.

## 2. Preorder checkout, availability and WhatsApp handoff
- [x] Allow date and time selection only for owner-configured preorder availability; provide pickup or delivery selection and collect only the customer information needed for the chosen fulfillment mode.
- [x] Generate a structured WhatsApp checkout message addressed to `+2348137523400`, containing the selected items, quantities, selected date/time, pickup/delivery choice, and relevant customer details. Calculate prices and totals server-side from persistent menu data, not from client input.
- [x] Persist an order before providing the WhatsApp handoff, prevent duplicate submissions, and clearly tell customers that sending an order request does not confirm it; the business confirms only by accepting it. Display useful error and retry states when persistence or WhatsApp handoff fails.
- [x] Build owner controls for preorder-day/time-slot scheduling, availability, lead-time, fulfillment options, service areas and fees, and relevant policies. Treat the historical PDF’s Monday/Wednesday/Friday/Saturday delivery days and policy notes as unconfirmed drafts until the owner explicitly verifies them; never invent hours, zones, addresses or fees.

## 3. Secure separate admin website and order management
- [x] Build a separately deployable admin website on Netlify that uses the shared API rather than browser-side database access. Require secure owner authentication; store no default password and no credentials in static files. Keep private functions behind server-side authorization.
- [x] Provide persistent CRUD for products/categories, prices/currency, descriptions, image references, publication state, schedule and business settings. Unverified records remain unpublished until confirmed.
- [x] Provide an order-management view with order details, customer-selected fulfillment/date/time, status changes, and a clear pending-business-acceptance state. Validate and authorize every admin action server-side.

## 4. Netlify Functions API and persistent database
- [x] Implement the shared `/api/*` Netlify Functions API and persistent Netlify Database (Postgres) for products, categories, orders, line-item price snapshots, availability, settings, and order status.
- [x] Use server-side input validation, parameterized SQL, transactions for order creation, server-side price/availability checks, safe error handling, duplicate-order protection, and login rate limits. Keep database/admin secrets in server-only Netlify environment variables.
- [x] Add tracked, additive Netlify Database SQL migrations and a safe first-time password-hash/setup helper. Do not reset or destructively rewrite the database.
- [x] Configure the storefront Netlify site to host the public UI and shared API/database, and the separate Netlify admin site to proxy its same-origin `/api/*` traffic to the shared API. Configure permitted origins and secure short-lived HTTP-only sessions; do not rely on third-party cookies or expose database credentials to either frontend.

## 5. SEO, accessibility, security, performance and operations
- [x] Implement useful initial page HTML and metadata, appropriate robots/sitemap behavior, no guessed canonical URL, and an analytics-ready integration point that does not send customer/order PII. Keep private admin content out of indexing.
- [x] Apply responsive/accessibility and performance practices including keyboard operation, visible focus, reduced-motion support, contrast, optimized/lazy-loaded images, and clear offline/loading/error/empty states.
- [x] Verify the supplied social/contact destinations before labeling them active. The supplied Linktree targets TikTok `https://www.tiktok.com/@your_foodiefriend`, WhatsApp `https://wa.me/2348137523400`, and Instagram `https://www.instagram.com/your_foodiefriend1`; TikTok currently says the business is on a break and Instagram currently reports unavailable. Do not invent an official logo or link destinations.
- [x] Write deployment documentation for the separate Netlify storefront and admin sites, shared Functions API, Netlify Database provisioning and migrations, required Node/Netlify CLI versions, server-side secrets, API proxy configuration, domain setup, owner verification, and the data-review steps required before production ordering is enabled. Disclose that Netlify Database requires a credit-based Netlify plan and that this code package is not a live deployment.
- [x] Deliver the deployable storefront and admin HTML/CSS/JS files and include the corresponding API/functions/migrations/configuration/deployment documentation in a packaged handoff.

## Delivery and activation status

The implementation, source code, SQL migration, deployable build outputs, and deployment instructions are prepared and locally validated. This does **not** mean that the sites are live or connected to Netlify. Before production orders can be accepted, the owner must connect both Netlify sites and the managed Postgres database, set HTTPS site origins and protected admin credentials, apply the migration through Netlify's deployment lifecycle, confirm current menu prices/currency/variants, schedules/hours, pickup/delivery zones and fees, privacy/order policies, and verify public social destinations. Until then the menu remains unpublished and online checkout remains closed.
