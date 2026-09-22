# worker

Cloudflare Worker backend stub — intentionally not built yet.

Later, this worker owns:

- `POST /api/checkout` — stripe checkout session creation from the cart payload
- atomic reservation of each single when the checkout session is created,
  released when the session expires (two buyers can never grab the same single)
- quantity decreases/increases when orders settle
- sold-out delisting when a listing hits zero

The client currently posts to `/api/checkout` (see `SHOP_CONFIG` in
`js/shop.js`) and logs the order payload locally when the endpoint is absent.
