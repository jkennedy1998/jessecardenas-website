# Stripe shop + Catalog Studio worker

Stripe owns Product copy and Prices. The Worker owns stock, publication state,
and the Product-ID-to-graphic assignment in one Durable Object. Stripe Product
metadata only holds `Material`; it is not used for inventory.

## Catalog Studio

`/studio/` is Jesse's private listing control surface, gated by a shared
password (HTTP Basic Auth) known only to Jesse and the operator — no account
or login flow. Each Stripe Product can be given:

- **total individual earrings** — true stock; units currently held in checkout
  stay counted here until payment lands
- **approved graphic** — a key from `source/earrings/graphics.json`
- **publish** — only published records with stock appear in the shop

The Worker binds those values to Stripe's immutable Product ID, so edits to a
Product name, description, or default Price cannot detach its prepared art.

## board layouts

Saved display layouts (name + ordered `[{productId, node}]` placements) live in
the same Durable Object. Studio CRUD is password-gated; `GET /api/layouts` is
public and returns every layout ordered by `order`. Stock never edits a layout:
a sold-out placement just renders as an empty slot on the public board.

## checkout lifecycle

The Worker atomically reserves the requested individual units before it creates
a 30-minute Stripe Checkout Session. A hold reduces *availability* (stock minus
pending holds) but never the stored stock value. Only Stripe's signed
`checkout.session.completed` (paid) webhook permanently decrements stock;
an expired or failed session simply drops its hold. Webhook event IDs are
deduped, and the Worker verifies Stripe's signature before changing stock.

## deploy

1. In Cloudflare, proxy `jessecardenas.com`, then deploy this Worker
   (`wrangler.jsonc` already declares both routes):

   ```sh
   npx wrangler deploy
   ```

2. Set secrets; never put them in Git or browser code:

   ```sh
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put STUDIO_PASSWORD
   ```

3. `wrangler.jsonc` sets the non-secret Worker variables:
   - `SITE_ORIGIN`: `https://jessecardenas.com`
   - `routes`: covers both `jessecardenas.com/api/*` and `jessecardenas.com/studio/*`

   The Worker requires `STUDIO_PASSWORD` (HTTP Basic Auth, any username) for
   both the `/studio/*` page and `/api/studio/*` endpoints before anything is
   served or mutated. `workers_dev` is disabled so this protection is not
   bypassable through a `workers.dev` hostname.

4. In Stripe, add `https://jessecardenas.com/api/webhooks/stripe` for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`

   Use that endpoint's signing secret for `STRIPE_WEBHOOK_SECRET`.

For a new earring, Jesse creates/edits its Stripe Product and default Price;
the operator prepares the art, then uses Catalog Studio to choose that graphic,
enter stock, and publish. Direct video upload is the next version: it will add
a media-intake request stage without changing this inventory boundary.
