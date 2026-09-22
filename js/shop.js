// Cart + checkout stub. Stock truth lives in entry.md `## quantity` for now;
// atomic reservation, stripe sessions, and sold-out delisting move into the
// cloudflare worker later.
window.SHOP_CONFIG = {
  // Absent locally -> checkout logs the order payload instead of posting.
  checkoutEndpoint: "/api/checkout",
};

window.Shop = (() => {
  // key: "<slug>:<mode>" -> { slug, title, mode, unitPrice }
  const items = new Map();
  const keyFor = (slug, mode) => `${slug}:${mode}`;

  function toggle(entry, mode) {
    const key = keyFor(entry.slug, mode);
    if (items.has(key)) items.delete(key);
    else items.set(key, { slug: entry.slug, title: entry.title, mode, unitPrice: entry.price });
    render();
  }

  function has(slug, mode) {
    return items.has(keyFor(slug, mode));
  }

  function summary() {
    const list = [...items.values()];
    const singles = list.filter((item) => item.mode === "single").length;
    const pairs = list.filter((item) => item.mode === "pair").length;
    const total = list.reduce(
      (sum, item) => sum + item.unitPrice * (item.mode === "pair" ? 2 : 1),
      0,
    );
    return { list, singles, pairs, total };
  }

  function summaryText({ list, singles, pairs, total }) {
    if (!list.length) return "nothing selected yet";
    const parts = [];
    if (singles) parts.push(`${singles} single${singles > 1 ? "s" : ""}`);
    if (pairs) parts.push(`${pairs} pair${pairs > 1 ? "s" : ""}`);
    return `${parts.join(" + ")} — $${total}`;
  }

  function render() {
    const root = document.querySelector(".cart-tracker");
    if (!root) return;
    const state = summary();
    root.querySelector(".cart-summary").textContent = summaryText(state);
    root.querySelector(".cart-checkout").disabled = !state.list.length;
    document.dispatchEvent(new CustomEvent("shop:change"));
  }

  async function checkout() {
    const state = summary();
    if (!state.list.length) return;
    const payload = {
      items: state.list.map(({ slug, mode, unitPrice }) => ({
        slug,
        mode,
        quantity: mode === "pair" ? 2 : 1,
        unitPrice,
      })),
      total: state.total,
    };
    const summaryEl = document.querySelector(".cart-tracker .cart-summary");
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
    summaryEl.textContent = `checkout is stubbed — ${summaryText(state)}`;
  }

  return { toggle, has, render, checkout, summary };
})();

document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".cart-checkout");
  if (button) button.addEventListener("click", () => window.Shop.checkout());
  window.Shop.render();
});
