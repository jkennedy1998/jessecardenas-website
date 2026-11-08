# js — board interaction design truths

### 2026-10-15T11:40Z-one-gesture-surface
- j-quote: "YES thats great!"
- model-quote: "One gesture surface, no zones: tap → select; drag → move it along the grate; flick → fast horizontal release with low net travel = spin it in place with momentum."
- interpretation: the two-zone hit split (upper move / lower dial) is retired. Every earring is one gesture surface where gesture shape (travel, speed, direction) picks the meaning; the drag-velocity dial coupling stays as the turn-while-moving behavior.

### 2026-11-07T22:07Z-mobile-cart-selection
- j-quote: "Tap selects an Earing. Last selected Earing gets bigger than the rest (like we do on desktop,) Hold and swipe rotates selected Earing.\n\nSelected earrings are the ones in the cart\nTap a selected Earing to deselect. Only last selected Earing is big. On no selection : none are bigger."
- interpretation: on compact layouts, tap directly toggles the earring's cart membership; the most recently selected cart item alone gets the enlarged focus treatment, and holding then swiping a selected item rotates it without repositioning it.

### 2026-11-08T11:56Z-mobile-active-selection
- j-quote: "When I tap an Earing that is already in my cart but not selected let's do this instead of removing from cart.\n\nLet's have the active Earing be set to that one, and if a user taps an active Earing then it can be removed from cart.\n\nAlso I see that the text for the description of the Earing is not visible on mobile. I like the card behavior we built for desktop"
- interpretation: a tap on an inactive cart item changes active focus without changing cart membership; a tap on the active item removes it. The active mobile selection presents the existing desktop detail card, including description text.

### 2026-11-08T13:48Z-mobile-balance-and-focus
- j-quote: "I think the in mobile the grid being fixed to the top makes it feel unbalanced when there is no selection made. Also let's make the selected Earing bigger on mobile. It's kind of small and hard to see details of it."
- interpretation: an unselected mobile board is vertically centered as the full composition; once cart detail appears it becomes a top-aligned vertical flow. The active mobile earring receives a larger dedicated focus scale than desktop hover so its visual details remain legible.
