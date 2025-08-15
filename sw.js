// Service Worker for SuiSight PWA
const CACHE_NAME = 'suisight-v1.0.0';
const STATIC_CACHE_NAME = 'suisight-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'suisight-dynamic-v1.0.0';

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/Fulcrum.png',
  '/vite.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle API requests (SUI RPC calls)
  if (url.hostname.includes('sui') || url.pathname.includes('api')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses for short time
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseClone);
                // Auto-expire dynamic cache entries after 5 minutes
                setTimeout(() => {
                  cache.delete(request);
                }, 5 * 60 * 1000);
              });
          }
          return response;
        })
        .catch(() => {
          // Return cached response if available
          return caches.match(request);
        })
    );
    return;
  }

  // Handle static assets and pages
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', request.url);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response.ok) {
              return response;
            }

            // Clone the response
            const responseClone = response.clone();

            // Cache the response
            caches.open(DYNAMIC_CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseClone);
              });

            return response;
          })
          .catch((error) => {
            console.log('[SW] Network request failed:', error);
            
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // Return a basic offline response for other requests
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain',
              }),
            });
          });
      })
  );
});

// Background sync for price alerts
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'price-alert-check') {
    event.waitUntil(checkPriceAlerts());
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/Fulcrum.png',
    badge: '/Fulcrum.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Markets',
        icon: '/Fulcrum.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/Fulcrum.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('SuiSight', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Price alerts checking function
async function checkPriceAlerts() {
  try {
    console.log('[SW] Checking price alerts...');
    
    // Get stored alerts from IndexedDB or localStorage
    const alerts = await getStoredAlerts();
    
    if (!alerts || alerts.length === 0) {
      console.log('[SW] No alerts to check');
      return;
    }

    // Check each alert (this would need to be implemented with actual price checking)
    for (const alert of alerts) {
      if (alert.isActive) {
        // In a real implementation, you would fetch current prices here
        // and compare with alert.targetPrice
        console.log('[SW] Checking alert for market:', alert.marketId);
      }
    }
    
  } catch (error) {
    console.error('[SW] Error checking price alerts:', error);
  }
}

// Helper function to get stored alerts
async function getStoredAlerts() {
  try {
    // This would need to be implemented to read from IndexedDB
    // For now, return empty array
    return [];
  } catch (error) {
    console.error('[SW] Error getting stored alerts:', error);
    return [];
  }
}

// Cache size management
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Delete oldest entries
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    console.log(`[SW] Cleaned up ${keysToDelete.length} items from ${cacheName}`);
  }
}

// Periodic cache cleanup
setInterval(() => {
  limitCacheSize(DYNAMIC_CACHE_NAME, 50);
}, 10 * 60 * 1000); // Every 10 minutes

console.log('[SW] Service Worker script loaded');