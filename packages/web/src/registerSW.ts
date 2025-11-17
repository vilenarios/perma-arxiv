// Register service worker for COOP/COEP headers
// Only needed in production (Arweave doesn't set these headers)
// In dev mode, Vite already sets the headers via vite.config.ts
export async function registerServiceWorker(): Promise<void> {
  // Skip in development mode
  if (import.meta.env.DEV) {
    console.log('Skipping Service Worker in development mode');
    return;
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Wait for service worker to be active
      if (registration.active) {
        console.log('Service Worker already active');
        return;
      }

      await new Promise<void>((resolve) => {
        const serviceWorker = registration.installing || registration.waiting;
        if (serviceWorker) {
          serviceWorker.addEventListener('statechange', (e) => {
            if ((e.target as ServiceWorker).state === 'activated') {
              console.log('Service Worker activated');
              resolve();
            }
          });
        } else {
          resolve();
        }
      });

      // Reload page once to activate service worker
      if (!navigator.serviceWorker.controller) {
        console.log('Reloading to activate Service Worker...');
        window.location.reload();
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}
