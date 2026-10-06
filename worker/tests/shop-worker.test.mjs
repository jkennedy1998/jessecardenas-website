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
      transaction: async (callback) => callback({
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, structuredClone(value)),
      }),
    },
  };
}

const product = {
  id: 'prod_purple',
  name: 'Purple lollypop',
  description: 'Glass candy.',
  active: true,
  metadata: { Material: 'glass' },
  default_price: { id: 'price_purple', active: true, unit_amount: 5200, currency: 'usd' },
};

test('Studio publishes Product-ID inventory and checkout reserves pair stock', { concurrency: false }, async () => {
  const { storage, values } = memoryStorage();
  const originalFetch = globalThis.fetch;
  let sessionForm;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/v1/products?')) return new Response(JSON.stringify({ data: [product] }));
    if (target.includes('/v1/products/prod_purple')) return new Response(JSON.stringify(product));
    if (target.endsWith('/v1/checkout/sessions')) {
      sessionForm = init.body;
      return new Response(JSON.stringify({ id: 'cs_purple', url: 'https://checkout.stripe.test/cs_purple' }));
    }
    throw new Error(`unexpected Stripe request: ${target}`);
  };

  try {
    const env = { STRIPE_SECRET_KEY: 'test', SITE_ORIGIN: 'https://jessecardenas.com', STUDIO_PASSWORD: 'let-us-in' };
    const lock = new InventoryLock({ storage }, env);
    await lock.fetch(new Request('https://jessecardenas.com/api/studio/listings/prod_purple', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2, graphicKey: 'purple-lollypop', published: true }),
    }));

    const catalog = await (await lock.fetch(new Request('https://jessecardenas.com/api/catalog'))).json();
    assert.deepEqual(catalog.listings[0], {
      productId: 'prod_purple', title: 'Purple lollypop', description: 'Glass candy.',
      materials: 'glass', price: 52, currency: 'usd', priceId: 'price_purple', active: true,
      quantity: 2, graphicKey: 'purple-lollypop',
    });

    const checkout = await lock.fetch(new Request('https://jessecardenas.com/api/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'prod_purple', mode: 'pair', quantity: 1 }] }),
    }));
    assert.equal(checkout.status, 200);
    assert.equal(sessionForm.get('line_items[0][quantity]'), '2');
    assert.equal(values.get('listing:prod_purple').quantity, 0);

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
