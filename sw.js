const ROOT = new URL('./', self.location.href);
const PREFIX = `mgtu-offline-${ROOT.pathname}-`;
const SHELL = `${PREFIX}20261004-1-shell`;
const DATA = `mgtu-schedule-data-${ROOT.pathname}-v1`;
const asset = path => new URL(path, ROOT).href;
const FILES = [
  './', 'index.html', 'favicon.svg', 'manifest.webmanifest',
  'assets/app-icon-192.png', 'assets/app-icon-512.png',
  'assets/index-DetailedST11.css', 'assets/university.css?v=20261004-offline',
  'assets/university.js?v=20261004-offline', 'assets/page-University.js?v=20261004-dates',
  'assets/university-ui.js?v=20261003-gear', 'assets/framework-DjPHiq1u.js',
  'assets/rolldown-runtime-S-ySWqyJ.js', 'assets/data-cache.js', 'assets/lesson-on-date.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache = await caches.open(SHELL);
    await cache.addAll(FILES.map(asset));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const names = await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX) && name!==SHELL).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function checkedData(request, url) {
  const cache = await caches.open(DATA);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 12000);
  try {
    const response = await fetch(request, {signal:controller.signal, cache:'no-cache'});
    if (!response.ok) throw new Error('Data unavailable');
    const payload = await response.clone().json();
    const id = url.pathname.match(/\/groups\/(-?\d+)\.json$/)?.[1];
    const valid = id
      ? payload.groupId===id && Array.isArray(payload.lessons) && payload.lessons.length>0
      : Array.isArray(payload.groups) && payload.groups.length>0 && payload.groups.every(group=>typeof group.id==='string' && typeof group.name==='string' && Array.isArray(group.faculties));
    if (!valid) throw new Error('Invalid data');
    await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const stored = await cache.match(request);
    if (stored) {
      const headers = new Headers(stored.headers);
      headers.set('X-MGTU-Cache', 'offline');
      return new Response(await stored.arrayBuffer(), {status:200, headers});
    }
    return new Response('Расписание не сохранено на устройстве', {status:503});
  } finally { clearTimeout(timer); }
}

async function shell(request) {
  const cache = await caches.open(SHELL);
  if(request.mode==='navigate'){
    try {
      const response = await fetch(request);
      // The HTML and all its imports are one version. Keep the installed
      // shell until the next worker precaches the whole new version.
      if(response.ok)return response;
    } catch {}
    return await cache.match(asset('index.html')) || Response.error();
  }
  const stored = await cache.match(request);
  if(stored)return stored;
  return fetch(request);
}

self.addEventListener('fetch', event => {
  if(event.request.method!=='GET')return;
  const url = new URL(event.request.url);
  if(url.origin!==ROOT.origin || !url.pathname.startsWith(ROOT.pathname))return;
  const relative = url.pathname.slice(ROOT.pathname.length);
  if(relative==='university-data/catalogue.json' || /^university-data\/groups\/-?\d+\.json$/.test(relative)){
    event.respondWith(checkedData(event.request, url));
  }else if(event.request.mode==='navigate' || FILES.map(asset).includes(url.href)){
    event.respondWith(shell(event.request));
  }
});
