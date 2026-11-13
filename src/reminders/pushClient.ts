import { liveLessons, liveVerses } from '../db/db'
import { uuid } from '../lib/uuid'
import {
  buildReminderSnapshot,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
  type ReminderSnapshot,
} from './engine'

const SETTINGS_KEY = 'memo:reminder-settings:v1'
const CLIENT_ID_KEY = 'memo:push-client-id:v1'
const WEEKLY_DISMISSED_KEY = 'memo:weekly-digest-dismissed:v1'

export interface PushEnvironment {
  supported: boolean
  isIOS: boolean
  isStandalone: boolean
  needsHomeScreenInstall: boolean
  permission: NotificationPermission | 'unsupported'
}

export function getClientId(): string {
  if (typeof localStorage === 'undefined') return 'server'
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = uuid()
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export function loadReminderSettings(): ReminderSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_REMINDER_SETTINGS }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>
    return {
      ...DEFAULT_REMINDER_SETTINGS,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('memo:reminders-changed'))
  }
}

export function isWeeklyDigestDismissed(weekKey: string): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(WEEKLY_DISMISSED_KEY) === weekKey
}

export function dismissWeeklyDigest(weekKey: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(WEEKLY_DISMISSED_KEY, weekKey)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('memo:reminders-changed'))
  }
}

export function getPushEnvironment(): PushEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      isIOS: false,
      isStandalone: false,
      needsHomeScreenInstall: false,
      permission: 'unsupported',
    }
  }
  const ua = navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua) || (ua.includes('mac') && 'ontouchend' in document)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const permission: NotificationPermission | 'unsupported' =
    'Notification' in window ? Notification.permission : 'unsupported'
  return {
    supported,
    isIOS,
    isStandalone,
    needsHomeScreenInstall: isIOS && !isStandalone && !supported,
    permission,
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getReadySWRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker не поддерживается в этом браузере')
  }
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('Service Worker не успел активироваться')), 8000)
  })
  const reg = await Promise.race([navigator.serviceWorker.ready, timeoutPromise])
  return reg
}

export async function buildSnapshotFromDB(now = Date.now()): Promise<ReminderSnapshot> {
  const [verses, lessons] = await Promise.all([liveVerses(), liveLessons()])
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return buildReminderSnapshot(verses, lessons, now, tz)
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/vapid-key')
  if (!res.ok) throw new Error('Не удалось получить ключ Push-сервера')
  const data = (await res.json()) as { publicKey?: string }
  if (!data.publicKey) throw new Error('Сервер не вернул VAPID ключ')
  return data.publicKey
}

async function ensurePushSubscription(): Promise<PushSubscription> {
  const reg = await getReadySWRegistration()
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  const publicKey = await fetchVapidPublicKey()
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

export async function enableWebPush(settingsInput?: ReminderSettings): Promise<ReminderSettings> {
  const env = getPushEnvironment()
  if (!env.supported) {
    throw new Error(
      env.needsHomeScreenInstall
        ? 'На iPhone сначала добавьте приложение на экран «Домой» через меню «Поделиться».'
        : 'Фоновые Push-уведомления не поддерживаются в этом браузере.',
    )
  }

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления отклонено в настройках браузера.')
  }

  const subscription = await ensurePushSubscription()
  const nextSettings: ReminderSettings = {
    ...(settingsInput ?? loadReminderSettings()),
    pushEnabled: true,
  }
  const snapshot = await buildSnapshotFromDB()

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: getClientId(),
      subscription: subscription.toJSON(),
      settings: nextSettings,
      snapshot,
    }),
  })
  if (!res.ok) {
    throw new Error('Не удалось сохранить подписку на сервере')
  }

  saveReminderSettings(nextSettings)
  return nextSettings
}

export async function disableWebPush(settingsInput?: ReminderSettings): Promise<ReminderSettings> {
  const nextSettings: ReminderSettings = {
    ...(settingsInput ?? loadReminderSettings()),
    pushEnabled: false,
  }
  saveReminderSettings(nextSettings)

  let endpoint: string | undefined
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        endpoint = sub.endpoint
        await sub.unsubscribe()
      }
    }
  } catch {
    // ignore browser unsubscribe errors
  }

  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientId(),
        endpoint,
      }),
    })
  } catch {
    // offline safe
  }

  return nextSettings
}

export async function syncPushSnapshot(overrideSettings?: ReminderSettings): Promise<void> {
  const settings = overrideSettings ?? loadReminderSettings()
  if (!settings.pushEnabled) return
  const env = getPushEnvironment()
  if (!env.supported || env.permission !== 'granted') return

  try {
    const subscription = await ensurePushSubscription()
    const snapshot = await buildSnapshotFromDB()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientId(),
        subscription: subscription.toJSON(),
        settings,
        snapshot,
      }),
    })
  } catch {
    // молча пропускаем в офлайне — синхронизируется при следующем фокусе/изменении
  }
}

export async function sendTestPush(): Promise<void> {
  const env = getPushEnvironment()
  if (!env.supported || env.permission !== 'granted') {
    throw new Error('Сначала включите фоновые уведомления.')
  }
  const subscription = await ensurePushSubscription()
  const snapshot = await buildSnapshotFromDB()
  const settings = loadReminderSettings()

  // Гарантируем актуальную подписку перед отправкой теста
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: getClientId(),
      subscription: subscription.toJSON(),
      settings: { ...settings, pushEnabled: true },
      snapshot,
    }),
  })

  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: getClientId(),
      snapshot,
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || 'Не удалось отправить тестовое уведомление')
  }
}

/**
 * Подписывается на изменения локальной базы и возврат фокуса, чтобы сервер всегда знал актуальное расписание стихов.
 */
export function initPushAutoSync(): () => void {
  let timer: number | undefined
  const scheduleSync = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void syncPushSnapshot()
    }, 1200)
  }

  window.addEventListener('memo:changed', scheduleSync)
  window.addEventListener('memo:reminders-changed', scheduleSync)
  window.addEventListener('focus', scheduleSync)
  window.addEventListener('online', scheduleSync)

  // Первичная синхронизация после старта
  const bootTimer = window.setTimeout(() => {
    void syncPushSnapshot()
  }, 2500)

  return () => {
    window.clearTimeout(timer)
    window.clearTimeout(bootTimer)
    window.removeEventListener('memo:changed', scheduleSync)
    window.removeEventListener('memo:reminders-changed', scheduleSync)
    window.removeEventListener('focus', scheduleSync)
    window.removeEventListener('online', scheduleSync)
  }
}
