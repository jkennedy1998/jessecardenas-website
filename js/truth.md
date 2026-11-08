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

### 2026-11-08T14:03Z-mobile-centering-and-shorter-loader
- j-quote: "I didn't see the grid vertically alligned to center when nothing is selected but I saw it get horizontally moved (weirdly) when nothing was selected. Might of swapped coordinates...\n\nIntro screen looks better. Let's make it 60 percent of its current length minimum"
- interpretation: the unselected phone board needs explicit two-axis viewport centering without an offset from the collapsed cart track. Scale the complete fast-load intro timing (hold, settle, and fade) to 60% while retaining the decelerated exit.

### 2026-11-08T14:09Z-mobile-board-position-motion
- j-quote: "It clips location it should slide eased in both directions ideally."
- interpretation: changing between the vertically centered empty-board composition and the top-aligned cart flow must animate along the actual measured route on both entering and leaving selection, rather than clipping between layout states.

### 2026-11-08T14:16Z-mobile-card-during-board-motion
- j-quote: "I notice if the screen is moving the text box doesn't get created in the right spot. Once screen settles it is in the right spot for the text box next to the Earing -- but only on new eating text boxes. The text box created when the Earing is being selected is created and stays at the wrong y height"
- interpretation: a mobile detail card created during the board's layout glide must track the board's live visual bounds until motion completes, so the initial selected earring card does not retain a pre-settle vertical coordinate.

### 2026-11-08T14:24Z-selected-earring-idle-pulses
- j-quote: "Let's make it so selected earings spin slowly and nicely when the user has them selected but the user has not dragged them in the last 5 seconds. This should happen on selected as well so each Earing spins a little bit ideally with a pulse in a random direction and random strength."
- interpretation: each cart-selected earring independently waits five seconds after direct manipulation, then gives its frame-sequence dial small randomized direction/strength impulses at an irregular cadence. Interaction resets the quiet timer; reduced-motion visitors receive no autonomous pulses.

### 2026-11-08T14:31Z-selection-opening-turn
- j-quote: "It should ideally happen on the tap that selects the Earing too so that it pulls the user to rotate it / shows them the Earing in 3d without needing them to do anything. Also I notice that it's kind of a little rotation . Let's increase it's overall force by 2"
- interpretation: a new selection triggers a randomized opening turn as soon as the full-sheet canvas safely owns the render, inviting manual rotation; selected-turn impulses use exactly double the prior force range while subsequent idle turns retain their independent cadence.

### 2026-11-08T14:38Z-immediate-strong-selection-turn
- j-quote: "I notice them now but they are still kind of slow and also don't happen on Earing select, I notice that it moves really slowly, then I have to wait for it to impulse. Let's increase impulse, randomize impulse a bit for course, and then make sure it fires on earing select"
- interpretation: a selection turn fires immediately on the tap (including the progressive preview ring), then fires again after a pending full-sheet handoff; use a substantially stronger, broadly randomized `7–12 rad/s` selected-turn range so the 3D invitation reads instantly.
