// Aqua 서비스 워커: 한 번 본 화면과 그림을 저장해 두어 오프라인에서도 열리게 한다.
// - 페이지 이동(index.html)은 네트워크를 먼저 쓰고, 안 되면 저장본을 쓴다(새 배포가 바로 보이게).
// - 그 밖의 같은 출처 파일(스크립트·그림·글꼴)은 저장본을 먼저 돌려주고 뒤에서 새로 받아 둔다.
const CACHE = "aqua-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", "./manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match("./"))),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      return hit ?? fresh;
    }),
  );
});
