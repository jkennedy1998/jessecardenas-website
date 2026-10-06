# jessecardenas-website

Website for jessecardenas.com: a Stripe-powered handmade earring shop with a
private Catalog Studio.

## catalog ownership

- **Stripe** owns Product title, description, `Material` metadata, active
  status, and default Price.
- **Catalog Studio** (`/studio/`, protected by a shared password) owns available
  individual-earring stock, publication, and the prepared graphic selected for
  each Stripe Product ID.
- **source/earrings/graphics.json** owns prepared art keyed by stable graphic
  key; a product title can change without breaking its art assignment.

The public shop only shows records that are both published and in stock. A
single reserves one unit; a pair reserves two.

## adding or changing an earring

1. Jesse creates or edits the Product and default Price in Stripe. Materials go
   in Product metadata as `Material`.
2. For new/replacement art, the operator prepares the supplied rotation video
   into a frame sequence and adds it to `source/earrings/graphics.json`.
3. In Catalog Studio, choose that graphic for the Stripe Product, enter stock,
   and publish.

The planned next version lets Jesse submit videos in Studio. It will create a
reviewable media-intake request; it will not replace approved live art until an
operator publishes the processed result.

## checkout and stock

The Cloudflare Worker reserves inventory before it creates a Stripe Checkout
Session. Stripe webhook events retain a paid reservation or release expired /
failed sessions. See `worker/README.md` for Access, webhook, and deployment
setup.

## local build

```sh
node build-entries.mjs
```

This regenerates `source/earrings/entries.js` from the visual map. GitHub
Actions runs the same build before Pages deployment.
