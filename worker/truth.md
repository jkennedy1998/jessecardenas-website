### 2026-10-09-board-layouts-are-display-truth
- j-quote: "All of the earrings and the board should refresh once the user changes which board they're looking at."
- j-quote: "Even if a user has an earring selected that earring should disappear because it's part of another board the earring should still stay selected if it's within the right UI and selected for purchase but the user only sees the photographs of the earring that they're looking at on the board."
- interpretation: a saved layout is the full display truth for its board — switching boards swaps the whole grid; cart selection persists even when the selected earring is not on the visible board.

### 2026-10-09-selection-board
- j-quote: "we have a board that's the always the last on the index of boards and is only around if the user has any earrings selected."
- j-quote: "Jesse should not be able to change that last page that we talked about in the answer to question 1 that basically resembles the users cart."
- interpretation: a final auto board appears only while the user has selections and shows every selected earring for viewing/deselecting; it is never authorable; the cart may render there later but stays a separate page for now.

### 2026-10-09-soldout-slots-empty
- j-quote: "If a placed earring sells out the slot should go emty."
- interpretation: layouts keep placements; sold-out earrings render as empty slots and stock never auto-edits a layout.

### 2026-10-09-pickers-hide-zero-stock
- j-quote: "any earrings with a quantity over one should be displayed and we should not display any earrings with the quantity below one. This should be true for the website and for the UX where Jesse is choosing which earrings to drag into a display at a given time."
- interpretation: available >= 1 is the single visibility filter for both the public board and the studio layout picker; one-offs that sold out never pollute either view.

### 2026-04-02-stripe-source
- j-quote: "earings current listings have to derrive from the listings on stripe."
- interpretation: Stripe Products, not static site files, are the live listing source.

### 2026-10-06-catalog-studio-approved
- j-quote: "yes this sounds good. lets keep building this"
- interpretation: proceed with the protected Catalog Studio and Product-ID inventory design, while keeping direct video submission for the later version.

### 2026-10-06-client-media-studio
- j-quote: "what if we could upload videos through there? that wouldd allow jesse to interface through their own site to update ionventory and add in new videos / replace videos of earings with new media intake things....\nmaybe a bit complex for v1, but we could work to get there in the final version."
- interpretation: Jesse should ultimately have a protected site studio for inventory and media-submission/replacement, while direct media intake is deferred beyond the first version.

### 2026-10-06-inventory-ownership
- j-quote: "i jsut found out stripe does not do inventory sop we need to manager it in a good way."
- interpretation: Stripe should not be treated as the inventory authority; the shop needs its own inventory state and checkout reservation lifecycle.

### 2026-04-02-stock-behavior
- j-quote: "then when there is no more quantity per an earing it will not be shown. when only one left is availible the user should only be able to buy 1."
- interpretation: quantity is individual-earring stock; zero hides a listing and checkout rejects quantities beyond available stock.

### 2026-10-07-stock-drop-after-purchase
- j-quote: "stock went down after i got the the stripe link > not after i made the purchase. this shiouyld happen after purchase not after the purchase button is pressed."
- j-quote: "the stock needds to be pretty watertight."
- interpretation: checkout-button press only holds units (availability); stored stock decrements exactly once, on the paid Stripe webhook.

### 2026-10-06-studio-admin
- j-quote: "Jeshcaprints@gmail.com for jesses email"
- interpretation: Catalog Studio access must be limited to `Jeshcaprints@gmail.com`.

### 2026-10-06-live-stripe
- j-quote: "STRIPE_JESSE_SECRET_KEY is now in jobo config secrets... jesse added one earing to the site, haad to get off of sandbox mode"
- interpretation: the live Stripe account is now the shop integration target, with a currently created earring Product.

### 2026-10-06-material-metadata-key
- j-quote: "material is on there not materials . jesse says its on there"
- interpretation: the live Stripe Product's customer-facing materials use the exact metadata key `Material`.

### 2026-10-06-studio-shared-password
- j-quote: "we could do that, or we could do a password only jesse and i know. that would be nice and easy"
- interpretation: Catalog Studio access is a single shared password (HTTP Basic Auth) known only to Jesse and the operator, not a Cloudflare Access email/OTP login.

### 2026-04-02-product-fields
- j-quote: "stripe item should have the materials as metaddata, the price should be gotten from there, the description and title as well."
- interpretation: `Material` comes from Product metadata; name, description, and default Price come from Stripe's normal Product and Price fields.
