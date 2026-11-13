// Notifications push du site (Firebase Cloud Messaging) : affichées même onglet fermé.
// Le jeton est obtenu par src/lib/push.ts ; ce fichier n'a pas besoin du SDK Firebase : il lit le message
// (titre, texte, écran à ouvrir) et l'affiche. Un clic ouvre la page concernée dans un onglet du site.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let message = {};
  try {
    message = e.data ? e.data.json() : {};
  } catch {
    message = {};
  }
  const notification = message.notification || {};
  const donnees = message.data || {};
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(notification.title || 'CETIC de Mezesse', {
        body: notification.body || '',
        icon: '/logo.png',
        badge: '/favicon.png',
        tag: message.fcmMessageId,
        data: { lien: donnees.lien || '/' },
      }),
      // Onglets ouverts : la cloche se met à jour sans attendre.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((onglets) => onglets.forEach((o) => o.postMessage({ type: 'cetic-push' }))),
    ]),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const adresse = new URL((e.notification.data && e.notification.data.lien) || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((onglets) => {
      const onglet = onglets.find((o) => o.url.startsWith(self.location.origin));
      if (onglet) return onglet.navigate(adresse).then((o) => (o || onglet).focus());
      return self.clients.openWindow(adresse);
    }),
  );
});
