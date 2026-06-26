import { PIXEL_GIF, PIXEL_HEADERS, CORS_HEADERS, getClientInfo } from './utils';

const ONE_WEEK = 7 * 24 * 60 * 60;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function logEvent(kv, trackingId, recipientId, type, details) {
  const key = `tracking:${trackingId}`;
  let record = {};
  try {
    const raw = await kv.get(key, 'text');
    if (raw) record = JSON.parse(raw);
  } catch (_) {}

  if (!record.opens) record.opens = {};
  if (!record.clicks) record.clicks = {};

  const event = { time: Date.now(), ...details };

  if (type === 'open') {
    if (!record.opens[recipientId]) record.opens[recipientId] = [];
    record.opens[recipientId].push(event);
  } else if (type === 'click') {
    if (!record.clicks[recipientId]) record.clicks[recipientId] = [];
    record.clicks[recipientId].push(event);
  }

  record.lastEvent = Date.now();
  await kv.put(key, JSON.stringify(record), { expirationTtl: ONE_WEEK });
  return record;
}

async function handlePixel(request, kv, trackingId, recipientId) {
  const raw = await kv.get(`tracking:${trackingId}`, 'text');
  if (raw) {
    const record = JSON.parse(raw);
    const elapsed = record.sentAt ? Date.now() - record.sentAt : 0;
    if (!record.sentAt || elapsed < 30000) {
      return new Response(PIXEL_GIF, { headers: PIXEL_HEADERS });
    }
  } else {
    return new Response(PIXEL_GIF, { headers: PIXEL_HEADERS });
  }

  const clientInfo = getClientInfo(request);
  await logEvent(kv, trackingId, recipientId, 'open', {
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    country: clientInfo.country,
    referer: clientInfo.referer,
  });
  return new Response(PIXEL_GIF, { headers: PIXEL_HEADERS });
}

async function handlePixelCSS(request, kv, trackingId, recipientId) {
  const raw = await kv.get(`tracking:${trackingId}`, 'text');
  if (raw) {
    const record = JSON.parse(raw);
    const elapsed = record.sentAt ? Date.now() - record.sentAt : 0;
    if (!record.sentAt || elapsed < 30000) {
      return new Response('/* tracked */', { headers: { 'Content-Type': 'text/css; charset=utf-8', ...CORS_HEADERS } });
    }
  } else {
    return new Response('/* tracked */', { headers: { 'Content-Type': 'text/css; charset=utf-8', ...CORS_HEADERS } });
  }

  const clientInfo = getClientInfo(request);
  await logEvent(kv, trackingId, recipientId, 'open', {
    ip: clientInfo.ip, userAgent: clientInfo.userAgent, country: clientInfo.country,
    referer: clientInfo.referer, source: 'css',
  });
  return new Response('/* tracked */', { headers: { 'Content-Type': 'text/css; charset=utf-8', ...CORS_HEADERS } });
}

async function handleClick(request, kv, trackingId, recipientId) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }
  const clientInfo = getClientInfo(request);

  const key = `tracking:${trackingId}`;
  const raw = await kv.get(key, 'text');
  let hasOpens = false;
  if (raw) {
    const record = JSON.parse(raw);
    hasOpens = Object.values(record.opens || {}).some(arr => arr.length > 0);
  }

  if (!hasOpens) {
    await logEvent(kv, trackingId, recipientId, 'open', {
      ip: clientInfo.ip, userAgent: clientInfo.userAgent, country: clientInfo.country,
      source: 'click_implied',
    });
  }

  await logEvent(kv, trackingId, recipientId, 'click', {
    url: targetUrl,
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    country: clientInfo.country,
  });
  return Response.redirect(targetUrl, 302);
}

async function handleRegister(request, kv) {
  try {
    const body = await request.json();
    const { trackingId, subject, recipients } = body;
    if (!trackingId || !recipients) {
      return jsonResponse({ error: 'Missing trackingId or recipients' }, 400);
    }
    const key = `tracking:${trackingId}`;
    const raw = await kv.get(key, 'text');
    const existing = raw ? JSON.parse(raw) : {};
    const record = {
      trackingId, subject: subject || '(no subject)',
      recipients: Array.isArray(recipients) ? recipients : [recipients],
      sentAt: Date.now(),
      opens: existing.opens || {},
      clicks: existing.clicks || {},
      lastEvent: existing.lastEvent || null,
    };
    await kv.put(key, JSON.stringify(record), { expirationTtl: ONE_WEEK });
    return jsonResponse({ ok: true }, 201);
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }
}

async function handleBatchOpens(request, kv) {
  try {
    const body = await request.json();
    const { trackingIds } = body;
    if (!trackingIds || !Array.isArray(trackingIds)) {
      return jsonResponse({ error: 'Missing trackingIds array' }, 400);
    }
    const results = {};
    for (const id of trackingIds) {
      const raw = await kv.get(`tracking:${id}`, 'text');
      if (raw) {
        const record = JSON.parse(raw);
        const totalOpens = Object.values(record.opens || {}).reduce((s, arr) => s + arr.length, 0);
        const uniqueOpens = Object.keys(record.opens || {}).length;
        const totalClicks = Object.values(record.clicks || {}).reduce((s, arr) => s + arr.length, 0);
        results[id] = { totalOpens, uniqueOpens, totalClicks, lastEvent: record.lastEvent };
      } else {
        results[id] = { totalOpens: 0, uniqueOpens: 0, totalClicks: 0, lastEvent: null };
      }
    }
    return jsonResponse(results);
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }
}

async function handleAllStats(kv) {
  const list = await kv.list({ prefix: 'tracking:' });
  const results = [];
  for (const key of list.keys) {
    try {
      const raw = await kv.get(key.name, 'text');
      if (raw) {
        const record = JSON.parse(raw);
        results.push({
          trackingId: record.trackingId, subject: record.subject,
          sentAt: record.sentAt, recipients: record.recipients,
          totalOpens: Object.values(record.opens || {}).reduce((s, arr) => s + arr.length, 0),
          totalClicks: Object.values(record.clicks || {}).reduce((s, arr) => s + arr.length, 0),
          lastEvent: record.lastEvent,
        });
      }
    } catch (_) {}
  }
  results.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  return jsonResponse(results);
}

async function handleEvents(kv, request, trackingId) {
  const raw = await kv.get(`tracking:${trackingId}`, 'text');
  if (!raw) return jsonResponse({ error: 'Not found' }, 404);
  return jsonResponse(JSON.parse(raw));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const kv = env.TRACKER_KV;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const pixelMatch = path.match(/^\/pixel\/([^/]+)\/([^/]+)/);
    if (pixelMatch) return handlePixel(request, kv, pixelMatch[1], pixelMatch[2]);

    const pixelCssMatch = path.match(/^\/pixel-css\/([^/]+)\/([^/]+)/);
    if (pixelCssMatch) return handlePixelCSS(request, kv, pixelCssMatch[1], pixelCssMatch[2]);

    const clickMatch = path.match(/^\/click\/([^/]+)\/([^/]+)/);
    if (clickMatch) return handleClick(request, kv, clickMatch[1], clickMatch[2]);

    if (path === '/api/register' && request.method === 'POST') return handleRegister(request, kv);
    if (path === '/api/batch-opens' && request.method === 'POST') return handleBatchOpens(request, kv);
    if (path === '/api/all-stats' && request.method === 'GET') return handleAllStats(kv);

    const eventsMatch = path.match(/^\/api\/events\/([^/]+)/);
    if (eventsMatch) return handleEvents(kv, request, eventsMatch[1]);

    return jsonResponse({ ok: true, message: 'Email Tracker Worker is running' });
  },
};
