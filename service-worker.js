// ------------------------------------------------------------
//  歩行解析アプリ PWA Service Worker（v4）
//  ※ script.js / index.html を更新したら CACHE_NAME を上げる
// ------------------------------------------------------------

const CACHE_NAME = "gait-app-cache-v4";   // ★ここを更新（v3 → v4）
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// ------------------------------------------------------------
//  インストール：必要ファイルをキャッシュ
// ------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// ------------------------------------------------------------
//  有効化：古いキャッシュを削除
// ------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// ------------------------------------------------------------
//  fetch：キャッシュ → ネットワークの順で返す
// ------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // キャッシュがあれば返す、なければネットワーク
      return response || fetch(event.request);
    })
  );

});
