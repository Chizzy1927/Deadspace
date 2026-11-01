#!/usr/bin/env node
// Public smoke test for a deployed DeadSpace demo.
//
//   npm run smoke:public -- https://<service>.onrender.com
//   (or SMOKE_BASE_URL=... npm run smoke:public)
//
// It drives a real browser (Playwright's Chromium: `npx playwright-core install chromium` once) and plain
// HTTP against the given URL only. It creates a handful of transport and storage requests (the public
// demo allows that) and never creates supply. It prints how many requests it created so the database
// can be checked before and after with `npm run db:status -w apps/api`. Exit code 0 only if every check
// passes. It never reads or prints credentials.
import { chromium } from 'playwright-core';

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const rawBase = arg ?? process.env.SMOKE_BASE_URL;
if (!rawBase) {
  console.error('Usage: npm run smoke:public -- https://your-service.onrender.com');
  process.exit(2);
}
const BASE = new URL(rawBase).origin;

const results = [];
const created = { transportRequests: 0, storageRequests: 0 };

function check(group, name, ok, detail = '') {
  results.push({ group, name, ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${!ok && detail ? `\n        -> ${String(detail).slice(0, 400)}` : ''}`,
  );
}

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function http(path, init = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...init });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, headers: res.headers, text, json };
}

// --------------------------------------------------------------------------------------------
// 1. API and headers (plain HTTP)
async function apiChecks() {
  const G = 'api and headers';
  const health = await http('/api/health');
  check(
    G,
    '/api/health is 200 with the PostGIS version',
    health.status === 200 && health.json?.status === 'ok' && typeof health.json?.database?.postgisVersion === 'string',
    `${health.status} ${health.text}`,
  );
  const livez = await http('/api/livez');
  check(G, '/api/livez is 200', livez.status === 200 && livez.json?.status === 'ok', `${livez.status} ${livez.text}`);
  const config = await http('/api/demo-config');
  check(
    G,
    '/api/demo-config reports listing creation OFF',
    config.status === 200 && config.json?.listingCreationEnabled === false,
    `${config.status} ${config.text}`,
  );

  const unknownApi = await http('/api/nope-' + Date.now());
  check(
    G,
    'an unknown /api route is a JSON 404, not the SPA',
    unknownApi.status === 404 &&
      /application\/json/.test(unknownApi.headers.get('content-type') ?? '') &&
      unknownApi.json?.error?.code === 'NOT_FOUND',
    `${unknownApi.status} ${unknownApi.text.slice(0, 120)}`,
  );
  const unknownAsset = await http(`/assets/missing-${Date.now()}.js`);
  check(
    G,
    'an unknown asset is a 404, not the SPA shell',
    unknownAsset.status === 404 && !unknownAsset.text.includes('id="root"'),
    `${unknownAsset.status}`,
  );

  const robots = await http('/robots.txt');
  check(
    G,
    'robots.txt disallows all crawlers',
    robots.status === 200 && /Disallow:\s*\//.test(robots.text),
    `${robots.status} ${robots.text.slice(0, 80)}`,
  );
  const page = await http('/');
  check(
    G,
    'the HTML shell sends X-Robots-Tag noindex and has a robots meta tag',
    /noindex/.test(page.headers.get('x-robots-tag') ?? '') && /<meta name="robots" content="noindex/.test(page.text),
    page.headers.get('x-robots-tag'),
  );
  check(G, 'API responses send X-Robots-Tag noindex', /noindex/.test(health.headers.get('x-robots-tag') ?? ''));

  for (const path of ['/api/truck-legs', '/api/warehouse-spaces']) {
    const res = await http(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    check(
      G,
      `POST ${path} is refused with 403 FEATURE_DISABLED`,
      res.status === 403 && res.json?.error?.code === 'FEATURE_DISABLED',
      `${res.status} ${res.text.slice(0, 120)}`,
    );
  }
}

// --------------------------------------------------------------------------------------------
// 2. Browser journeys
async function newPage(browser, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await context.newPage();
  const noise = { console: [], pageErrors: [], failed: [], http: [] };
  const supplyPosts = [];
  page.on('console', (m) => m.type() === 'error' && noise.console.push(m.text()));
  page.on('pageerror', (e) => noise.pageErrors.push(String(e)));
  page.on('requestfailed', (r) =>
    noise.failed.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText}`),
  );
  page.on('response', (r) => {
    if (r.status() >= 400) noise.http.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    if (r.request().method() === 'POST' && r.status() === 201) {
      const path = new URL(r.url()).pathname;
      if (path === '/api/transport-requests') created.transportRequests += 1;
      if (path === '/api/storage-requests') created.storageRequests += 1;
    }
  });
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (r.method() === 'POST' && (path === '/api/truck-legs' || path === '/api/warehouse-spaces'))
      supplyPosts.push(path);
  });
  return { context, page, noise, supplyPosts };
}

function clean(group, noise) {
  check(
    group,
    'no console errors, page errors, failed requests or 4xx/5xx responses',
    noise.console.length + noise.pageErrors.length + noise.failed.length + noise.http.length === 0,
    JSON.stringify(noise),
  );
}

async function noOverflow(group, page, label) {
  const over = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
  check(group, `${label}: no horizontal overflow`, over <= 1, `overflow ${over}px`);
}

const submit = (page) => page.locator('form button[type=submit]');

async function pickLocation(page, label, query) {
  await page.getByRole('combobox', { name: label }).fill(query);
  const option = page.getByRole('option').filter({ hasText: query }).first();
  await option.waitFor({ timeout: 15000 });
  await option.getByRole('button').click();
}

async function fillTruckForm(page) {
  await pickLocation(page, 'Where will your truck be free?', 'Dallas');
  await pickLocation(page, 'Where are you heading next?', 'Houston');
  await page.locator('#departureEarliest').fill(localInput(inDays(2, 9)));
  await page.locator('#departureLatest').fill(localInput(inDays(2, 15)));
  await page.locator('#priceAmount').fill('650');
  await page.locator('#companyName').fill('Smoke Test Freight');
  await page.locator('#contactName').fill('Smoke Test');
  await page.locator('#contactEmail').fill('smoke@smoketest.example.com');
}

async function fillWarehouseForm(page) {
  await pickLocation(page, 'Where is the space?', 'Dallas');
  await page.getByLabel('Pallet positions offered').fill('120');
  await page.locator('#availableFrom').fill(dateInput(inDays(3)));
  await page.locator('#availableTo').fill(dateInput(inDays(60)));
  await page.getByLabel(/^Price per pallet per/).fill('15');
  await page.locator('#companyName').fill('Smoke Test Storage');
  await page.locator('#contactName').fill('Smoke Test');
  await page.locator('#contactEmail').fill('smoke@smoketest.example.com');
}

async function journeys(browser) {
  {
    const G = 'landing';
    const { context, page, noise } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + '/');
    const banner = page.getByRole('region', { name: 'About this demo' });
    await banner.waitFor();
    const text = await banner.innerText();
    check(
      G,
      'the demo banner says fictional sample data, nothing bookable, example markets',
      /Portfolio demo/.test(text) &&
        /fictional sample data/.test(text) &&
        /nothing can be booked/.test(text) &&
        /selected example markets/.test(text),
      text,
    );
    await banner.getByRole('link', { name: 'About the demo data' }).click();
    await page.waitForURL(/#demo-data$/);
    const section = (await page.locator('#demo-data').innerText()).replace(/\s+/g, ' ');
    check(
      G,
      'the "About the demo data" section explains real vs fictional and coverage',
      /What is real/.test(section) &&
        /What is fictional/.test(section) &&
        /rather than live or nationwide capacity/.test(section),
    );
    const body = await page.locator('body').innerText();
    check(
      G,
      'the Need capacity / Have capacity structure is present',
      /I need capacity/i.test(body) && /I have capacity/i.test(body),
    );
    clean(G, noise);
    await context.close();
  }

  {
    const G = 'deep links';
    const { context, page, noise } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + '/request/storage');
    await page.getByRole('heading', { name: 'Request storage' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Request storage' }).waitFor();
    check(G, 'a deep SPA route loads directly and survives a hard refresh', true);
    await page.goto(BASE + '/this/page/does/not/exist');
    await page.getByRole('heading', { name: /not found/i }).waitFor();
    check(G, 'an unknown SPA route shows the in-app not-found page', true);
    clean(G + ' (expected 404s excluded)', {
      ...noise,
      http: noise.http.filter((h) => !h.startsWith('404 GET /this/page')),
    });
    await context.close();
  }

  {
    const G = 'transport example';
    const { context, page, noise } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + '/request/transport?example=1');
    check(
      G,
      'the form states the demo coverage',
      /selected example markets, mainly in and around Texas/.test(await page.locator('body').innerText()),
    );
    await submit(page).click();
    await page.waitForURL(/\/requests\/transport\/[^/]+\/matches$/);
    await page.locator('article').first().waitFor();
    const cards = page.locator('article');
    const n = await cards.count();
    check(G, 'at least 3 seeded matches are returned', n >= 3, `count=${n}`);
    console.log(`        (transport example returned ${n} matches)`);
    check(
      G,
      'every match is tagged "Sample data"',
      (await page.getByText('Sample data', { exact: true }).count()) === n,
    );
    check(G, 'no seeded contact is a mailto link', (await page.locator('a[href^="mailto:"]').count()) === 0);
    const url = page.url();
    await page.reload();
    await page.locator('article').first().waitFor();
    check(
      G,
      'a hard refresh of the matches URL shows the same results',
      (await page.locator('article').count()) === n && page.url() === url,
    );
    clean(G, noise);
    await context.close();
  }

  {
    const G = 'storage example';
    const { context, page, noise } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + '/request/storage?example=1');
    await submit(page).click();
    await page.waitForURL(/\/requests\/storage\/[^/]+\/matches$/);
    await page.locator('article').first().waitFor();
    const n = await page.locator('article').count();
    check(G, 'at least 2 seeded matches are returned', n >= 2, `count=${n}`);
    check(
      G,
      'every match is tagged "Sample data"',
      (await page.getByText('Sample data', { exact: true }).count()) === n,
    );
    check(G, 'no seeded contact is a mailto link', (await page.locator('a[href^="mailto:"]').count()) === 0);
    clean(G, noise);
    await context.close();
  }

  {
    const G = 'zero-match';
    const { context, page, noise } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + '/');
    const seattle = { label: 'Seattle, WA, United States', lat: 47.6062, lng: -122.3321 };
    const portland = { label: 'Portland, OR, United States', lat: 45.5152, lng: -122.6784 };
    const who = {
      companyName: 'Smoke Test Shipper',
      contactName: 'Smoke Test',
      contactEmail: 'smoke@smoketest.example.com',
    };
    const post = (path, body) =>
      page.evaluate(
        async ([p, b]) => {
          const r = await fetch(p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b),
          });
          return { status: r.status, body: await r.json() };
        },
        [path, body],
      );
    const transport = await post('/api/transport-requests', {
      ...who,
      pickup: seattle,
      dropoff: portland,
      pickupEarliest: inDays(2, 9).toISOString(),
      pickupLatest: inDays(2, 21).toISOString(),
      trailerType: 'DRY_VAN',
      pallets: 6,
      weightLbs: 9000,
    });
    check(G, 'a request outside the demo markets is accepted', transport.status === 201, JSON.stringify(transport));
    await page.goto(`${BASE}/requests/transport/${transport.body.id}/matches`);
    await page.getByRole('heading', { name: 'No matching trucks yet' }).waitFor();
    const t = await page.locator('body').innerText();
    check(
      G,
      'the empty transport result explains limited demo coverage and offers the example',
      /This is a demo with limited coverage/.test(t) &&
        (await page.getByRole('link', { name: 'example transport request' }).count()) === 1,
    );

    const storage = await post('/api/storage-requests', {
      ...who,
      location: seattle,
      maxDistanceMiles: 25,
      pallets: 40,
      startDate: dateInput(inDays(8)),
      endDate: dateInput(inDays(38)),
      needsTemperatureControl: false,
      needsFoodGrade: false,
    });
    check(G, 'a storage request outside the demo markets is accepted', storage.status === 201, JSON.stringify(storage));
    await page.goto(`${BASE}/requests/storage/${storage.body.id}/matches`);
    await page.getByRole('heading', { name: 'No matching warehouses yet' }).waitFor();
    check(
      G,
      'the empty storage result explains limited demo coverage',
      /This is a demo with limited coverage/.test(await page.locator('body').innerText()),
    );
    clean(G, noise);
    await context.close();
  }

  for (const [kind, path, fill] of [
    ['truck', '/list/truck', fillTruckForm],
    ['warehouse', '/list/warehouse', fillWarehouseForm],
  ]) {
    const G = `${kind} listing form`;
    const { context, page, noise, supplyPosts } = await newPage(browser, { width: 1280, height: 900 }, false);
    await page.goto(BASE + path);
    const notice = page.getByRole('note');
    await notice.waitFor();
    check(
      G,
      'it says up front that saving is turned off in this public demo',
      /Saving listings is turned off in this public demo/.test(await notice.innerText()),
    );
    check(G, 'the button says nothing is saved', (await submit(page).innerText()) === 'Check my listing (not saved)');
    await submit(page).click();
    await page.waitForTimeout(300);
    check(
      G,
      'an empty submission still shows validation errors',
      (await page.locator('[role=alert], [id$="-error"]').count()) > 0,
    );
    await fill(page);
    await submit(page).click();
    await page
      .getByRole('status')
      .filter({ hasText: /nothing was stored/ })
      .waitFor({ timeout: 8000 });
    check(G, 'a valid submission demonstrates the flow and says nothing was stored', true);
    check(G, 'no supply create request was sent', supplyPosts.length === 0, supplyPosts.join(','));
    check(G, 'the page stayed on the form', page.url().includes(path));
    clean(G, noise);
    await context.close();
  }

  {
    const G = 'mobile 390px';
    const { context, page, noise } = await newPage(browser, { width: 390, height: 844 }, true);
    await page.goto(BASE + '/');
    await page.getByRole('region', { name: 'About this demo' }).waitFor();
    await noOverflow(G, page, 'landing');
    await page.goto(BASE + '/request/transport?example=1');
    await noOverflow(G, page, 'transport form');
    await submit(page).click();
    await page.waitForURL(/\/matches$/);
    await page.locator('article').first().waitFor();
    await noOverflow(G, page, 'transport matches');
    await page.goto(BASE + '/list/truck');
    await page.getByRole('note').waitFor();
    await noOverflow(G, page, 'truck listing');
    await page.goto(BASE + '/list/warehouse');
    await page.getByRole('note').waitFor();
    await noOverflow(G, page, 'warehouse listing');
    clean(G, noise);
    await context.close();
  }
}

// --------------------------------------------------------------------------------------------
// 3. Client-IP check, last: it spends the geocode rate limit for a minute.
async function clientIpCheck() {
  const G = 'client IP';
  let limited = 0;
  for (let i = 0; i < 70; i++) {
    const res = await fetch(`${BASE}/api/geocode/search?q=dal`, {
      headers: { 'X-Forwarded-For': `203.0.113.${(i % 250) + 1}` },
    });
    if (res.status === 429) limited += 1;
  }
  check(
    G,
    'forged X-Forwarded-For values do not let a client dodge the rate limit',
    limited > 0,
    `rate-limited responses: ${limited} of 70`,
  );
}

console.log(`Smoke testing ${BASE}\n`);
const browser = await chromium.launch({ headless: true });
try {
  await apiChecks();
  await journeys(browser);
  await clientIpCheck();
} catch (error) {
  check(
    'run',
    'the smoke run completed without an unexpected error',
    false,
    error instanceof Error ? error.message : error,
  );
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nSMOKE_CREATED transportRequests=${created.transportRequests} storageRequests=${created.storageRequests}`,
);
console.log(`${results.length - failed.length} passed, ${failed.length} failed against ${BASE}`);
process.exit(failed.length > 0 ? 1 : 0);
