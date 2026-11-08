// Shared chrome (top bar / bottom bar) + earring slice rendering for
// jessecardenas.com. One horizontal slice per earring entry.
// ROOT is derived from this script's own URL so the site works both opened
// directly from disk (file://) and behind any static server.
const ROOT = new URL("../", document.currentScript.src).pathname;

// Board default earring scale. Lowered when the intake became high-res video
// sheets; Studio's per-listing sizePercent multiplies on top of this base.
const BOARD_BASE_SCALE = 0.4;

const NAV = [
  ["", "jesse cardenas"],
  ["earrings/", "earrings"],
];

const normalizePath = (href) =>
  (ROOT + href).replace(/\/+$/, "") || "/";

function currentPage() {
  const relative = window.location.pathname
    .replace(ROOT, "")
    .replace(/index\.html$/, "")
    .replace(/\/+$/, "");
  return normalizePath(relative);
}

function renderHeader() {
  const el = document.querySelector("header.site");
  if (!el) return;
  const cur = currentPage();
  const [brand, ...items] = NAV;
  const link = ([href, label], className = "") =>
    `<a href="${href}" class="${className}${normalizePath(href) === cur ? " active" : ""}">${label}</a>`;
  el.innerHTML =
    '<div class="site-bar-inner">' +
    link(brand, "site-brand") +
    '<nav class="site-nav" aria-label="primary">' +
    items.map((item) => link(item)).join("") +
    "</nav>" +
    "</div>";
}

function renderFooter() {
  const el = document.querySelector("footer.site");
  if (!el) return;
  el.innerHTML =
    '<div class="site-bar-inner"><span>handmade earrings</span><span>jessecardenas.com</span></div>';
}

function normalizeMediaPath(file) {
  return ROOT + String(file).replace(/^\/+/, "");
}

function createShopLoader() {
  const screen = document.querySelector(".shop-loading");
  const title = screen?.querySelector(".shop-loading-title");
  const openedAt = performance.now();
  let revealed = false;
  if (title) {
    const text = title.textContent;
    title.replaceChildren(...[...text].map((character, index) => {
      const letter = document.createElement("span");
      letter.className = "shop-loading-letter";
      if (character === " ") letter.classList.add("is-space");
      letter.style.setProperty("--letter-index", String(index));
      letter.textContent = character === " " ? " " : character;
      return letter;
    }));
  }
  return {
    reveal() {
      // The rest-pose promise and the network safety timer race deliberately.
      // Only the first caller may start the exit, keeping slow/offline visits
      // from trapping someone behind an otherwise beautiful loader.
      if (!screen || revealed) return;
      revealed = true;
      const delay = Math.max(0, 550 - (performance.now() - openedAt));
      window.setTimeout(() => screen.classList.add("is-ready"), delay);
    },
  };
}

function isVideoFile(file) {
  return /\.(mp4|webm|mov)$/i.test(file);
}

const DEFAULT_ACTIVE_PALETTE = { light: "#ced9d7", mid: "#4ad2d0", dark: "#261231" };
const rgbFor = (color) => [1, 3, 5].map((offset) =>
  Number.parseInt(color.slice(offset, offset + 2), 16));
const hueFor = (color) => {
  const [red, green, blue] = rgbFor(color).map((channel) => channel / 255);
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const span = high - low;
  if (!span) return 0;
  const hue = high === red
    ? ((green - blue) / span) % 6
    : high === green
      ? (blue - red) / span + 2
      : (red - green) / span + 4;
  return (hue * 60 + 360) % 360;
};
const hueDistance = (left, right) => Math.abs(((left - right + 540) % 360) - 180);
const paletteFor = (family) => window.EARRING_COLOR_PALETTE?.[family] || DEFAULT_ACTIVE_PALETTE;

function applyActivePalette(palette) {
  const root = document.documentElement.style;
  root.setProperty("--active-light", palette.light);
  root.setProperty("--active-mid", palette.mid);
  root.setProperty("--active-dark", palette.dark);
  root.setProperty("--active-color", palette.mid);
}

// Each earring chooses one named palette family. For multiple selections,
// blend their mid-tone hues around the color wheel, then snap to the nearest
// indexed family. RGB averaging made blue + yellow look yellow; hue blending
// makes their shared family green while preserving one cohesive UI palette.
function setActiveColor(entries) {
  const selected = entries.filter((entry) => window.Shop.has(entry.productId));
  const paletteEntries = Object.entries(window.EARRING_COLOR_PALETTE || {});
  if (!selected.length) {
    // Keep the last family alive while the selling card fades away. Its
    // opacity then blends that actual final color into the white page instead
    // of briefly repainting it with the default teal palette.
    return null;
  }
  if (!paletteEntries.length) {
    applyActivePalette(DEFAULT_ACTIVE_PALETTE);
    return DEFAULT_ACTIVE_PALETTE;
  }
  const hueVector = selected
    .map((entry) => hueFor(paletteFor(entry.colors?.accent).mid) * Math.PI / 180)
    .reduce((sum, hue) => ({ x: sum.x + Math.cos(hue), y: sum.y + Math.sin(hue) }), { x: 0, y: 0 });
  const blendedHue = (Math.atan2(hueVector.y, hueVector.x) * 180 / Math.PI + 360) % 360;
  const active = paletteEntries.reduce((closest, [, palette]) => {
    const distance = hueDistance(hueFor(palette.mid), blendedHue);
    return distance < closest.distance ? { palette, distance } : closest;
  }, { palette: DEFAULT_ACTIVE_PALETTE, distance: Infinity }).palette;
  applyActivePalette(active);
  return active;
}

// Jelly path: the whole gif hangs from its top-middle point and is warped
// as a 4-corner quad jiggle on a canvas (js/dangle.js createJelly owns
// physics + play).
function buildEarringJelly(entry) {
  const dangle = document.createElement("div");
  dangle.className = "earring-dangle earring-dangle-jelly";

  const canvas = document.createElement("canvas");
  canvas.className = "earring-jelly";
  // Extra transparent margin lets the animated stroke grow without clipping.
  const pad = 24;
  canvas.width = entry.frames.fw + pad * 2;
  canvas.height = entry.frames.fh + pad * 2;
  // The gif's top-middle is the hang point, so keep the FRAME centered on the
  // dangle origin (pivot) and let it extend downward.
  canvas.style.left = `${-(entry.frames.fw / 2 + pad)}px`;
  canvas.style.top = `${-pad}px`;

  // The visible canvas is deliberately not the interaction target: its broad,
  // transparent sprite margins made neighboring earrings steal each other's
  // hover/clicks. This smaller plane follows the same pivot and leaves the
  // painted outline fully visible.
  const preview = document.createElement("img");
  preview.className = "earring-jelly-preview";
  preview.alt = "";
  preview.width = entry.frames.fw;
  preview.height = entry.frames.fh;
  preview.style.left = `${-(entry.frames.fw / 2)}px`;
  preview.style.top = "0px";

  const hitArea = document.createElement("div");
  hitArea.className = "earring-jelly-hitarea";
  const hitWidth = Math.round(entry.frames.fw * 0.7);
  hitArea.style.width = `${hitWidth}px`;
  hitArea.style.height = `${entry.frames.fh}px`;
  hitArea.style.left = `${-hitWidth / 2}px`;

  dangle.append(canvas, preview, hitArea);
  return dangle;
}

// One fixed card serves the whole board: it is populated from the entry data
// on hover, so there can never be more than one visible at a time.
function buildEarringHoverCard(stage) {
  const card = document.createElement("article");
  card.className = "earring-hover-card";
  const title = document.createElement("h3");
  const materials = document.createElement("p");
  materials.className = "earring-hover-materials";
  const description = document.createElement("p");
  description.className = "earring-hover-description";
  const price = document.createElement("p");
  price.className = "earring-hover-price";
  card.append(title, materials, description, price);
  stage.append(card);

  let activeState = null;
  const place = (state) => {
    const boardRect = state.hang.getBoundingClientRect();
    // Anchor off the earring's resting home node and its base (un-hovered)
    // scale — never live x/y, dial angle, or the hover scale-up — so the
    // card holds still while the earring spins, jiggles, or grows under the
    // pointer. It only moves again when the hover target changes or the
    // earring is actually dropped on a new node.
    const home = state.home;
    const scale = state.baseScale;
    const earringWidth = state.fw * scale;
    const earringHeight = state.fh * scale;
    const center = boardRect.left + home.x * boardRect.width;
    const centerY = boardRect.top + home.y * boardRect.height + earringHeight / 2;
    const cardWidth = card.offsetWidth;
    // The card runs roughly as long as the earring itself.
    card.style.height = `${earringHeight}px`;
    const cardHeight = earringHeight;
    // The board, not the browser viewport, determines the card side. This
    // keeps cards for right-half earrings inside the grate side, away from
    // the selling panel in horizontal layouts.
    const wantsRight = home.x < 0.5;
    // The card's near edge reaches a little past the earring's far edge so
    // the card almost completely engulfs it (their matching stroke/card
    // color is what makes that read as one shape, not two overlapping ones).
    const overlap = 16;
    const left = wantsRight
      ? center - earringWidth / 2 - overlap
      : center + earringWidth / 2 + overlap - cardWidth;
    card.dataset.side = wantsRight ? "right" : "left";
    card.style.setProperty("--earring-clearance", `${earringWidth + overlap}px`);
    card.style.left = `${Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12))}px`;
    const top = centerY - cardHeight / 2;
    card.style.top = `${Math.max(12, Math.min(top, window.innerHeight - cardHeight - 12))}px`;
    card.style.setProperty("--card-slide-x", `${wantsRight ? -earringWidth / 2 : earringWidth / 2}px`);
  };

  window.addEventListener("resize", () => {
    if (activeState) place(activeState);
  });

  return {
    show(entry, state) {
      const changedEarring = activeState !== state;
      // Reposition once when the drag that just ended actually relocated the
      // earring to a new node — never mid-drag, so rotating/moving it never
      // reframes the card.
      const justReleased = !changedEarring && state.wasDragging && !state.dragging;
      activeState = state;
      state.wasDragging = state.dragging;
      if (changedEarring) {
        title.textContent = entry.title || entry.slug;
        materials.textContent = entry.materials || "";
        materials.hidden = !entry.materials;
        description.textContent = entry.description || "";
        description.hidden = !entry.description;
        price.textContent = `$${entry.price}`;
      }
      const cardPalette = paletteFor(entry.colors?.accent);
      card.style.setProperty("--card-color", cardPalette.dark);
      card.style.setProperty("--card-dark", cardPalette.dark);
      card.style.setProperty("--card-mid", cardPalette.mid);
      card.style.setProperty("--card-light", cardPalette.light);
      card.classList.toggle("is-selected", window.Shop.has(entry.productId));
      if (changedEarring || justReleased) place(state);
      card.classList.add("is-active");
    },
    hide() {
      activeState = null;
      card.classList.remove("is-active");
    },
  };
}

function buildEarringHang(entry, nodeIndex) {
  const dangle = document.createElement("div");
  dangle.className = "earring-dangle";

  // The hook (top piece) is static; only the pendant rotates around the
  // shared pivot axis. js/dangle.js owns position (grid node), pendulum
  // physics, and drag.
  const swing = document.createElement("div");
  swing.className = "earring-pendant-swing";

  const bottom = document.createElement("img");
  bottom.className = "earring-piece earring-piece-bottom";
  bottom.src = normalizeMediaPath(entry.mediaBottom);
  bottom.alt = entry.title || "";

  const top = document.createElement("img");
  top.className = "earring-piece earring-piece-top";
  top.src = normalizeMediaPath(entry.mediaTop);
  top.alt = "";
  top.title = "drag me";

  // The pivot sits at the top piece's bottom-center, so the swing container
  // must be offset by the top piece's intrinsic height (CSS px inside the
  // scaled dangle = natural height). Set from the real image once decoded so
  // new asset exports with different dimensions stay aligned.
  const setPivotY = () => {
    if (top.naturalHeight) dangle.style.setProperty("--pivot-y", `${top.naturalHeight}px`);
  };
  if (top.complete && top.naturalHeight) setPivotY();
  else top.addEventListener("load", setPivotY);

  swing.append(bottom);
  dangle.append(top, swing);
  return dangle;
}

function buildSliceMedia(entry, index) {
  if (entry.mediaTop && entry.mediaBottom) return buildEarringHang(entry);
  const media = document.createElement("div");
  media.className = "slice-media";
  const files = entry.mediaFiles || {};
  const sources = [...(files.images || []), ...(files.videos || [])];
  for (const file of sources) {
    if (isVideoFile(file)) {
      const video = document.createElement("video");
      video.src = normalizeMediaPath(file);
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      media.append(video);
    } else {
      const img = document.createElement("img");
      img.src = normalizeMediaPath(file);
      img.alt = entry.title || "";
      img.loading = index === 0 ? "eager" : "lazy";
      media.append(img);
    }
  }
  return media;
}

const SHOW_SLICE_COPY = false;

function buildEarringSlice(entry, index) {
  const section = document.createElement("section");
  section.className = "slice";
  section.dataset.sliceIndex = String(index);
  section.dataset.preset = entry.preset || "single-media";

  const colors = entry.colors || {};
  const setVar = (name, value) => {
    if (value) section.style.setProperty(name, `#${String(value).replace(/^#/, "")}`);
  };
  setVar("--slice-bg", colors.background);
  setVar("--slice-title", colors.title);
  setVar("--slice-subtitle", colors.subtitle);
  setVar("--slice-desc", colors.description);
  if (colors.brightness === "dark") section.classList.add("slice-bright");

  section.append(buildSliceMedia(entry, index));

  // Slice copy (title/subtitle/description/buy row) is hidden for now while
  // the visual hanging view is being developed; flip to re-enable.
  if (!SHOW_SLICE_COPY) return section;

  const copy = document.createElement("div");
  copy.className = "slice-copy";

  const title = document.createElement("h2");
  title.textContent = entry.title || "";

  const subtitle = document.createElement("p");
  subtitle.className = "slice-subtitle";
  subtitle.textContent = [entry.materials, entry.made].filter(Boolean).join(" · ");

  const desc = document.createElement("p");
  desc.className = "slice-desc";
  desc.textContent = entry.description || "";

  const buy = document.createElement("div");
  buy.className = "earring-buy";

  const price = document.createElement("span");
  price.className = "earring-price";
  price.textContent = `$${entry.price} single · $${entry.price * 2} pair`;

  const stock = document.createElement("span");
  stock.className = "earring-stock";

  const buttons = ["single", "pair"].map((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "buy-toggle";
    button.dataset.mode = mode;
    button.textContent = mode === "single" ? "add single" : "add pair";
    button.addEventListener("click", () => window.Shop.toggle(entry, mode));
    return button;
  });

  const renderStock = () => {
    const quantity = entry.quantity;
    if (quantity <= 0) {
      stock.textContent = "sold out";
      stock.classList.add("sold-out");
      section.dataset.soldOut = "true";
      buttons.forEach((button) => {
        button.disabled = true;
        button.dataset.selected = "false";
      });
      return;
    }
    stock.textContent = `${quantity} left`;
    buttons.forEach((button) => {
      const mode = button.dataset.mode;
      const needed = mode === "pair" ? 2 : 1;
      const selected = window.Shop.has(entry.productId, mode);
      button.disabled = quantity < needed && !selected;
      button.dataset.selected = selected ? "true" : "false";
    });
  };

  document.addEventListener("shop:change", renderStock);
  renderStock();

  buy.append(price, stock, ...buttons);
  copy.append(title, subtitle, desc, buy);
  section.append(copy);
  return section;
}

// Shop panel: the large card that shares the stage with the grid once the
// user has anything selected. Minimal rows — name, single/pair mode, quantity
// stepper, remaining stock (singles or pairs), line price — plus a total and
// a checkout arrow. Price never appears on the board hover card; it lives here.
function buildShopPanel(panel) {
  const list = document.createElement("div");
  list.className = "shop-list";
  const footer = document.createElement("div");
  footer.className = "shop-footer";
  const total = document.createElement("span");
  total.className = "shop-total";
  const checkout = document.createElement("button");
  checkout.className = "shop-checkout";
  checkout.type = "button";
  checkout.textContent = "checkout →";
  checkout.addEventListener("click", () => window.Shop.checkout());
  footer.append(total, checkout);
  panel.append(list, footer);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function stockText(item) {
    if (!item.maxSingles) return "sold out";
    return item.mode === "pair"
      ? `${Math.floor(item.maxSingles / 2)} pairs left`
      : `${item.maxSingles} left`;
  }

  let panelCloseTimer = null;
  let panelOpenFrame = null;

  function renderPanel() {
    const state = window.Shop.summary();
    if (!state.list.length) {
      // Keep the last rendered card in place while it fades out; collapsing
      // the grid only after the 0.6s exit avoids a visible snap.
      if (document.body.classList.contains("has-selection")) {
        cancelAnimationFrame(panelOpenFrame);
        document.body.classList.remove("is-selling-open");
        clearTimeout(panelCloseTimer);
        panelCloseTimer = window.setTimeout(() => {
          document.body.classList.remove("has-selection");
          list.replaceChildren();
          total.textContent = "";
          checkout.disabled = true;
        }, 600);
        return;
      }
      list.replaceChildren();
      total.textContent = "";
      checkout.disabled = true;
      return;
    }
    clearTimeout(panelCloseTimer);
    if (!document.body.classList.contains("has-selection")) {
      document.body.classList.add("has-selection");
      cancelAnimationFrame(panelOpenFrame);
      panelOpenFrame = requestAnimationFrame(() =>
        document.body.classList.add("is-selling-open"));
    } else {
      document.body.classList.add("is-selling-open");
    }
    list.replaceChildren();
    for (const item of state.list) {
      const row = el("div", "shop-row");
      const head = el("div", "shop-row-head");
      head.append(
        el("span", "shop-name", item.title),
        el("span", "shop-line-price", `$${window.Shop.lineTotal(item)}`),
      );
      const controls = el("div", "shop-row-controls");
      // A normal compact picker replaces the ambiguous segmented single/pair
      // control while keeping the available purchase choices explicit.
      const mode = el("select", "shop-mode");
      mode.setAttribute("aria-label", `purchase format for ${item.title}`);
      for (const modeName of ["single", "pair"]) {
        const option = el("option", "", modeName === "single" ? "single earring" : "pair");
        option.value = modeName;
        option.selected = item.mode === modeName;
        // Mirror the board's buy-toggle stock check: never offer a pair that
        // isn't actually in stock once an item is already in the cart.
        option.disabled = modeName === "pair" && item.maxSingles < 2;
        mode.append(option);
      }
      mode.addEventListener("change", () => window.Shop.setMode(item.productId, mode.value));
      const stepper = el("div", "shop-stepper");
      const minus = el("button", "shop-stepper-button", "−");
      minus.type = "button";
      minus.addEventListener("click", () => window.Shop.setQuantity(item.productId, item.quantity - 1));
      const qty = el("span", "shop-qty", String(item.quantity));
      const plus = el("button", "shop-stepper-button", "+");
      plus.type = "button";
      plus.addEventListener("click", () => window.Shop.setQuantity(item.productId, item.quantity + 1));
      stepper.append(minus, qty, plus);
      const stock = el("span", "shop-stock", stockText(item));
      const removeButton = el("button", "shop-remove", "×");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `remove ${item.title}`);
      removeButton.addEventListener("click", () => window.Shop.remove(item.productId));
      controls.append(mode, stepper, stock, removeButton);
      row.append(head, controls);
      list.append(row);
    }
    total.textContent = state.list.length ? `$${state.total}` : "";
    checkout.disabled = !state.list.length;
  }

  document.addEventListener("shop:change", renderPanel);
  renderPanel();
}

async function currentListings(signal) {
  const response = await fetch(window.SHOP_CONFIG.catalogEndpoint, { cache: "no-store", signal });
  const catalog = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(catalog.listings)) {
    throw new Error(catalog.error || "The shop is temporarily unavailable.");
  }
  const visuals = window.EARRING_VISUALS || {};
  return catalog.listings.flatMap((listing) => {
    const visual = visuals[listing.graphicKey];
    if (!visual) {
      console.warn(`[shop] no graphic mapped for Stripe product: ${listing.productId}`);
      return [];
    }
    return [{ ...listing, ...visual }];
  });
}

function showShopStatus(stage, text) {
  const status = document.createElement("p");
  status.className = "shop-status";
  status.textContent = text;
  stage?.append(status);
}

// Board layouts: the saved display layouts are the full truth for what the
// board shows (J's call). /api/layouts is public; an empty/missing list keeps
// the pre-layouts behavior so the live site never blanks before Jesse saves
// a first layout in Studio.
async function currentLayouts(signal) {
  try {
    const response = await fetch("/api/layouts", { cache: "no-store", signal });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.layouts) && data.layouts.length) return data.layouts;
  } catch {}
  return [{ id: "default", name: "", order: 0, items: null }];
}

const SELECTION_LAYOUT_ID = "__selection";

// First-free node resolution for entries without a saved node (legacy map)
// or with conflicts; used per mounting, never persisted.
function resolveNodes(list) {
  const used = new Set();
  let auto = 0;
  return list.map((entry) => {
    let node = entry.node;
    if (!node || used.has(node)) {
      do { auto += 1; } while (used.has(auto));
      node = auto;
    }
    used.add(node);
    return { ...entry, node };
  });
}

async function initEarringsPage() {
  const loader = createShopLoader();
  const board = document.querySelector(".earring-board");
  const container = document.querySelector(".slices");
  const stage = document.querySelector(".earring-stage");
  const dots = document.querySelector(".board-dots");
  let entries;
  const catalogAbort = new AbortController();
  const catalogTimeout = window.setTimeout(() => catalogAbort.abort(), 12000);
  try {
    entries = await currentListings(catalogAbort.signal);
  } catch {
    // The overlay is no longer useful once the actual failure state is ready.
    // Abort a stalled catalog request rather than leaving someone in a loop.
    showShopStatus(stage, "the shop is temporarily unavailable — please try again soon.");
    loader.reveal();
    return;
  } finally {
    window.clearTimeout(catalogTimeout);
  }
  if (!entries.length) {
    if (container) container.innerHTML = '<p class="slice-empty">no earrings listed yet — check back soon.</p>';
    else showShopStatus(stage, "no earrings listed yet — check back soon.");
    loader.reveal();
    return;
  }

  const layoutsAbort = new AbortController();
  const layoutsTimeout = window.setTimeout(() => layoutsAbort.abort(), 6000);
  const layouts = await currentLayouts(layoutsAbort.signal);
  window.clearTimeout(layoutsTimeout);
  let activeIndex = 0;
  let activeJellies = [];
  let hoverCard = null;
  const isCompactLayout = () => window.matchMedia("(max-width: 900px)").matches;
  let lastSelectedProductId = null;
  let switching = false;
  let idleFullTimer = null;
  let mountSerial = 0;

  const byProduct = () => new Map(entries.map((entry) => [entry.productId, entry]));
  const previewFor = (entry) => entry.frames?.previewPath
    ? { path: normalizeMediaPath(entry.frames.previewPath), count: entry.frames.count }
    : null;
  // Queue every listing's resting pose before any nearby-angle work. The
  // initial board is allowed to reveal once its own posters arrive; the rest
  // of the catalog continues this lightweight first-paint pass behind it.
  const posterLoads = entries.map((entry) =>
    window.Dangle.preloadPreview(previewFor(entry), entry.frameOffset || 0, 1));
  const restPostersReady = Promise.all(posterLoads);

  // Full sheets stay out of the critical path. Once the current board's
  // nearby-angle ring is ready, a quiet connection can warm those sheets one
  // at a time; hover/tap/drag always beats this timer. Data saver, 2G, and
  // reduced-motion visitors keep the deliberate poster-only experience until
  // they explicitly interact.
  const shouldWarmFullSheets = () => {
    const connection = navigator.connection;
    return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType) &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };
  function warmVisibleFullSheets(mountId, nearbyLoads) {
    if (!shouldWarmFullSheets() || !nearbyLoads.length) return;
    void Promise.all([restPostersReady, Promise.all(nearbyLoads)]).then(() => {
      if (mountId !== mountSerial) return;
      const requestNext = (index = 0) => {
        if (mountId !== mountSerial) return;
        activeJellies[index]?.state.requestFull?.();
        if (index + 1 < activeJellies.length) {
          idleFullTimer = window.setTimeout(() => requestNext(index + 1), 900);
        }
      };
      // Let the composed board have a small, calm moment before it starts
      // filling in the expensive continuous rotations behind the scenes.
      idleFullTimer = window.setTimeout(requestNext, 1800);
    });
  }

  // One layout -> the entries it displays. Saved layouts carry productId/node
  // pairs; unavailable earrings drop out and their slot goes empty. The
  // selection board mirrors the cart, whatever board its earrings live on.
  function boardEntries(layout) {
    const catalog = byProduct();
    if (layout.id === SELECTION_LAYOUT_ID) {
      return window.Shop.summary().list
        .map((item) => catalog.get(item.productId)).filter(Boolean)
        .map((entry, index) => ({ ...entry, node: index + 1 }));
    }
    if (!layout.items) return entries;
    return layout.items
      .map((item) => {
        const entry = catalog.get(item.productId);
        return entry ? { ...entry, node: item.node } : null;
      })
      .filter(Boolean);
  }

  function mountLayout(layout) {
    window.clearTimeout(idleFullTimer);
    const mountId = ++mountSerial;
    const visiblePosterLoads = [];
    const nearbyLoads = [];
    for (const { state } of activeJellies) window.Dangle.destroy(state);
    activeJellies = [];
    board.replaceChildren();
    // The hover card lives inside the board's stacking context (the board is
    // z 20 over the purchase panel): a hovered earring at z 100 must rise
    // above the card (the engulf look) while the card stays above every
    // unhovered earring (z 0..9) and the board-level contact shadows (z -1).
    hoverCard = buildEarringHoverCard(board);
    for (const entry of resolveNodes(boardEntries(layout))) {
      if (entry.frames) {
        if (!board) continue;
        const dangle = buildEarringJelly(entry);
        board.append(dangle); // must be in the DOM before Dangle.createJelly reads geometry
        // resolve the sheet against the site root (same as all other media
        // paths) — the page lives under /earrings/ but assets live at /source/
        const frames = { ...entry.frames, sheet: normalizeMediaPath(entry.frames.sheet) };
        const jellyState = window.Dangle.createJelly(dangle, {
          // Base scale is tuned down for the high-res intake sheets; each
          // listing's Studio sizePercent (5% steps) hones it from here.
          // frameOffset is the listing's straight-on frame — the sheet frame
          // the earring rests on when it is not spinning.
          node: entry.node, frames,
          scale: BOARD_BASE_SCALE * ((entry.sizePercent || 100) / 100), length: 140,
          frameOffset: entry.frameOffset || 0,
          previews: previewFor(entry),
          accentColor: paletteFor(entry.colors?.accent).dark,
          onSelect: () => {
            if (!isCompactLayout()) {
              window.Shop.toggle(entry);
              return;
            }
            if (window.Shop.has(entry.productId)) {
              if (lastSelectedProductId !== entry.productId) {
                // A selected-but-inactive earring becomes the active focus;
                // only a second tap on the active one removes it from cart.
                lastSelectedProductId = entry.productId;
                syncSelection();
                return;
              }
              lastSelectedProductId = null;
              window.Shop.toggle(entry);
              return;
            }
            lastSelectedProductId = entry.productId;
            window.Shop.toggle(entry);
          },
          onHover: (state) => {
            if (isCompactLayout()) return;
            if (state) hoverCard?.show(entry, state);
            else hoverCard?.hide();
          },
        });
        // Visible rest posters have first claim on the loader handoff; every
        // other listing still warms behind them at the catalog priority.
        visiblePosterLoads.push(jellyState.preloadPreview(entry.frameOffset || 0, 0));
        // Nearby angles wait behind every listing's rest poster, preserving
        // the all-earrings-first loading order from the brief.
        nearbyLoads.push(jellyState.preloadRange(2, 2));
        activeJellies.push({ entry, state: jellyState });
        continue;
      }
      if (!(entry.mediaTop && entry.mediaBottom)) {
        if (container) container.append(buildEarringSlice(entry));
        continue;
      }
      if (!board) continue;
      const dangle = buildEarringHang(entry, entry.node);
      board.append(dangle); // must be in the DOM before Dangle.create reads geometry
      window.Dangle.create(dangle, { node: entry.node, scale: 0.35, length: 280 });
    }
    syncSelection();
    warmVisibleFullSheets(mountId, nearbyLoads);
    return Promise.all(visiblePosterLoads);
  }

  // The dot strip: one dot per saved layout, plus the auto selection board
  // last, which only exists while the cart is non-empty. It is a viewing /
  // deselecting page for the user's picks, never an authorable layout.
  function dotLayouts() {
    const list = [...layouts];
    if (window.Shop.summary().list.length) {
      list.push({ id: SELECTION_LAYOUT_ID, name: "your picks", order: Number.MAX_SAFE_INTEGER, items: null });
    }
    return list;
  }

  function renderDots() {
    if (!dots) return;
    const list = dotLayouts();
    if (list.length < 2) {
      dots.hidden = true;
      dots.replaceChildren();
      return;
    }
    dots.hidden = false;
    dots.replaceChildren();
    list.forEach((layout, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "board-dot";
      if (layout.id === SELECTION_LAYOUT_ID) dot.classList.add("is-selection");
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-label", layout.name || `board ${index + 1}`);
      dot.title = layout.name || `board ${index + 1}`;
      dot.addEventListener("click", () => switchTo(index));
      dots.append(dot);
    });
  }

  // Slide the current board off (hard ease-in: slow start, fast end;
  // grate + earrings fade out together over the back half), swap the
  // content while it is gone, then slide the next in from the far side
  // (ease-out: fast start, slow end, fading in over the back half). Both
  // legs run --board-switch-time (0.45s, css/style.css); keep the settle
  // guards below in sync with it. The earrings get an inertial shove on
  // each leg (Dangle.switchKick). Direction follows the dot the user
  // moved to.
  const BOARD_SWITCH_MS = 450;
  function switchTo(index) {
    const list = dotLayouts();
    if (switching || index === activeIndex || !list[index]) return;
    switching = true;
    const forward = index > activeIndex;
    const travel = forward ? -1 : 1; // forward content slides left
    board.classList.add("is-switching", forward ? "is-leaving-left" : "is-leaving-right");
    window.Dangle.switchKick(travel);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      board.removeEventListener("animationend", onLeaveEnd);
      activeIndex = index;
      board.classList.remove("is-leaving-left", "is-leaving-right");
      board.classList.add(forward ? "is-entering-right" : "is-entering-left");
      mountLayout(list[index]);
      renderDots();
      window.Dangle.switchKick(travel);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(finishGuard);
        board.removeEventListener("animationend", onEnterEnd);
        board.classList.remove("is-entering-right", "is-entering-left", "is-switching");
        switching = false;
      };
      const finishGuard = setTimeout(finish, BOARD_SWITCH_MS + 60);
      const onEnterEnd = (event) => {
        if (event.target === board && event.animationName.startsWith("board-switch-in")) finish();
      };
      board.addEventListener("animationend", onEnterEnd);
    };
    const guard = setTimeout(settle, BOARD_SWITCH_MS + 60);
    // only the board's own leave animation ends the leg — child events
    // bubble and would swap the content mid-slide
    const onLeaveEnd = (event) => {
      if (event.target === board && event.animationName.startsWith("board-switch-out")) settle();
    };
    board.addEventListener("animationend", onLeaveEnd);
  }

  function syncSelection() {
    const selected = window.Shop.summary().list;
    const selectedIds = new Set(selected.map((item) => item.productId));
    if (!selectedIds.has(lastSelectedProductId)) {
      lastSelectedProductId = selected.at(-1)?.productId || null;
    }
    const focusedProductId = isCompactLayout() ? lastSelectedProductId : null;
    setActiveColor(entries);
    let focusedJelly = null;
    for (const jelly of activeJellies) {
      const { entry, state } = jelly;
      state.setSelected(selectedIds.has(entry.productId));
      state.setMobileFocused?.(entry.productId === focusedProductId);
      if (entry.productId === focusedProductId) focusedJelly = jelly;
    }
    // Mobile has no hover, so the selected active earring owns the same
    // detail card desktop shows on hover. It closes when the cart is empty.
    if (isCompactLayout()) {
      if (focusedJelly) hoverCard?.show(focusedJelly.entry, focusedJelly.state);
      else hoverCard?.hide();
    }
  }

  // The loader is for the first view, not for every product in the catalog:
  // it leaves exactly when this board can appear composed. The catalog-wide
  // first frames keep arriving immediately behind that handoff.
  const initialVisiblePostersReady = mountLayout(layouts[0]);
  renderDots();
  window.addEventListener("resize", syncSelection);
  void initialVisiblePostersReady.then(() => loader.reveal());

  const panel = document.querySelector(".shop-panel");
  if (panel) buildShopPanel(panel);

  // Visual selection and the global UI color both follow cart truth. While
  // the selection board is open it re-mounts so picks appear/disappear live;
  // any other open board just refreshes its outlines. The dots re-render so
  // the selection dot appears and vanishes with the cart.
  document.addEventListener("shop:change", () => {
    const list = dotLayouts();
    if (list[activeIndex]?.id === SELECTION_LAYOUT_ID) {
      mountLayout(list[activeIndex]);
    } else if (activeIndex >= list.length) {
      // the selection board vanished with the cart — fall back to board one
      activeIndex = 0;
      mountLayout(list[0]);
    } else {
      syncSelection();
    }
    renderDots();
  });
}

const SHOW_GRID_NODES = false; // flip to true to debug node alignment

function renderNodeMarkers(board) {
  for (let index = 1; window.Dangle.nodePoint(index); index += 1) {
    const point = window.Dangle.nodePoint(index);
    const marker = document.createElement("div");
    marker.className = "earring-node";
    marker.style.left = `${point.x * 100}%`;
    marker.style.top = `${point.y * 100}%`;
    marker.title = `node ${index}`;
    board.append(marker);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
  void initEarringsPage();
});
