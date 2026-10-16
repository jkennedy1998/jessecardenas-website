# catalog studio

## purpose
- Give Jesse a small private site surface to control stock, visual assignment, and publication without exposing customer checkout or Stripe credentials.

## owns
- private Studio browser page and its rendering behavior
- the Studio client call shapes for listing and saving catalog records

## does not own
- identity enforcement, inventory persistence, or Stripe API calls
- prepared visual assets and future video processing
- public storefront rendering

## children-encapsulations
- none

## contents
- `index.html`
  - private Catalog Studio page shell: board-layout organizer on top, Stripe listing forms below.
- `studio.js`
  - Studio listing form (stock, graphic, size, straight-on frame, publish), frame preview canvas, and Worker API client.
- `layouts.js`
  - board layout authoring: layout dots, grate replica drag editing, and the sprite-sheet-frame picker/placed thumbnails.
- `contract.md`
  - this boundary contract.

## dependencies
- `/home/j/Repos/jessecardenas-website/worker/: getStudioListings, saveStudioListing`
- `/home/j/Repos/jessecardenas-website/source/earrings/: generated entries.js graphic keys`
- Cloudflare Access: path protection before the page is served

## exposed interfaces
- none

## interface consumers
- none

## artifacts
- none

## tests
- Studio browser smoke test
  - light
  - renders returned Stripe Product listing forms and saves an edited record.

## data
- none

## notes
- Direct video upload is intentionally deferred. It will become a separate media-intake submission state rather than a raw file upload routed through this page's Worker calls.
