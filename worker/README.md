# Stripe shop + Catalog Studio worker

Stripe owns Product copy and Prices. The Worker owns stock, publication state,
and the Product-ID-to-graphic assignment in one Durable Object. Stripe Product
metadata only holds `Material`; it is not used for inventory.

## Catalog Studio

`/studio/` is Jesse's private listing control surface. Each Stripe Product can
be given:

- **available individual earrings** — current sellable stock
- **approved graphic** — a key from `source/earrings/graphics.json`
- **publish** — only published records with stock appear in the shop

The Worker binds those values to Stripe's immutable Product ID, so edits to a
Product name, description, or default Price cannot detach its prepared art.

## checkout lifecycle

The Worker atomically reserves the requested individual units before it creates
a 30-minute Stripe Checkout Session. A successful payment keeps that reduction;
an expired or failed session releases it. Webhook event IDs are deduped, and the
Worker verifies Stripe's signature before changing stock.

## deploy

1. In Cloudflare, proxy `jessecardenas.com`, then deploy this Worker to
   `jessecardenas.com/api/*`:

   ```sh
   npx wrangler deploy --route 'jessecardenas.com/api/*'
   ```

2. Set secrets; never put them in Git or browser code:

   ```sh
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

3. `wrangler.jsonc` sets the non-secret Worker variables:
   - `SITE_ORIGIN`: `https://jessecardenas.com`
   - `ADMIN_EMAIL`: Jesse's exact email address

4. Create a Cloudflare Access application for both:
   - `https://jessecardenas.com/studio/*`
   - `https://jessecardenas.com/api/studio/*`

   Allow only Jesse's email. The Worker verifies the Access email again for
   every Studio API request. `workers_dev` is disabled so this protection is
   not bypassable through a `workers.dev` hostname.

5. In Stripe, add `https://jessecardenas.com/api/webhooks/stripe` for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`

   Use that endpoint's signing secret for `STRIPE_WEBHOOK_SECRET`.

For a new earring, Jesse creates/edits its Stripe Product and default Price;
the operator prepares the art, then uses Catalog Studio to choose that graphic,
enter stock, and publish. Direct video upload is the next version: it will add
a media-intake request stage without changing this inventory boundary.
