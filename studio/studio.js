// Private Catalog Studio. The Worker gates /studio/ and its API behind a
// shared password (HTTP Basic Auth) known only to Jesse and the operator.
window.Studio = (() => {
  const status = document.querySelector('.studio-status');
  const list = document.querySelector('.studio-list');
  const graphics = window.EARRING_VISUALS || {};

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = isError ? 'true' : 'false';
  };

  const option = (value, label, selected) => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    node.selected = value === selected;
    return node;
  };

  function cardFor(listing) {
    const card = document.createElement('article');
    card.className = 'studio-card';

    const heading = document.createElement('h2');
    heading.textContent = listing.title;
    const detail = document.createElement('p');
    detail.className = 'studio-detail';
    detail.textContent = `${listing.active ? 'active in Stripe' : 'inactive in Stripe'} · ${listing.currency.toUpperCase()} $${listing.price}`;

    const stockLabel = document.createElement('label');
    stockLabel.textContent = 'available individual earrings';
    const stock = document.createElement('input');
    stock.type = 'number';
    stock.min = '0';
    stock.step = '1';
    stock.value = String(listing.quantity);
    stockLabel.append(stock);

    const graphicLabel = document.createElement('label');
    graphicLabel.textContent = 'approved graphic';
    const graphic = document.createElement('select');
    graphic.append(option('', 'choose a prepared graphic', listing.graphicKey));
    for (const [key, visual] of Object.entries(graphics)) {
      graphic.append(option(key, visual.slug, listing.graphicKey));
    }
    graphicLabel.append(graphic);

    const publishLabel = document.createElement('label');
    publishLabel.className = 'studio-check';
    const published = document.createElement('input');
    published.type = 'checkbox';
    published.checked = listing.published;
    publishLabel.append(published, document.createTextNode(' publish on shop'));

    const held = document.createElement('p');
    held.className = 'studio-held';
    held.textContent = listing.reserved ? `${listing.reserved} currently held in checkout` : '';

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'save listing';
    save.addEventListener('click', async () => {
      save.disabled = true;
      setStatus(`saving ${listing.title}…`);
      try {
        const response = await fetch(`/api/studio/listings/${encodeURIComponent(listing.productId)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            quantity: Number(stock.value),
            graphicKey: graphic.value,
            published: published.checked,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not save this listing.');
        setStatus(`${listing.title} saved.`);
      } catch (cause) {
        setStatus(cause.message || 'Could not save this listing.', true);
      } finally {
        save.disabled = false;
      }
    });

    card.append(heading, detail, stockLabel, graphicLabel, publishLabel, held, save);
    return card;
  }

  async function load() {
    try {
      const response = await fetch('/api/studio/listings', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.listings)) {
        throw new Error(result.error || 'Could not load Stripe products.');
      }
      list.replaceChildren(...result.listings.map(cardFor));
      setStatus(result.listings.length ? '' : 'No Stripe Products yet.');
    } catch (cause) {
      setStatus(cause.message || 'Could not load Studio.', true);
    }
  }

  return { load };
})();

void window.Studio.load();
