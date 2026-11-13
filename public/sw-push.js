/* Обработчик фоновых Web Push уведомлений для Service Worker */

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Наизусть',
    body: 'Время повторить стихи Библии',
    url: '/#/lesson',
    tag: 'memo-bible-reminder',
  }

  if (event.data) {
    try {
      const parsed = event.data.json()
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' && parsed.title ? parsed.title : payload.title,
          body: typeof parsed.body === 'string' && parsed.body ? parsed.body : payload.body,
          url: typeof parsed.url === 'string' && parsed.url ? parsed.url : payload.url,
          tag: typeof parsed.tag === 'string' && parsed.tag ? parsed.tag : payload.tag,
        }
      }
    } catch {
      const txt = event.data.text()
      if (txt) payload.body = txt
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = (event.notification.data && event.notification.data.url) || '/#/'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            return client.navigate(targetUrl).catch(() => client.postMessage({ type: 'PUSH_NAVIGATE', url: targetPath }))
          }
          client.postMessage({ type: 'PUSH_NAVIGATE', url: targetPath })
          return client
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    }),
  )
})
