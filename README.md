# jessecardenas-website

Website for jessecardenas.com — an earring shop built from reusable horizontal slices.

## shape

```text
index.html              -> landing page (links to /earrings/)
earrings/               -> the shop page (built like a portfolio page)
js/components.js        -> shared chrome + slice rendering + hanging view
js/shop.js              -> cart + checkout stub (SHOP_CONFIG endpoint)
css/style.css           -> site styles, per-entry color via slice CSS vars
assets/grate.png        -> shared wire-grate display backdrop
source/earrings/        -> <slug>/entry.md + images = a listing
worker/                 -> stripe checkout backend stub (cloudflare, later)
.github/workflows/      -> pages build + deploy on push to main
```

## adding an earring (repo-edit flow)

Create a folder under `source/earrings/<slug>/` with an `entry.md` and drop
images named `image-1.jpg`, `image-2.png`, ... next to it:

```text
source/earrings/example-earring/
  entry.md
  image-1.jpg
```

entry.md fields:

```text
## title        -> earring name
## price        -> price in dollars per single earring
## quantity     -> starting quantity in singles (stock truth, for now)
## materials    -> materials used
## made         -> when the earring was made
## description  -> long description
## preset       -> slice layout preset (single-media for now)
## colors       -> per-slice color control
```

media files in the entry folder:

```text
top.png / bottom.png -> two-piece hanging view: both pivot on one axis
                       (top piece bottom-center, bottom piece top-center)
                       so the earring dangles/swings on the grate
gallery images       -> image-1.jpg, image-2.png, ... plain static shots
```

Run `node build-entries.mjs` to regenerate `source/earrings/entries.js`,
commit, push. GitHub Actions deploys to Pages automatically.

## stock + checkout (current state)

- Listings show quantity left in singles (`3 left`, or `sold out` + dimmed at 0).
  Pairs cost 2x singles; a pair button needs 2 available.
- Add single / add pair toggles feed a sticky cart tracker (singles vs pairs,
  running total). Cart is in-memory only for now.
- Checkout is stubbed: it posts the order payload to the endpoint in
  `SHOP_CONFIG` (js/shop.js) and logs locally until the cloudflare worker
  lands. See worker/README.md for the reservation/delisting plan.
- Stock truth is the `## quantity` line in entry.md, edited via repo commits.
  Cart selections do not decrement it yet.

## later: admin panel

Idea recorded from J: a password-gated "earring addition moderator page"
(potential subdomain) where Jesse can upload entry images + text data
(materials, description, price, starting quantity) and edit quantities of
existing listings when stock changes outside the shop. Not built — repo-edit
flow covers it for now.

## deploy

GitHub Pages via `.github/workflows/deploy.yml` (build + deploy on push to
main). Domain: jessecardenas.com via CNAME. Repo still needs its GitHub
remote created and the Pages source set to GitHub Actions.

Hosting note: GitHub was only chosen for easy free image hosting. If the
cloudflare worker lands first, the static site can move to Cloudflare Pages
and drop GitHub entirely — same builder, same output.
