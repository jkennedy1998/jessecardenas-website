# catalog studio truths

### 2026-10-09-layout-authoring-ux
- j-quote: "since we allow the user to already drag nodes around we could create a function on the studio page maybe a subpage of the studio where Jesse can reorient the earrings and save on a given display layout."
- j-quote: "Ideally this is on the same page as the studio page maybe below it so we don't have to create a new subage for it."
- interpretation: layout authoring lives below the existing studio section on the same page; Jesse drags earrings onto the grate replica and saves per layout.

### 2026-10-09-drag-off-grid-removes
- j-quote: "if they drag an earring off of the grid that should be a way for them to delete the earring from that layout."
- interpretation: dragging a placed earring off the board removes its placement in the studio editor.

### 2026-10-09-page-controls
- j-quote: "we could have X beneath it and then maybe we could have a like plus button that represents adding a new page."
- interpretation: studio page dots get an X (delete page) and a plus (new page); new layouts default to empty ("new layouts layouts can default to empty yes I think that works fine").

### 2026-10-09-pickers-use-stripe-thumbs
- j-quote: "In the dropdown menu we should be using those PNG thumbnails that we are deriving from Stripe already on the studio page."
- interpretation: the studio layout picker lists earrings with their existing Stripe-derived PNG thumbnails, filtered to available >= 1.

### 2026-10-15-organizer-top-and-real-graphics
- j-quote: "the studio page has an organizer on the bottom. lets put that on top instead for the studdio page."
- j-quote: "it would be reaally nice if that organizer used the same graphics -- maybe scaled down and using frame 1 of the earing."
- interpretation: the layout editor moved above the listings section and its picker/placed thumbnails render the same sprite-sheet graphics the public board uses (rest frame, scaled down), not the Stripe PNGs.

### 2026-10-15-straight-on-frame-offset
- j-quote: "per earing, we probably need to be able to set the frame 1 / straight forward becasue some earinmgs are rottated differently. an offset to the graphic index like we offset size could be quite nice per earing entry."
- j-quote: "maybe in the per earing sections of the studiop poage we could sdisplay frame 1 of the selected graphic and the image on stripe."
- interpretation: each listing gets a frameOffset like sizePercent — Studio shows the offset frame of the selected graphic next to the Stripe image, the stepper picks the rest frame, and the public board rests on that frame.
