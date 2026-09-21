const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL = [
    './',
    './index.html',
    './app.css',
    './main.js',
    './state.js',
    './three.js',
    './schedule.js',
    './roomPanel.js',
    './groups.js',
    './ui.js',
    './gamble.js',
    './config.js',
    './fallbackSchedule.js',
    './manifest.webmanifest',
    './img/icons.svg',
    './img/icons/calendar-x.svg',
    './img/icons/chevron-down.svg',
    './img/icons/map-pin.svg',
    './img/icons/triangle-alert.svg',
    './img/icons/user.svg',
];

const CDN_ORIGINS = [
    'https://unpkg.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.all(SHELL.map((path) => cache.add(path).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
                .map((key) => caches.delete(key)),
        );
        await self.clients.claim();
    })());
});

function store(cache, request, response) {
    if (response.status === 200) cache.put(request, response.clone()).catch(() => {});
    return response;
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    return store(cache, request, await fetch(request));
}

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        return store(cache, request, await fetch(request));
    } catch (error) {
        const hit = await cache.match(request) || await cache.match('./index.html');
        if (hit) return hit;
        throw error;
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(request);
    const fresh = fetch(request)
        .then((response) => store(cache, request, response))
        .catch(() => hit);
    return hit || fresh;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    if (sameOrigin && url.pathname.includes('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    if (!sameOrigin) {
        if (CDN_ORIGINS.includes(url.origin)) {
            event.respondWith(cacheFirst(request, ASSET_CACHE));
        }
        return;
    }

    if (url.pathname.endsWith('.glb')) {
        event.respondWith(cacheFirst(request, ASSET_CACHE));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});
