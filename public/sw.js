// Service Worker for JEE LiveSync Push Notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'JEE Live Class Alert',
    body: 'Your live JEE session is starting soon!',
    url: '/',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'jee-class-alert',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'jee-class-alert',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      classId: data.classId,
    },
    actions: [
      { action: 'open', title: 'Enter Classroom' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If there's an existing open client, focus and navigate it
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
