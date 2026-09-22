// Cart + checkout. Selected earrings live here; the shop panel
// (js/components.js) renders them. Stock truth stays in entry.md `## quantity`
// (maxSingles); a pair consumes two singles — this vendor sells pieces that
// can be worn asymmetrically, so singles and pairs both exist.
// Atomic reservation, stripe sessions, and sold-out delisting move into the
// cloudflare worker later.
window.SHOP_CONFIG = {
  // Absent locally -> checkout logs the order payload instead of posting.
  checkoutEndpoint: "/api/checkout",
};

window.Shop = (() => {
  // slug -> { slug, title, unitPrice, mode, quantity, maxSingles }
  // mode: "single" | "pair"; quantity counts units of that mode; a pair
  // consumes 2 singles of stock. unitPrice is per single.
  const items = new Map();

  const maxFor = (item) => item.mode === "pair"
    ? Math.floor(item.maxSingles / 2)
    : item.maxSingles;

  const lineTotal = (item) =>
    item.unitPrice * item.quantity * (item.mode === "pair" ? 2 : 1);

  function toggle(entry, mode = "single") {
    if (items.has(entry.slug)) {
      items.delete(entry.slug);
    } else {
      items.set(entry.slug, {
        slug: entry.slug,
        title: entry.title || entry.slug,
        unitPrice: entry.price,
        mode,
        quantity: 1,
        maxSingles: entry.quantity ?? 0,
      });
    }
    render();
  }

  function remove(slug) {
    items.delete(slug);
    render();
  }

  function has(slug, mode) {
    if (!items.has(slug)) return false;
    return !mode || items.get(slug).mode === mode;
  }

  function setMode(slug, mode) {
    const item = items.get(slug);
    if (!item) return;
    item.mode = mode;
    item.quantity = Math.min(item.quantity, maxFor(item)) || 1;
    render();
  }

  function setQuantity(slug, quantity) {
    const item = items.get(slug);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(Math.round(quantity), maxFor(item)));
    render();
  }

  function summary() {
    const list = [...items.values()];
    return {
      list,
      total: list.reduce((sum, item) => sum + lineTotal(item), 0),
    };
  }

  function render() {
    document.dispatchEvent(new CustomEvent("shop:change"));
  }

  async function checkout() {
    const state = summary();
    if (!state.list.length) return;
    const payload = {
      items: state.list.map((item) => ({
        slug: item.slug,
        mode: item.mode,
        quantity: item.quantity,
        singles: item.quantity * (item.mode === "pair" ? 2 : 1),
        unitPrice: item.unitPrice,
      })),
      total: state.total,
    };
    try {
      const response = await fetch(window.SHOP_CONFIG.checkoutEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("[shop] checkout response", response.status, payload);
    } catch {
      console.log("[shop] stub checkout payload", payload);
    }
  }

  document.addEventListener("DOMContentLoaded", render);

  return { toggle, remove, has, setMode, setQuantity, maxFor, lineTotal, summary, checkout };
})();
