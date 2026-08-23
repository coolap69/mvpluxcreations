const allowedOrigins = new Set([
  'https://mvpluxcreations.com',
  'https://www.mvpluxcreations.com',
  'http://localhost:3000',
  'http://localhost:4173'
]);
const bucket = 'custom-order-references';
const recentRequests = new Map<string, number[]>();
const allowedTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

function responseHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://mvpluxcreations.com',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...responseHeaders(request), 'Content-Type': 'application/json' } });
}

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('The secure order service is not configured.');
  return value;
}

function clean(value: FormDataEntryValue | null, maximum: number) {
  return String(value || '').trim().slice(0, maximum);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestKey(request: Request, email: string) {
  return `${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'}:${email.toLowerCase()}`;
}

function rateLimit(key: string) {
  const now = Date.now();
  const active = (recentRequests.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (active.length >= 5) throw new Error('Too many custom-order requests. Please wait before trying again.');
  recentRequests.set(key, [...active, now]);
}

async function uploadReference(file: File, path: string, url: string, serviceKey: string) {
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });
  if (!response.ok) throw new Error('A reference image could not be stored securely.');
}

async function removeReferences(paths: string[], url: string, serviceKey: string) {
  if (!paths.length) return;
  await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths })
  }).catch(() => {});
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins.has(origin)) return json(request, { error: 'This website origin is not allowed.' }, 403);

  const uploaded: string[] = [];
  let storageUrl = '';
  let storageServiceKey = '';
  try {
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > 31_000_000) return json(request, { error: 'The custom-order request is too large.' }, 413);
    const form = await request.formData();
    const name = clean(form.get('name'), 120);
    const email = clean(form.get('email'), 200).toLowerCase();
    const phone = clean(form.get('phone'), 40);
    const description = clean(form.get('description'), 3000);
    const contactPreference = clean(form.get('contactPreference'), 20) || 'email';
    const desiredHeight = Number(clean(form.get('desiredHeight'), 6));
    const files = form.getAll('referenceImages').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (!name || !validEmail(email) || !description) return json(request, { error: 'Name, a valid email, and a design description are required.' }, 400);
    if (!Number.isFinite(desiredHeight) || desiredHeight < 24 || desiredHeight > 120) return json(request, { error: 'Desired height must be between 24 and 120 inches.' }, 400);
    if (!files.length || files.length > 5) return json(request, { error: 'Choose between one and five reference images.' }, 400);
    for (const file of files) {
      if (!allowedTypes.has(file.type) || file.size > 6_000_000) return json(request, { error: 'Each reference must be PNG, JPG, or WebP and no larger than 6 MB.' }, 400);
    }
    rateLimit(requestKey(request, email));

    const url = required('SUPABASE_URL').replace(/\/$/, '');
    const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
    storageUrl = url;
    storageServiceKey = serviceKey;
    const requestId = crypto.randomUUID();
    const orderNumber = `CUSTOM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${requestId.slice(0, 8).toUpperCase()}`;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${new Date().getUTCFullYear()}/${requestId}/${String(index + 1).padStart(2, '0')}.${allowedTypes.get(file.type)}`;
      await uploadReference(file, path, url, serviceKey);
      uploaded.push(path);
    }

    const item = {
      type: 'custom-order',
      name: 'Custom Standee Design Request',
      product_slug: 'custom-order',
      selected_height: desiredHeight,
      price: 0,
      description,
      contact_preference: contactPreference,
      reference_images: uploaded
    };
    const insert = await fetch(`${url}/rest/v1/order_requests`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        customer_name: name,
        customer_email: email,
        customer_phone: phone || null,
        items: [item],
        payment_method: 'Quote required',
        original_amount: 0,
        subtotal: 0,
        customer_fee: 0,
        total: 0,
        status: 'new',
        notes: `Order number: ${orderNumber}\nCustom design description: ${description}\nDesired height: ${desiredHeight} inches\nPreferred contact: ${contactPreference}`
      })
    });
    if (!insert.ok) {
      await removeReferences(uploaded, url, serviceKey);
      throw new Error('The request could not be recorded. No reference images were retained.');
    }
    return json(request, { orderNumber }, 201);
  } catch (error) {
    if (uploaded.length && storageUrl && storageServiceKey) await removeReferences(uploaded, storageUrl, storageServiceKey);
    const message = error instanceof Error ? error.message : 'The custom-order request could not be sent.';
    const status = /too many/i.test(message) ? 429 : /not configured/i.test(message) ? 503 : 500;
    return json(request, { error: message }, status);
  }
});
