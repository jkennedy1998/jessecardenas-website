// Board layout authoring for Catalog Studio. Lives below the listings
// section on the same page. Jesse picks a layout (dots), drags catalog
// earrings onto the grate replica, and saves. Dragging a placed earring off
// the board removes it from the layout. The picker only offers earrings with
// availability >= 1 — the same visibility rule as the public board — and
// shows the Stripe-derived PNG thumbnails. Grid math (nodePoint /
// nearestNode) is reused from js/dangle.js so the editor and the public
// board can never disagree about where nodes are.
window.StudioLayouts = (() => {
  const root = document.querySelector(".layout-editor");
  if (!root) return null;

  const dotsEl = root.querySelector(".layout-dots");
  const board = root.querySelector(".layout-board");
  const nameInput = root.querySelector(".layout-name");
  const statusEl = root.querySelector(".layout-status");
  const pickerButton = root.querySelector(".layout-picker-button");
  const pickerPanel = root.querySelector(".layout-picker-panel");
  const saveButton = root.querySelector(".layout-save");

  const NODE_PX = 44; // placed earring thumbnail size, CSS px
  let listings = []; // studio listings from the Worker
  let layouts = []; // saved layouts, ordered
  let buffer = null; // { id, name, items: [{ productId, node }] }
  let index = 0;

  const setStatus = (message, isError = false) => {
    statusEl.textContent = message;
    statusEl.dataset.error = isError ? "true" : "false";
  };

  const availableListings = () => listings.filter((listing) => listing.available >= 1);
  const listingFor = (productId) => listings.find((listing) => listing.productId === productId);

  // First grid node not already claimed in the buffer, in reading order.
  function firstFreeNode() {
    const taken = new Set(buffer.items.map((item) => item.node));
    for (let node = 1; window.Dangle.nodePoint(node); node += 1) {
      if (!taken.has(node)) return node;
    }
    return null;
  }

  // Nearest free node to a fractional board point, skipping nodes held by
  // other placements (the caller's own node is passable via skip).
  function nearestFreeNode(x, y, skip = null) {
    const taken = new Set(buffer.items.filter((i) => i.productId !== skip).map((i) => i.node));
    let best = null;
    let bestDist = Infinity;
    for (let node = 1; window.Dangle.nodePoint(node); node += 1) {
      if (taken.has(node)) continue;
      const point = window.Dangle.nodePoint(node);
      const dist = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (dist < bestDist) { best = node; bestDist = dist; }
    }
    return best;
  }

  function pointFor(node) {
    return window.Dangle.nodePoint(node) || { x: 0.5, y: 0.3 };
  }

  function addEarring(productId) {
    if (!buffer) return;
    if (buffer.items.some((item) => item.productId === productId)) {
      setStatus("that earring is already on this board.");
      return;
    }
    const node = firstFreeNode();
    if (node === null) { setStatus("the board is full."); return; }
    buffer.items.push({ productId, node });
    closePicker();
    renderBoard();
  }

  // Drag one placed earring: pointer-follow while held, snap to the nearest
  // free node on release, and drop off-board removes it from the layout.
  function makePlaced(item, img) {
    img.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      img.setPointerCapture(event.pointerId);
      img.classList.add("is-dragging");
      const move = (moveEvent) => {
        const rect = board.getBoundingClientRect();
        const x = (moveEvent.clientX - rect.left) / rect.width;
        const y = (moveEvent.clientY - rect.top) / rect.height;
        img.style.left = `${x * 100}%`;
        img.style.top = `${y * 100}%`;
        img.dataset.offBoard = String(x < 0 || x > 1 || y < 0 || y > 1);
      };
      const drop = (upEvent) => {
        img.releasePointerCapture(upEvent.pointerId);
        img.removeEventListener("pointermove", move);
        img.removeEventListener("pointerup", drop);
        img.removeEventListener("pointercancel", drop);
        img.classList.remove("is-dragging");
        const rect = board.getBoundingClientRect();
        const x = (upEvent.clientX - rect.left) / rect.width;
        const y = (upEvent.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) {
          buffer.items = buffer.items.filter((other) => other.productId !== item.productId);
          setStatus("removed from this board (save to keep it).");
        } else {
          const node = nearestFreeNode(x, y, item.productId);
          if (node === null) { setStatus("the board is full."); return; }
          item.node = node;
        }
        renderBoard();
      };
      img.addEventListener("pointermove", move);
      img.addEventListener("pointerup", drop);
      img.addEventListener("pointercancel", drop);
    });
  }

  function renderBoard() {
    board.replaceChildren();
    if (!buffer) return;
    for (const item of buffer.items) {
      const listing = listingFor(item.productId);
      const point = pointFor(item.node);
      const img = document.createElement("img");
      img.className = "layout-placed";
      if (listing?.image) img.src = listing.image;
      img.alt = listing?.title || item.productId;
      img.title = listing?.title || item.productId;
      img.draggable = false;
      img.style.left = `${point.x * 100}%`;
      img.style.top = `${point.y * 100}%`;
      makePlaced(item, img);
      board.append(img);
    }
  }

  function renderDots() {
    dotsEl.replaceChildren();
    layouts.forEach((layout, dotIndex) => {
      const slot = document.createElement("div");
      slot.className = "layout-dot-slot";
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "board-dot";
      dot.classList.toggle("is-active", dotIndex === index);
      dot.setAttribute("aria-label", `edit ${layout.name}`);
      dot.title = layout.name;
      dot.addEventListener("click", () => select(dotIndex));
      slot.append(dot);
      if (dotIndex === index && buffer) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "layout-dot-delete";
        remove.textContent = "✕";
        remove.title = `delete ${layout.name}`;
        remove.setAttribute("aria-label", `delete ${layout.name}`);
        remove.addEventListener("click", deleteActive);
        slot.append(remove);
      }
      dotsEl.append(slot);
    });
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "layout-dot-plus";
    plus.textContent = "+";
    plus.title = "new board";
    plus.setAttribute("aria-label", "new board");
    plus.addEventListener("click", createLayout);
    dotsEl.append(plus);
  }

  function renderPicker() {
    pickerPanel.replaceChildren();
    const options = availableListings();
    if (!options.length) {
      const empty = document.createElement("p");
      empty.className = "layout-picker-empty";
      empty.textContent = "no earrings with stock — add stock in the listings above.";
      pickerPanel.append(empty);
    }
    for (const listing of options) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "layout-picker-row";
      const thumb = document.createElement("img");
      if (listing.image) thumb.src = listing.image;
      thumb.alt = "";
      const label = document.createElement("span");
      label.textContent = listing.title;
      row.append(thumb, label);
      row.addEventListener("click", () => addEarring(listing.productId));
      pickerPanel.append(row);
    }
    pickerButton.disabled = !options.length;
  }

  const closePicker = () => { pickerPanel.hidden = true; };

  pickerButton.addEventListener("click", () => {
    pickerPanel.hidden = !pickerPanel.hidden;
  });

  // The panel must never linger: any press outside the picker control closes
  // it (pointerdown, so it is gone before the click lands on save/the board),
  // and Escape closes it from anywhere.
  const pickerWrap = root.querySelector(".layout-picker");
  document.addEventListener("pointerdown", (event) => {
    if (!pickerPanel.hidden && !pickerWrap.contains(event.target)) closePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePicker();
  });

  function render() {
    nameInput.value = buffer?.name ?? "";
    renderDots();
    renderBoard();
    renderPicker();
  }

  function select(dotIndex) {
    index = dotIndex;
    const layout = layouts[dotIndex];
    buffer = { id: layout.id, name: layout.name, items: layout.items.map((item) => ({ ...item })) };
    render();
  }

  async function createLayout() {
    try {
      const response = await fetch("/api/studio/layouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `board ${layouts.length + 1}` }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not create the board.");
      layouts.push(result.layout);
      select(layouts.length - 1);
      setStatus(`created ${result.layout.name} (empty).`);
    } catch (cause) {
      setStatus(cause.message || "Could not create the board.", true);
    }
  }

  async function deleteActive() {
    if (!buffer || !confirm(`delete board "${buffer.name}"?`)) return;
    try {
      const response = await fetch(`/api/studio/layouts/${encodeURIComponent(buffer.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not delete the board.");
      const deleted = buffer.name;
      await load();
      setStatus(`deleted ${deleted}.`);
    } catch (cause) {
      setStatus(cause.message || "Could not delete the board.", true);
    }
  }

  async function save() {
    if (!buffer) return;
    const name = nameInput.value.trim();
    if (!name) { setStatus("give the board a name.", true); return; }
    saveButton.disabled = true;
    try {
      const response = await fetch(`/api/studio/layouts/${encodeURIComponent(buffer.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, items: buffer.items }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the board.");
      layouts[index] = result.layout;
      buffer = { id: result.layout.id, name: result.layout.name, items: result.layout.items.map((item) => ({ ...item })) };
      setStatus(`${name} saved — it is live on the shop board now.`);
      render();
    } catch (cause) {
      setStatus(cause.message || "Could not save the board.", true);
    } finally {
      saveButton.disabled = false;
    }
  }

  saveButton.addEventListener("click", save);
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") save();
  });

  async function load() {
    try {
      const [listingsResponse, layoutsResponse] = await Promise.all([
        fetch("/api/studio/listings", { cache: "no-store" }),
        fetch("/api/studio/layouts", { cache: "no-store" }),
      ]);
      const listingsResult = await listingsResponse.json().catch(() => ({}));
      const layoutsResult = await layoutsResponse.json().catch(() => ({}));
      if (!listingsResponse.ok || !Array.isArray(listingsResult.listings)) {
        throw new Error(listingsResult.error || "Could not load Stripe products.");
      }
      if (!layoutsResponse.ok || !Array.isArray(layoutsResult.layouts)) {
        throw new Error(layoutsResult.error || "Could not load board layouts.");
      }
      listings = listingsResult.listings;
      layouts = layoutsResult.layouts;
      root.hidden = false;
      index = layouts.length ? Math.min(index, layouts.length - 1) : 0;
      if (layouts.length) select(index);
      else { buffer = null; render(); }
      setStatus(layouts.length ? "" : "no boards yet — press + to create the first one.");
    } catch (cause) {
      setStatus(cause.message || "Could not load board layouts.", true);
    }
  }

  return { load };
})();

void window.StudioLayouts?.load?.();
