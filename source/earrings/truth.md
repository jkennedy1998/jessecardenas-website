### 2026-04-02-stripe-listings
- j-quote: "earings current listings have to derrive from the listings on stripe."
- interpretation: Stripe owns the current shop listing facts; this boundary only owns stable prepared-art keys selected for a Stripe Product in Catalog Studio.

### 2026-04-02-purple-lollypop
- j-quote: "for now we a singel earing graphic you pick out for the one item on the stripe listing. thelisting is purple lollypop."
- interpretation: Purple lollypop is the initial prepared graphic selected manually for its Stripe Product.

### 2026-04-02-video-intake
- j-quote: "they update item on stripe and get me the video for their new earing > i submit video to meddia manipulator and get an operator to add the earing as a standard listing on the site."
- interpretation: new listings are a two-step Stripe update plus prepared-media/manual-map workflow.

### 2026-10-12-approved-graphics-replace-single
- j-quote: "i only see one graphikc from before in this studio list on jesses site. those shoujld have all the approved graohics. we can remove that old one and replace it with this longer list of approved graphics"
- interpretation: graphics.json holds the full approved media-manipulator set (18 sheets from earings-to-process-successful tickets); the single purple-lollypop era ends and its prepared folder is removed.

### 2026-11-08T12:20Z-progressive-earring-load
- j-quote: "maybe front angle on page load for all assets\nSome front angles on the specific earings grid load (so we have Earing first frame on first load of site for all grid layouts of earings)\nThen we load the slight off angles for each earring when their grid is up and selected\nAnd load the full angles when a user interacts with a specific Earing? Or maybe if they are on the grid page while nothing else is still loading the slight angle assets?\n\nMaybe if the earrings could rotate aware of their loaded frames, so they could bounce back through the loaded frames if a user tries to rotate the Earing before it's all loaded. Either via mouse hover or spinning. Ideally the Earing is spinning it's sequence almost atomically so we have a standard way of updating the sequence."
- interpretation: progressive media has three tiers—rest-angle poster across all grid layouts, nearby angles for the visible grid, and full rotation on interaction or later idle time. Rotation must use one continuous sequence model and constrain or rebound through currently available frames.

### 2026-11-08T12:20Z-loading-screen-art-direction
- j-quote: "\"welcome to my shop\" in the font, let's make it that purple color. Maybe you could have the loading screen be a temp asset we swap later. At a later date the client wants to have a few photo assets flash through a few different images in a motion graphics match cut style with their logo. Ill deliver that later as a png or jpg sequence on white. Let's have the background for the load page be white.\nIdeally all assets can fade in nicely. What might be quickest is to render a white box over the entire page, the text on top of that centered vertically and horizontaly. Maybe for this temp text version we can just cycle a few colors for the letters of the text. Maybe the darker tone could cycle per character. Maybe even the weights could cycle a bit so it looks like the text is animated. Could be REALLY cool and win me pookie points (client is pookie) if this effect is really badass I could see using the text weight animation with it scrolling across multiple weights (per character not per word or line, should ideally loop / never feel like it cuts. Like waves of weights washing over the text gradually maybe between 4 weights ideally or however many are available.) maybe only a few characters wide per weight so that the user can really see it move. Could shift 1 character over per .2 seconds. Like maybe a 12 fps sin wave of weights? That could be dope if the colors did that too but at a different frequency to not lock allign the waves."
- interpretation: use a replaceable white full-page loading overlay with centered animated Josefin Sans “welcome to my shop” lettering. Per-character weight and purple-palette color waves use different looping frequencies; later supplied white-background image sequences replace the text treatment while preserving the overlay seam.
