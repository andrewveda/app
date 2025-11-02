const CACHE_NAME = "vec-english-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-icon-512.png"
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

// Fetch: serve cached assets offline, fallback to network
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return; // don't cache POST requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(event.request).catch(() =>
          new Response("⚠️ You are offline. Some data may not be sent yet.")
        )
      );
    })
  );
});

// Background sync for failed POST requests
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-form-data") {
    event.waitUntil(sendStoredRequests());
  }
});

// Store failed requests (if offline)
self.addEventListener("fetch", (event) => {
  if (event.request.method === "POST") {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        const formData = await event.request.clone().text();
        saveRequest(formData);
        return new Response(JSON.stringify({ status: "saved_offline" }), {
          headers: { "Content-Type": "application/json" }
        });
      })
    );
  }
});

// IndexedDB helpers for storing offline POST data
function saveRequest(data) {
  return idbKeyval.set(`req-${Date.now()}`, data);
}

async function sendStoredRequests() {
  const keys = await idbKeyval.keys();
  for (const key of keys) {
    const data = await idbKeyval.get(key);
    await fetch("https://script.google.com/macros/s/AKfycbxA0lRkERWFt2cYfmm04IQioaG4-21k5VFF5CFKP30zyVaJXM5_27PL3v8JIZEweK3u/exec", {
      method: "POST",
      body: data,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    await idbKeyval.del(key);
  }
}

// Minimal IndexedDB utility (idb-keyval style)
const idbKeyval = {
  dbPromise: null,
  getDB() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const openreq = indexedDB.open("vec-requests-store", 1);
        openreq.onupgradeneeded = () => openreq.result.createObjectStore("store");
        openreq.onsuccess = () => resolve(openreq.result);
        openreq.onerror = () => reject(openreq.error);
      });
    }
    return this.dbPromise;
  },
  async set(key, val) {
    const db = await this.getDB();
    const tx = db.transaction("store", "readwrite");
    tx.objectStore("store").put(val, key);
    return tx.complete;
  },
  async get(key) {
    const db = await this.getDB();
    return db.transaction("store").objectStore("store").get(key);
  },
  async del(key) {
    const db = await this.getDB();
    const tx = db.transaction("store", "readwrite");
    tx.objectStore("store").delete(key);
    return tx.complete;
  },
  async keys() {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const keys = [];
      const cursorReq = db.transaction("store").objectStore("store").openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve(keys);
        keys.push(cursor.key);
        cursor.continue();
      };
    });
  }
};
