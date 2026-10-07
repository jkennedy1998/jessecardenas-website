// Cart + checkout. The Worker supplies catalog facts from Stripe; this client
// only holds the customer's short-lived selection. A pair consumes two of the
// product's individual units.
window.SHOP_CONFIG = {
  catalogEndpoint: "/api/catalog",
  checkoutEndpoint: "/api/checkout",
};

window.Shop = (() => {
  // visual slug -> { productId, slug, title, unitPrice, mode, quantity, maxSingles }
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
        productId: entry.productId,
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
    // `|| 1` here would silently force quantity back up to 1 even when this
    // mode has zero real stock (maxFor 0) — looking like a valid pair pick
    // when none exist. The UI disables that option (see shop panel), but
    // keep the floor honest regardless of how setMode gets called.
    const limit = maxFor(item);
    item.quantity = limit > 0 ? Math.min(item.quantity, limit) : 0;
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
        productId: item.productId,
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
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not start.");
      window.location.assign(result.url);
    } catch (cause) {
      window.alert(cause.message || "Checkout could not start.");
    }
  }

  document.addEventListener("DOMContentLoaded", render);

  return { toggle, remove, has, setMode, setQuantity, maxFor, lineTotal, summary, checkout };
})();
