// 秩序 · Ordo - Service Worker
// 离线缓存策略:核心文件预缓存 + 网络优先(字体)+ 缓存优先(静态资源)

const CACHE_VERSION = 'ordo-v1';
const CACHE_NAME = `ordo-cache-${CACHE_VERSION}`;

// 需要预缓存的核心资源
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// 安装:预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Ordo SW] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[Ordo SW] Install failed:', err))
  );
});

// 激活:清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key.startsWith('ordo-cache-'))
            .map(key => {
              console.log('[Ordo SW] Removing old cache:', key);
              return caches.delete(key);
            })
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截:缓存优先,失败回退到网络
self.addEventListener('fetch', event => {
  const req = event.request;
  
  // 只处理 GET 请求
  if (req.method !== 'GET') return;
  
  const url = new URL(req.url);
  
  // Google Fonts:缓存优先(字体文件通常永不变)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          // 成功后写入缓存
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }
  
  // 同源资源:缓存优先
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        // 有缓存就返回,同时在后台更新缓存
        if (cached) {
          fetch(req).then(resp => {
            if (resp && resp.status === 200) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            }
          }).catch(() => {});
          return cached;
        }
        // 没缓存则走网络,成功后存入
        return fetch(req).then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return resp;
        }).catch(() => {
          // 离线兜底:HTML 请求返回主页
          if (req.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }
  
  // 其他跨域请求:直接走网络
});

// 监听消息(用于将来扩展:清空缓存、强制更新等)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
});
