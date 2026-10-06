# earrings catalog visuals

## purpose
- Own stable prepared-graphic keys; Catalog Studio intentionally binds those keys to Stripe Product IDs while Stripe remains the source of listing text and price.

## owns
- earring graphic-map source and generated browser visual map
- the retained Purple lollypop animation assets
- palette families used by mapped visuals

## does not own
- listing title, description, materials, price, quantity, checkout, or stock reservation
- video intake and media processing scratch
- Stripe API transport and webhooks

## children-encapsulations
- none

## contents
- `graphics.json`
  - operator-assigned graphic keys and their prepared animation data.
- `palette.json`
  - named accent palettes for earring interaction states.
- `build-entries.mjs`
  - validates and compiles the graphic map for the browser.
- `entries.js`
  - generated browser visual map.
- `purple-lolipop/`
  - active Purple lollypop frame sequence and its source description.
- `export-frames.py`
  - legacy local frame-sheet exporter.
- `export-frames-seq.py`
  - local image-sequence frame-sheet exporter.
- `import-cutout-seq.py`
  - local cutout-sequence importer.
- `split-earring-asset.py`
  - legacy two-piece earring asset helper.
- `truth.md`
  - durable J design decisions for this boundary.

## dependencies
- none

## exposed interfaces
### buildVisualMap — compile the browser visual map
send: {}
returns: { entriesPath: string }
effects: read-files, write-files, local-process
via: cli `build-entries.mjs`

## interface consumers
- `/home/j/Repos/jessecardenas-website/: generated source/earrings/entries.js`

## artifacts
- none

## tests
- `node build-entries.mjs`
  - light
  - validates the manual graphic map and generated browser map.

## data
- none

## notes
- The key in `graphics.json` is a stable media identity selected in Catalog Studio after its animation sequence is prepared.
