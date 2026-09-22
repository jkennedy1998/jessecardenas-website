// Shared chrome (top bar / bottom bar) + earring slice rendering for
// jessecardenas.com. One horizontal slice per earring entry.
// ROOT is derived from this script's own URL so the site works both opened
// directly from disk (file://) and behind any static server.
const ROOT = new URL("../", document.currentScript.src).pathname;

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

function isVideoFile(file) {
  return /\.(mp4|webm|mov)$/i.test(file);
}

// Jelly path: the whole gif hangs from its top-middle point and is warped
// as a 4-corner quad jiggle on a canvas (js/dangle.js createJelly owns
// physics + play).
function buildEarringJelly(entry) {
  const dangle = document.createElement("div");
  dangle.className = "earring-dangle earring-dangle-jelly";

  const canvas = document.createElement("canvas");
  canvas.className = "earring-jelly";
  // extra transparent margin around the frame so the animated white stroke
  // (js/dangle.js) can grow outside the gif without clipping
  const pad = 10;
  canvas.width = entry.frames.fw + pad * 2;
  canvas.height = entry.frames.fh + pad * 2;
  // the gif's top-middle is the hang point, so keep the FRAME centered on the
  // dangle origin (pivot) and let it extend downward
  canvas.style.left = `${-(entry.frames.fw / 2 + pad)}px`;
  canvas.style.top = `${-pad}px`;

  // hover info card: name + materials, no price (price lives in the
  // purchase UI). js/dangle.js slides it out from behind the photo on hover,
  // left or right depending on which half of the board the piece hangs on.
  const card = document.createElement("div");
  card.className = "earring-hover-card";
  card.style.top = `${entry.frames.fh / 2}px`;
  const cardName = document.createElement("h3");
  cardName.textContent = entry.title || entry.slug;
  const cardMaterials = document.createElement("ul");
  String(entry.materials || "")
    .split(",")
    .map((material) => material.trim())
    .filter(Boolean)
    .forEach((material) => {
      const item = document.createElement("li");
      item.textContent = material;
      cardMaterials.append(item);
    });
  card.append(cardName, cardMaterials);

  dangle.append(card, canvas);
  return dangle;
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
      const selected = window.Shop.has(entry.slug, mode);
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

  function renderPanel() {
    const state = window.Shop.summary();
    document.body.classList.toggle("has-selection", state.list.length > 0);
    list.replaceChildren();
    for (const item of state.list) {
      const row = el("div", "shop-row");
      const head = el("div", "shop-row-head");
      head.append(
        el("span", "shop-name", item.title),
        el("span", "shop-line-price", `$${window.Shop.lineTotal(item)}`),
      );
      const controls = el("div", "shop-row-controls");
      const mode = el("div", "shop-mode");
      for (const modeName of ["single", "pair"]) {
        const button = el("button", "shop-mode-button", modeName);
        button.type = "button";
        button.dataset.active = String(item.mode === modeName);
        button.addEventListener("click", () => window.Shop.setMode(item.slug, modeName));
        mode.append(button);
      }
      const stepper = el("div", "shop-stepper");
      const minus = el("button", "shop-stepper-button", "−");
      minus.type = "button";
      minus.addEventListener("click", () => window.Shop.setQuantity(item.slug, item.quantity - 1));
      const qty = el("span", "shop-qty", String(item.quantity));
      const plus = el("button", "shop-stepper-button", "+");
      plus.type = "button";
      plus.addEventListener("click", () => window.Shop.setQuantity(item.slug, item.quantity + 1));
      stepper.append(minus, qty, plus);
      const stock = el("span", "shop-stock", stockText(item));
      const removeButton = el("button", "shop-remove", "×");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `remove ${item.title}`);
      removeButton.addEventListener("click", () => window.Shop.remove(item.slug));
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

function initEarringsPage() {
  const board = document.querySelector(".earring-board");
  const container = document.querySelector(".slices");
  const entries = window.EARRINGS_PAGE_SOURCE || [];
  if (!entries.length) {
    if (container) container.innerHTML = '<p class="slice-empty">no earrings listed yet — check back soon.</p>';
    return;
  }

  const usedNodes = new Set(
    entries.map((entry) => entry.node).filter((node) => Number.isInteger(node)),
  );
  let autoNode = 0;
  const jellyStates = [];
  entries.forEach((entry) => {
    // frame-sequence entries always hang on the board; split-piece entries
    // use the legacy hang; anything else falls back to a flat slice
    if (entry.frames) {
      if (!board) return;
      // assigned node, else first free node in reading order (a node claimed
      // by the entry itself does not count as taken)
      const taken = (n) => entries.some((other) => other !== entry && other.node === n);
      let nodeIndex = entry.node;
      if (!nodeIndex || taken(nodeIndex)) {
        do { autoNode += 1; } while (taken(autoNode));
        nodeIndex = autoNode;
      }
      const dangle = buildEarringJelly(entry);
      board.append(dangle); // must be in the DOM before Dangle.createJelly reads geometry
      // resolve the sheet against the site root (same as all other media
      // paths) — the page lives under /earrings/ but assets live at /source/
      const frames = { ...entry.frames, sheet: normalizeMediaPath(entry.frames.sheet) };
      const jellyState = window.Dangle.createJelly(dangle, {
        node: nodeIndex, frames, scale: 0.7, length: 140,
        // board click toggles the cart item; the shop:change listener below
        // syncs the visual back from cart truth
        onSelect: () => window.Shop.toggle(entry),
      });
      jellyStates.push({ entry, state: jellyState });
      return;
    }
    if (!(entry.mediaTop && entry.mediaBottom)) {
      if (container) container.append(buildEarringSlice(entry, autoNode));
      return;
    }
    if (board) {
      let nodeIndex = entry.node;
      if (!nodeIndex || usedNodes.has(nodeIndex)) {
        do { autoNode += 1; } while (usedNodes.has(autoNode));
        nodeIndex = autoNode;
        usedNodes.add(nodeIndex);
      }
      const dangle = buildEarringHang(entry, nodeIndex);
      board.append(dangle); // must be in the DOM before Dangle.create reads geometry
      window.Dangle.create(dangle, { node: nodeIndex, scale: 0.35, length: 280 });
    }
  });

  if (board && SHOW_GRID_NODES) renderNodeMarkers(board);

  const panel = document.querySelector(".shop-panel");
  if (panel) buildShopPanel(panel);

  // visual selection follows cart truth (panel remove/mode changes included)
  document.addEventListener("shop:change", () => {
    for (const { entry, state } of jellyStates) {
      state.setSelected(window.Shop.has(entry.slug));
    }
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
  initEarringsPage();
});
