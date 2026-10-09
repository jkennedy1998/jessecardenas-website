import assert from 'node:assert/strict';
import test from 'node:test';
import app, { InventoryLock } from '../index.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, structuredClone(value)),
      list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix))),
      delete: async (key) => values.delete(key),
      transaction: async (callback) => callback({
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, structuredClone(value)),
        list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix))),
      }),
    },
  };
}

const reservationId = (values) => [...values.keys()]
  .filter((key) => key.startsWith('reservation:'))
  .map((key) => values.get(key))
  .find((reservation) => reservation.status === 'pending')?.id;

test('board layouts: public read, studio CRUD, validation', { concurrency: false }, async () => {
  const { storage, values } = memoryStorage();
  const env = { STRIPE_SECRET_KEY: 'test', SITE_ORIGIN: 'https://jessecardenas.com', STUDIO_PASSWORD: 'pw' };
  const lock = new InventoryLock({ storage }, env);
  const req = (path, init = {}) => lock.fetch(new Request(`https://jessecardenas.com${path}`, {
    headers: { 'content-type': 'application/json' }, ...init,
  }));

  // Public read with no layouts yet — no auth needed for /api/layouts.
  const empty = await (await req('/api/layouts')).json();
  assert.deepEqual(empty.layouts, []);

  const created = await (await req('/api/studio/layouts', {
    method: 'POST', body: JSON.stringify({ name: 'front wall' }),
  })).json();
  assert.equal(created.layout.name, 'front wall');
  assert.deepEqual(created.layout.items, []);
  const id = created.layout.id;

  const saved = await (await req(`/api/studio/layouts/${id}`, {
    method: 'PUT', body: JSON.stringify({ name: 'front wall', items: [
      { productId: 'prod_purple', node: 12 },
    ] }),
  })).json();
  assert.deepEqual(saved.layout.items, [{ productId: 'prod_purple', node: 12 }]);

  const second = await (await req('/api/studio/layouts', {
    method: 'POST', body: JSON.stringify({ name: 'back wall' }),
  })).json();
  const publicList = await (await req('/api/layouts')).json();
  assert.deepEqual(publicList.layouts.map((layout) => layout.name), ['front wall', 'back wall']);
  assert.ok(second.layout.order > created.layout.order);

  // Structural validation: bad node, duplicate node, duplicate product.
  // Routed through the app wrapper so HttpError maps to a real status.
  const workerEnv = {
    ...env,
    INVENTORY_LOCK: { idFromName: () => 'catalog', get: () => ({ fetch: (request) => lock.fetch(request) }) },
  };
  const studioReq = (path, init = {}) => app.fetch(new Request(`https://jessecardenas.com${path}`, {
    headers: { 'content-type': 'application/json', authorization: `Basic ${btoa('jesse:pw')}` }, ...init,
  }), workerEnv);
  for (const items of [
    [{ productId: 'a', node: 0 }],
    [{ productId: 'a', node: 91 }],
    [{ productId: 'a', node: 3 }, { productId: 'b', node: 3 }],
    [{ productId: 'a', node: 3 }, { productId: 'a', node: 4 }],
    [{ productId: 'a' }],
    'nope',
  ]) {
    const bad = await studioReq(`/api/studio/layouts/${id}`, {
      method: 'PUT', body: JSON.stringify({ name: 'front wall', items }),
    });
    assert.equal(bad.status, 400, `expected 400 for ${JSON.stringify(items)}`);
  }
  assert.equal((await studioReq(`/api/studio/layouts/${id}`, {
    method: 'PUT', body: JSON.stringify({ name: '' }),
  })).status, 400);
  assert.equal((await studioReq('/api/studio/layouts/missing', {
    method: 'PUT', body: JSON.stringify({ name: 'x', items: [] }),
  })).status, 404);
  // /api/layouts stays public while studio layout CRUD stays gated.
  assert.equal((await app.fetch(new Request('https://jessecardenas.com/api/layouts'), workerEnv)).status, 200);
  assert.equal((await app.fetch(new Request('https://jessecardenas.com/api/studio/layouts', {
    headers: { authorization: `Basic ${btoa('jesse:pw')}` },
  }), workerEnv)).status, 200);
  const originalError = console.error;
  console.error = () => {};
  const denied = await app.fetch(new Request('https://jessecardenas.com/api/studio/layouts'), workerEnv);
  console.error = originalError;
  assert.equal(denied.status, 401);

  const deleted = await (await studioReq(`/api/studio/layouts/${id}`, { method: 'DELETE' })).json();
  assert.equal(deleted.deleted, id);
  assert.equal((await studioReq(`/api/studio/layouts/${id}`, { method: 'DELETE' })).status, 404);
  const after = await (await req('/api/layouts')).json();
  assert.deepEqual(after.layouts.map((layout) => layout.name), ['back wall']);
});

const product = {
  id: 'prod_purple',
  name: 'Purple lollypop',
  description: 'Glass candy.',
  active: true,
  metadata: { Material: 'glass' },
  default_price: { id: 'price_purple', active: true, unit_amount: 5200, currency: 'usd' },
};

test('Studio publishes Product-ID inventory; checkout holds, payment decrements', { concurrency: false }, async () => {
  const { storage, values } = memoryStorage();
  const originalFetch = globalThis.fetch;
  let sessionForm;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/v1/products?')) return new Response(JSON.stringify({ data: [product] }));
    if (target.includes('/v1/products/prod_purple')) return new Response(JSON.stringify(product));
    if (target.endsWith('/v1/checkout/sessions')) {
      sessionForm = new URLSearchParams(init.body);
      return new Response(JSON.stringify({ id: 'cs_purple', url: 'https://checkout.stripe.test/cs_purple' }));
    }
    throw new Error(`unexpected Stripe request: ${target}`);
  };

  try {
    const env = { STRIPE_SECRET_KEY: 'test', SITE_ORIGIN: 'https://jessecardenas.com', STUDIO_PASSWORD: 'let-us-in' };
    const lock = new InventoryLock({ storage }, env);
    const saved = await (await lock.fetch(new Request('https://jessecardenas.com/api/studio/listings/prod_purple', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2, graphicKey: 'purple-lollypop', published: true }),
    }))).json();
    // Saving is a pure local write: no Stripe call can fail it.
    assert.equal(saved.listing.quantity, 2);

    const catalog = await (await lock.fetch(new Request('https://jessecardenas.com/api/catalog'))).json();
    assert.deepEqual(catalog.listings[0], {
      productId: 'prod_purple', title: 'Purple lollypop', description: 'Glass candy.',
      materials: 'glass', price: 52, currency: 'usd', priceId: 'price_purple', active: true,
      image: '', quantity: 2, graphicKey: 'purple-lollypop',
    });

    const checkout = await lock.fetch(new Request('https://jessecardenas.com/api/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'prod_purple', mode: 'pair', quantity: 1 }] }),
    }));
    assert.equal(checkout.status, 200);
    assert.equal(sessionForm.get('line_items[0][quantity]'), '2');
    // The hold consumes availability but stored stock does not drop yet.
    assert.equal(values.get('listing:prod_purple').quantity, 2);
    const held = await (await lock.fetch(new Request('https://jessecardenas.com/api/catalog'))).json();
    assert.deepEqual(held.listings, []);

    const id = reservationId(values);
    assert.ok(id, 'checkout left a pending reservation');
    await lock.markReservationPaid(id);
    // A paid pair of 2 out of stock 2 leaves zero, so the listing drops out
    // of the customer catalog entirely.
    assert.equal(values.get('listing:prod_purple').quantity, 0);
    const paid = await (await lock.fetch(new Request('https://jessecardenas.com/api/catalog'))).json();
    assert.deepEqual(paid.listings, []);

    const workerEnv = {
      ...env,
      INVENTORY_LOCK: { idFromName: () => 'catalog', get: () => ({ fetch: (request) => lock.fetch(request) }) },
    };
    const allowed = await app.fetch(new Request('https://jessecardenas.com/api/studio/listings', {
      headers: { authorization: `Basic ${btoa('jesse:let-us-in')}` },
    }), workerEnv);
    const originalError = console.error;
    console.error = () => {};
    const denied = await app.fetch(new Request('https://jessecardenas.com/api/studio/listings'), workerEnv);
    console.error = originalError;
    assert.equal(allowed.status, 200);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('www-authenticate'), 'Basic realm="Studio"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expired holds release without touching stock and stop consuming availability', { concurrency: false }, async () => {
  const { storage, values } = memoryStorage();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [product] }));
  try {
    const env = { STRIPE_SECRET_KEY: 'test', SITE_ORIGIN: 'https://jessecardenas.com', STUDIO_PASSWORD: 'pw' };
    const lock = new InventoryLock({ storage }, env);
    await lock.fetch(new Request('https://jessecardenas.com/api/studio/listings/prod_purple', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2, graphicKey: 'purple-lollypop', published: true }),
    }));
    await lock.reserve([{ productId: 'prod_purple', singles: 2 }]);
    // Expire the hold in place, then let catalog release it.
    const [, reservation] = [...values].find(([key]) => key.startsWith('reservation:'));
    reservation.expiresAt = Math.floor(Date.now() / 1000) - 1;
    const catalog = await (await lock.fetch(new Request('https://jessecardenas.com/api/catalog'))).json();
    assert.equal(catalog.listings[0].quantity, 2);
    assert.equal(values.get('listing:prod_purple').quantity, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a hold makes later checkouts for the same unit unavailable', { concurrency: false }, async () => {
  const { storage } = memoryStorage();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/v1/products?')) return new Response(JSON.stringify({ data: [product] }));
    if (target.includes('/v1/products/prod_purple')) return new Response(JSON.stringify(product));
    throw new Error(`unexpected Stripe request: ${target}`);
  };
  try {
    const env = { STRIPE_SECRET_KEY: 'test', SITE_ORIGIN: 'https://jessecardenas.com', STUDIO_PASSWORD: 'pw' };
    const lock = new InventoryLock({ storage }, env);
    await lock.fetch(new Request('https://jessecardenas.com/api/studio/listings/prod_purple', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2, graphicKey: 'purple-lollypop', published: true }),
    }));
    await lock.reserve([{ productId: 'prod_purple', singles: 2 }]);
    // The second checkout for the same units is refused; the direct DO call
    // surfaces the HttpError instead of the outer wrapper's 409 response.
    await assert.rejects(
      () => lock.fetch(new Request('https://jessecardenas.com/api/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ productId: 'prod_purple', mode: 'single', quantity: 1 }] }),
      })),
      (cause) => cause.status === 409,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
