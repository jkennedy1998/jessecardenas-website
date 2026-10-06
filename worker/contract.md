# Stripe shop worker

## purpose
- Join Stripe Products to private shop inventory and prepared graphics, then safely reserve individual earrings for hosted Checkout.

## owns
- Product-ID-bound inventory, publication, and graphic-assignment records
- Catalog Studio API and shared-password authorization check
- serialized stock reservations, releases, and paid-order confirmation
- Stripe catalog projection, Checkout Session creation, signature verification, and event dedupe
- gating the static `/studio/*` page behind the same shared password, by proxying it from the Worker route

## does not own
- Stripe Product, Price, or customer authoring
- static shop and Studio rendering
- prepared visual assets or future video/media processing
- Cloudflare DNS/zone or deployment credentials

## children-encapsulations
- none

## contents
- `index.mjs`
  - Cloudflare Worker and serialized inventory Durable Object.
- `README.md`
  - operational data model, Access setup, and deployment instructions.
- `contract.md`
  - this boundary contract.
- `truth.md`
  - durable J decisions governing inventory and Studio behavior.
- `tests/`
  - Worker catalog, reservation, and Studio-access behavior proof.

## dependencies
- Stripe API: Products, Prices, Checkout Sessions, and signed webhooks
- Cloudflare Durable Objects: persistent inventory, reservation, and webhook-dedupe state

## exposed interfaces
### getCatalog — return sellable Product and inventory joins
send: {}
returns: { listings: array }
effects: read-artifacts, network, secrets, persistent-session
via: rpc `GET /api/catalog`

### createCheckout — reserve units and create hosted Stripe Checkout
send: { items: array }
returns: { url: string }
effects: write-artifacts, network, secrets, persistent-session
via: rpc `POST /api/checkout`

### getStudioListings — return Stripe Products with private listing controls
send: {}
returns: { listings: array }
effects: read-artifacts, network, secrets, persistent-session
via: rpc `GET /api/studio/listings`

### saveStudioListing — set available stock, graphic, and publication state
send: { productId: string, quantity: number, graphicKey: string, published: boolean }
returns: { listing: object }
effects: write-artifacts, network, secrets, persistent-session
via: rpc `PUT /api/studio/listings/:productId`

### receiveStripeWebhook — reconcile a Stripe checkout lifecycle event
send: { stripeSignature: string, payload: string }
returns: { received: boolean }
effects: write-artifacts, network, secrets, persistent-session
via: rpc `POST /api/webhooks/stripe`

## interface consumers
- `/home/j/Repos/jessecardenas-website/: getCatalog, createCheckout, getStudioListings, saveStudioListing`
- Stripe: receiveStripeWebhook

## artifacts
- Cloudflare Durable Object storage
  - private listing records, time-limited checkout reservations, and processed Stripe event identifiers.

## tests
- worker catalog contract
  - light
  - validates published stock joins to live Stripe product fields.
- worker checkout reservation contract
  - light
  - validates pair quantities reserve two individual units.
- studio authorization contract
  - light
  - validates only the shared `STUDIO_PASSWORD` may mutate listing state.

## data
- none

## notes
- The graphic key is a stable visual asset identifier. Studio, not a product title, binds it to the Stripe Product ID.
