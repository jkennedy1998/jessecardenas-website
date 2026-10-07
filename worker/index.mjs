const encoder = new TextEncoder();
const SESSION_LIFETIME_SECONDS = 30 * 60;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});
const error = (status, message, headers = {}) => json({ error: message }, status, headers);
const nowSeconds = () => Math.floor(Date.now() / 1000);

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== env.SITE_ORIGIN) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type, stripe-signature',
    vary: 'origin',
  };
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request, env))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function parseBasicAuth(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  const separator = atob(header.slice(6)).indexOf(':');
  return separator === -1 ? null : atob(header.slice(6)).slice(separator + 1);
}

async function requireStudioAccess(request, env) {
  const password = parseBasicAuth(request);
  if (!env.STUDIO_PASSWORD || !password || !(await equal(password, env.STUDIO_PASSWORD))) {
    throw new HttpError(401, 'Studio access requires the shared password.');
  }
}

async function stripe(env, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`);
  const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new HttpError(502, body.error?.message || 'Stripe request failed');
  }
  return response.json();
}

const stripeGet = (env, path) => stripe(env, path);
const stripePost = (env, path, body) => stripe(env, path, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
});

function productDetails(product) {
  const price = product.default_price;
  if (!price?.active || !Number.isInteger(price.unit_amount)) return null;
  return {
    productId: product.id,
    title: product.name,
    description: product.description || '',
    materials: product.metadata?.Material || '',
    price: price.unit_amount / 100,
    currency: price.currency,
    priceId: price.id,
    active: product.active,
    image: product.images?.[0] || '',
  };
}

function parseCheckoutItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new HttpError(400, 'Choose between one and ten listings.');
  }
  const productIds = new Set();
  return value.map((item) => {
    const productId = typeof item?.productId === 'string' ? item.productId : '';
    const mode = item?.mode;
    const quantity = Number(item?.quantity);
    if (!productId || productIds.has(productId) || !['single', 'pair'].includes(mode)
      || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'The basket is invalid.');
    }
    productIds.add(productId);
    return { productId, singles: quantity * (mode === 'pair' ? 2 : 1) };
  });
}

async function equal(a, b) {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index += 1) different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return different === 0;
}

async function verifiedStripeEvent(request, secret) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  const parts = signature.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([name]) => name === 't')?.[1];
  const signatures = parts.filter(([name]) => name === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(nowSeconds() - Number(timestamp)) > 300) {
    throw new HttpError(400, 'Invalid Stripe signature.');
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!(await Promise.all(signatures.map((value) => equal(value, expected)))).some(Boolean)) {
    throw new HttpError(400, 'Invalid Stripe signature.');
  }
  return JSON.parse(payload);
}

export class InventoryLock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  listingKey(productId) { return `listing:${productId}`; }
  reservationKey(id) { return `reservation:${id}`; }

  // Expired pending holds flip to released without touching listing stock —
  // quantity was never decremented at reserve time, so there is nothing to
  // give back. Safe to run anywhere; flipping is idempotent.
  async expireReservationsInTxn(txn) {
    const reservations = await txn.list({ prefix: 'reservation:' });
    for (const reservation of reservations.values()) {
      if (reservation.status === 'pending' && reservation.expiresAt <= nowSeconds()) {
        await txn.put(this.reservationKey(reservation.id), { ...reservation, status: 'released' });
      }
    }
  }

  async releaseExpiredReservations() {
    await this.state.storage.transaction(async (txn) => this.expireReservationsInTxn(txn));
  }

  // Count live holds per product from pending reservations. Expired holds
  // must be flipped first (inside the same transaction) or they would still
  // consume availability here.
  async pendingReservedInTxn(txn) {
    const reservations = await txn.list({ prefix: 'reservation:' });
    const reservedByProduct = new Map();
    for (const reservation of reservations.values()) {
      if (reservation.status !== 'pending') continue;
      for (const item of reservation.items) {
        reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) || 0) + item.singles);
      }
    }
    return reservedByProduct;
  }

  async releaseReservation(id) {
    await this.state.storage.transaction(async (txn) => {
      const reservation = await txn.get(this.reservationKey(id));
      if (reservation?.status === 'pending') {
        await txn.put(this.reservationKey(id), { ...reservation, status: 'released' });
      }
    });
  }

  // A hold never decrements stored stock — it only consumes availability
  // (stock minus pending holds) until it expires, is released, or is paid.
  // Stored stock drops exactly once, in markReservationPaid, after Stripe
  // confirms the purchase.
  async reserve(items) {
    const reservation = {
      id: crypto.randomUUID(),
      items,
      status: 'pending',
      expiresAt: nowSeconds() + SESSION_LIFETIME_SECONDS,
      sessionId: null,
    };
    await this.state.storage.transaction(async (txn) => {
      await this.expireReservationsInTxn(txn);
      const reservedByProduct = await this.pendingReservedInTxn(txn);
      for (const item of items) {
        const listing = await txn.get(this.listingKey(item.productId));
        const reserved = reservedByProduct.get(item.productId) || 0;
        if (!listing?.published || listing.quantity - reserved < item.singles) {
          throw new HttpError(409, 'A selected earring is no longer available.');
        }
      }
      await txn.put(this.reservationKey(reservation.id), reservation);
    });
    return reservation;
  }

  async attachCheckoutSession(id, sessionId) {
    await this.state.storage.transaction(async (txn) => {
      const reservation = await txn.get(this.reservationKey(id));
      if (reservation?.status === 'pending') {
        await txn.put(this.reservationKey(id), { ...reservation, sessionId });
      }
    });
  }

  // The single point where stored stock actually drops: Stripe has confirmed
  // the money, so the reservation's units leave inventory permanently.
  async markReservationPaid(id) {
    await this.state.storage.transaction(async (txn) => {
      const reservation = await txn.get(this.reservationKey(id));
      if (reservation?.status !== 'pending') return;
      for (const item of reservation.items) {
        const listing = await txn.get(this.listingKey(item.productId));
        if (listing) await txn.put(this.listingKey(item.productId), {
          ...listing,
          quantity: Math.max(0, listing.quantity - item.singles),
        });
      }
      await txn.put(this.reservationKey(id), { ...reservation, status: 'paid' });
    });
  }

  async stripeProducts(activeOnly = false) {
    const query = activeOnly ? '?active=true&limit=100&expand[]=data.default_price' : '?limit=100&expand[]=data.default_price';
    const result = await stripeGet(this.env, `/v1/products${query}`);
    return result.data || [];
  }

  async catalog() {
    await this.releaseExpiredReservations();
    const products = await this.stripeProducts(true);
    const reservedByProduct = await this.pendingReservedInTxn(this.state.storage);
    const listings = [];
    for (const product of products) {
      const details = productDetails(product);
      const listing = await this.state.storage.get(this.listingKey(product.id));
      if (!details || !listing?.published) continue;
      // Customers see stock minus live holds, so an in-flight checkout makes
      // the unit unavailable without it having been sold yet.
      const available = listing.quantity - (reservedByProduct.get(product.id) || 0);
      if (available < 1) continue;
      listings.push({ ...details, quantity: available, graphicKey: listing.graphicKey });
    }
    return json({ listings }, 200, { 'cache-control': 'no-store' });
  }

  async studioListings() {
    await this.releaseExpiredReservations();
    const [products, reservations] = await Promise.all([
      this.stripeProducts(),
      this.state.storage.list({ prefix: 'reservation:' }),
    ]);
    const reservedByProduct = new Map();
    for (const reservation of reservations.values()) {
      if (reservation.status !== 'pending') continue;
      for (const item of reservation.items) {
        reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) || 0) + item.singles);
      }
    }
    const listings = [];
    for (const product of products) {
      const details = productDetails(product);
      if (!details) continue;
      const listing = await this.state.storage.get(this.listingKey(product.id));
      listings.push({
        ...details,
        quantity: listing?.quantity || 0,
        reserved: reservedByProduct.get(product.id) || 0,
        available: Math.max(0, (listing?.quantity || 0) - (reservedByProduct.get(product.id) || 0)),
        published: listing?.published || false,
        graphicKey: listing?.graphicKey || '',
      });
    }
    return json({ listings });
  }

  async saveStudioListing(request, productId) {
    const input = await request.json().catch(() => null);
    const quantity = Number(input?.quantity);
    const published = input?.published;
    const graphicKey = typeof input?.graphicKey === 'string' ? input.graphicKey.trim() : '';
    if (!Number.isSafeInteger(quantity) || quantity < 0 || typeof published !== 'boolean' || !graphicKey) {
      throw new HttpError(400, 'Stock, graphic, and publish status are required.');
    }
    // No Stripe round-trip here on purpose: a save must be a deterministic
    // local write. A transient Stripe failure used to fail the whole save,
    // which read as "the studio update is finicky". Listings only surface
    // through studioListings for Products Stripe actually returns, so a
    // phantom productId is inert.
    const listing = { productId, quantity, published, graphicKey };
    await this.state.storage.put(this.listingKey(productId), listing);
    return json({ listing });
  }

  async createCheckout(request) {
    await this.releaseExpiredReservations();
    const body = await request.json().catch(() => null);
    const requested = parseCheckoutItems(body?.items);
    const resolved = [];
    for (const item of requested) {
      const product = await stripeGet(this.env, `/v1/products/${encodeURIComponent(item.productId)}?expand[]=default_price`);
      const details = productDetails(product);
      if (!details?.active) throw new HttpError(409, 'A selected earring is no longer available.');
      resolved.push({ ...item, ...details });
    }

    const reservation = await this.reserve(requested);
    try {
      const form = {
        mode: 'payment',
        expires_at: String(reservation.expiresAt),
        success_url: `${this.env.SITE_ORIGIN}/earrings/?checkout=success`,
        cancel_url: `${this.env.SITE_ORIGIN}/earrings/?checkout=cancelled`,
        'metadata[reservation_id]': reservation.id,
      };
      resolved.forEach((item, index) => {
        form[`line_items[${index}][price]`] = item.priceId;
        form[`line_items[${index}][quantity]`] = String(item.singles);
      });
      const session = await stripePost(this.env, '/v1/checkout/sessions', form);
      await this.attachCheckoutSession(reservation.id, session.id);
      return json({ url: session.url });
    } catch (cause) {
      await this.releaseReservation(reservation.id);
      throw cause;
    }
  }

  async receiveStripeWebhook(request) {
    const event = await verifiedStripeEvent(request, this.env.STRIPE_WEBHOOK_SECRET);
    if (await this.state.storage.get(`stripe-event:${event.id}`)) return json({ received: true });
    const session = event.data?.object;
    const reservationId = session?.metadata?.reservation_id;
    if (reservationId) {
      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
        await this.markReservationPaid(reservationId);
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        await this.markReservationPaid(reservationId);
      } else if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) {
        await this.releaseReservation(reservationId);
      }
    }
    await this.state.storage.put(`stripe-event:${event.id}`, true);
    return json({ received: true });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/catalog') return this.catalog();
    if (request.method === 'GET' && url.pathname === '/api/studio/listings') return this.studioListings();
    if (request.method === 'PUT' && url.pathname.startsWith('/api/studio/listings/')) {
      return this.saveStudioListing(request, decodeURIComponent(url.pathname.slice('/api/studio/listings/'.length)));
    }
    if (request.method === 'POST' && url.pathname === '/api/checkout') return this.createCheckout(request);
    if (request.method === 'POST' && url.pathname === '/api/webhooks/stripe') return this.receiveStripeWebhook(request);
    return error(404, 'Not found.');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });
    try {
      const isStudioPage = url.pathname === '/studio' || url.pathname.startsWith('/studio/');
      const isStudioApi = url.pathname.startsWith('/api/studio/');
      if (isStudioPage || isStudioApi) await requireStudioAccess(request, env);
      if (isStudioPage) return fetch(request);
      const handled = request.method === 'GET' && url.pathname === '/api/catalog'
        || request.method === 'POST' && ['/api/checkout', '/api/webhooks/stripe'].includes(url.pathname)
        || isStudioApi;
      const response = handled
        ? await env.INVENTORY_LOCK.get(env.INVENTORY_LOCK.idFromName('jesse-catalog')).fetch(request)
        : error(404, 'Not found.');
      return withCors(response, request, env);
    } catch (cause) {
      console.error(cause);
      const status = cause.status || 500;
      const headers = status === 401 ? { 'www-authenticate': 'Basic realm="Studio"' } : {};
      return withCors(error(status, cause.status ? cause.message : 'The shop is temporarily unavailable.', headers), request, env);
    }
  },
};
