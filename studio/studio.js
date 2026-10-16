// Private Catalog Studio. The Worker gates /studio/ and its API behind a
// shared password (HTTP Basic Auth) known only to Jesse and the operator.
window.Studio = (() => {
  const status = document.querySelector('.studio-status');
  const list = document.querySelector('.studio-list');
  const graphics = window.EARRING_VISUALS || {};
  const sheetCache = new Map();

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

  // Draws one sheet frame (the straight-on preview) into a canvas the card
  // shows next to the Stripe image, so Jesse can see exactly which frame
  // each offset value means before saving. Sheet paths in entries.js resolve
  // against the site root; the studio page lives one level down.
  function drawFramePreview(visual, offset, canvas) {
    const frames = visual?.frames;
    if (!frames) {
      canvas.hidden = true;
      return;
    }
    canvas.hidden = false;
    const url = new URL(`../${frames.sheet}`, document.location.href).href;
    let image = sheetCache.get(url);
    if (!image) {
      image = new Image();
      image.src = url;
      sheetCache.set(url, image);
    }
    const paint = () => {
      const width = canvas.width;
      const height = Math.round(width * frames.fh / frames.fw);
      canvas.height = height;
      const index = ((offset % frames.count) + frames.count) % frames.count;
      canvas.getContext('2d').drawImage(image,
        (index % frames.cols) * frames.fw, Math.floor(index / frames.cols) * frames.fh,
        frames.fw, frames.fh, 0, 0, width, height);
    };
    if (image.complete && image.naturalWidth) paint();
    else image.addEventListener('load', paint, { once: true });
  }

  function cardFor(listing) {
    const card = document.createElement('article');
    card.className = 'studio-card';

    const heading = document.createElement('h2');
    heading.textContent = listing.title;
    const detail = document.createElement('p');
    detail.className = 'studio-detail';
    detail.textContent = `${listing.active ? 'active in Stripe' : 'inactive in Stripe'} · ${listing.currency.toUpperCase()} $${listing.price}`;

    const thumb = document.createElement('img');
    thumb.className = 'studio-thumb';
    if (listing.image) {
      thumb.src = listing.image;
      thumb.alt = listing.title;
      thumb.loading = 'lazy';
    } else {
      thumb.hidden = true;
    }

    const stockLabel = document.createElement('label');
    stockLabel.textContent = 'total individual earrings (holds come out after payment)';
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

    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'size on board (5% steps)';
    const sizeRow = document.createElement('div');
    sizeRow.className = 'studio-size';
    let sizePercent = listing.sizePercent || 100;
    const sizeReadout = document.createElement('span');
    sizeReadout.textContent = `${sizePercent}%`;
    const sizeButton = (delta) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = delta > 0 ? '+5%' : '−5%';
      button.addEventListener('click', () => {
        sizePercent = Math.min(200, Math.max(50, sizePercent + delta));
        sizeReadout.textContent = `${sizePercent}%`;
      });
      return button;
    };
    sizeRow.append(sizeButton(-5), sizeReadout, sizeButton(5));
    sizeLabel.append(sizeRow);

    // Straight-on frame: which sheet frame the earring rests on when it is
    // not spinning. Sheets hang each earring at a different rotation, so
    // Jesse offsets the rest frame per earring the same way size is honed.
    // The preview canvas always shows the current graphic's frame 1 with the
    // offset applied — the exact frame the public board rests on.
    const framePreview = document.createElement('canvas');
    framePreview.className = 'studio-frame-preview';
    framePreview.width = 96;
    let frameOffset = listing.frameOffset || 0;
    const framesFor = () => graphics[graphic.value]?.frames || null;
    const frameLabel = document.createElement('label');
    frameLabel.textContent = 'straight-on frame';
    const frameRow = document.createElement('div');
    frameRow.className = 'studio-size';
    const frameReadout = document.createElement('span');
    const syncFrame = () => {
      const count = framesFor()?.count || 1;
      const shown = ((frameOffset % count) + count) % count;
      frameReadout.textContent = `${shown + 1}/${count}`;
      drawFramePreview(graphics[graphic.value], shown, framePreview);
    };
    const frameButton = (delta) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = delta > 0 ? '+1' : '−1';
      button.addEventListener('click', () => {
        frameOffset = Math.max(0, frameOffset + delta);
        syncFrame();
      });
      return button;
    };
    frameRow.append(frameButton(-1), frameReadout, frameButton(1));
    frameLabel.append(frameRow);
    graphic.addEventListener('change', syncFrame);
    syncFrame();

    const publishLabel = document.createElement('label');
    publishLabel.className = 'studio-check';
    const published = document.createElement('input');
    published.type = 'checkbox';
    published.checked = listing.published;
    publishLabel.append(published, document.createTextNode(' publish on shop'));

    const held = document.createElement('p');
    held.className = 'studio-held';
    const heldText = (data) => {
      const bits = [];
      if (data.reserved) bits.push(`${data.reserved} currently held in checkout`);
      bits.push(`${data.available ?? data.quantity} available now`);
      return bits.join(' · ');
    };
    held.textContent = heldText(listing);

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
            sizePercent,
            frameOffset,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not save this listing.');
        setStatus(`${listing.title} saved.`);
        // Re-pull canonical state so the form shows what the Worker stored
        // (holds, availability) instead of trusting the typed values.
        void load();
      } catch (cause) {
        setStatus(cause.message || 'Could not save this listing.', true);
      } finally {
        save.disabled = false;
      }
    });

    const previewRow = document.createElement('div');
    previewRow.className = 'studio-previews';
    previewRow.append(thumb, framePreview);

    card.append(heading, previewRow, detail, stockLabel, graphicLabel, sizeLabel,
      frameLabel, publishLabel, held, save);
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
