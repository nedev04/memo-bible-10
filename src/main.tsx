import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import './styles.css'

// Регистрируем Service Worker для офлайн-работы приложения без интернета
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Автоматическое обновление при новом деплое
  },
  onOfflineReady() {
    console.log('[PWA] Приложение готово к автономной работе без интернета')
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Просим браузер не удалять данные автоматически при нехватке места (не везде поддерживается)
navigator.storage?.persist?.().catch(() => {})

