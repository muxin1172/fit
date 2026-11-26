/* P3-4: register from main on load with navigator.serviceWorker.register('./sw.js').
 * Bump VERSION whenever the shell changes. A new worker waits for old tabs to close;
 * deliberately no skipWaiting(), avoiding a mixed-version app during a workout.
 * This worker caches PUBLIC STATIC FILES ONLY. Offline user writes remain the
 * responsibility of sync.js (localStorage/IndexedDB + its existing pending queue).
 */
'use strict';
const VERSION = 'motionlog-v15-shell-2';
const CACHE_PREFIX = 'motionlog-v15-shell-';
const BASE = new URL('./', self.location.href);
const SHELL = [
  'index.html', 'app.css', 'app.js', 'sync.js', 'layout.js',
  'rest-timer.js', 'training-metrics.js', 'photo-tools.js',
  'manifest.json', 'icon.svg'
].map(file => new URL(file, BASE).href);
// Exact URL only: never use a broad jsdelivr or Supabase host allowlist.
// Optional warmup: CDN failure must not prevent the local shell from installing.
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const PUBLIC_ASSETS = new Set([...SHELL, SDK]);
function contentMatches(url, response) {
  if (!response.ok || response.type === 'opaque' || response.redirected) return false;
  const control = response.headers.get('cache-control') || '';
  if (/\b(private|no-store)\b/i.test(control)) return false;
  const type = response.headers.get('content-type') || '';
  if (url === SDK || url.endsWith('.js')) return /(?:java|ecma)script/i.test(type);
  if (url.endsWith('.css')) return /text\/css/i.test(type);
  if (url.endsWith('.html')) return /text\/html/i.test(type);
  if (url.endsWith('.json')) return /(?:application\/json|application\/manifest\+json)/i.test(type);
  if (url.endsWith('.svg')) return /image\/svg\+xml/i.test(type);
  return false;
}
async function download(url) {
  const signal = url === SDK && typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
  const response = await fetch(new Request(url, {credentials: 'omit', mode: 'cors', cache: 'reload', signal}));
  if (!contentMatches(url, response)) throw new Error(`Invalid public shell asset: ${url}`);
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch/validate all mandatory assets before changing this version's cache.
    const responses = await Promise.all(SHELL.map(download));
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map((url, index) => cache.put(url, responses[index])));
    try { await cache.put(SDK, await download(SDK)); } catch (_) { /* Offline/local mode remains available. */ }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization') || request.headers.has('range')) return;
  const url = new URL(request.url);
  const isShellNavigation = request.mode === 'navigate' && url.origin === BASE.origin &&
    (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname);
  const asset = isShellNavigation ? new URL('index.html', BASE).href : url.href;
  // Ignore arbitrary queries (including signed URLs), all APIs, photos and auth.
  if (!isShellNavigation && (url.search || !PUBLIC_ASSETS.has(asset))) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(asset);
    if (cached) return cached;
    try {
      const response = await download(asset);
      await cache.put(asset, response.clone());
      return response;
    } catch (_) {
      // Do not cache fallback/error responses or manufacture backend success.
      return Response.error();
    }
  })());
});
