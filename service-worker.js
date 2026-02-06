/* ---------------------------------------------------------
   歩行解析アプリ - Service Worker（最終完全版）
   - オフライン対応
   - ルート直下の画像キャッシュ対応
   - PWA安定動作
--------------------------------------------------------- */

const CACHE_NAME = "gait-analysis-app-v5";

/* ---------------------------------------------------------
   キャッシュするファイル一覧
--------------------------------------------------------- */
const ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./manifest.json",
  "./pdf-font.js",

  // ルート直下の画像
  "./pelvis.png",
  "./leg-move.png",
  "./exercise.png",

  // アイコン
  "./icon-192.png",
  "./icon-512.png",

  // 外部ライブラリ
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0",
];

/* ---------------------------------------------------------
   インストール時：キャッシュ登録
--------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => null);
    })
  );
});

/* ---------------------------------------------------------
   アクティベート時：古いキャッシュ削除
--------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

/* ---------------------------------------------------------
   fetch：キャッシュ優先で返す
--------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 以外は無視
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
          return response;
        })
        .catch(() => cached);
    })
  );
});
