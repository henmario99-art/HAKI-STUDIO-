const CACHE='haki-studio-v4';
const LOCAL=['./','./index.html','./styles.css','./app.js','./core.js','./editor.js','./warp.js','./storage.js','./ui.js','./smart.js','./manifest.webmanifest','./icon.svg','./vendor/fabric.min.js','./haki-front-reference.jpg','./haki-back-reference.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(LOCAL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html'))));
  }else{
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
  }
});