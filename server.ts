import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { GoogleGenAI, Type } from '@google/genai'
import type { PushSubscription as WebPushSubscription } from 'web-push'

const require = createRequire(import.meta.url)
const webpush = require('web-push') as typeof import('web-push')
import {
  buildTestPushPayload,
  DEFAULT_REMINDER_SETTINGS,
  evaluateDuePushNotifications,
  localDateKey,
  type ReminderSettings,
  type ReminderSnapshot,
  type SentNotificationEntry,
} from './src/reminders/engine.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3000
const isProd = process.env.NODE_ENV === 'production'
const PUSH_STORE_PATH = path.resolve(__dirname, '.data', 'push-store.json')

interface StoredPushClient {
  clientId: string
  subscription: WebPushSubscription
  settings: ReminderSettings
  snapshot: ReminderSnapshot
  subscribedAt: number
  sentLog: SentNotificationEntry[]
}

interface PushStoreData {
  vapidKeys: { publicKey: string; privateKey: string }
  clients: Record<string, StoredPushClient>
}

function loadOrInitPushStore(): PushStoreData {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim()
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim()

  try {
    if (fs.existsSync(PUSH_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PUSH_STORE_PATH, 'utf8')) as Partial<PushStoreData>
      const vapidKeys =
        envPub && envPriv
          ? { publicKey: envPub, privateKey: envPriv }
          : parsed.vapidKeys?.publicKey && parsed.vapidKeys?.privateKey
          ? parsed.vapidKeys
          : webpush.generateVAPIDKeys()
      const data: PushStoreData = {
        vapidKeys,
        clients: parsed.clients && typeof parsed.clients === 'object' ? parsed.clients : {},
      }
      savePushStore(data)
      return data
    }
  } catch (err) {
    console.warn('[Push store load]', err instanceof Error ? err.message : String(err))
  }

  const data: PushStoreData = {
    vapidKeys: envPub && envPriv ? { publicKey: envPub, privateKey: envPriv } : webpush.generateVAPIDKeys(),
    clients: {},
  }
  savePushStore(data)
  return data
}

function savePushStore(data: PushStoreData): void {
  try {
    fs.mkdirSync(path.dirname(PUSH_STORE_PATH), { recursive: true })
    fs.writeFileSync(PUSH_STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.warn('[Push store save]', err instanceof Error ? err.message : String(err))
  }
}

let cachedAi: GoogleGenAI | null = null
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  }
  return cachedAi
}

interface ProofreadReqItem {
  key: string
  ref: string
  text: string
  level: 1 | 2 | 3
}

function tokenizeWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const stripped = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      return stripped || token
    })
}

async function startServer() {
  const app = express()
  const httpServer = http.createServer(app)
  app.use(express.json({ limit: '1mb' }))

  app.post('/api/ai/proofread', async (req, res) => {
    const body = req.body as { items?: ProofreadReqItem[] } | undefined
    const items = Array.isArray(body?.items) ? body.items.slice(0, 8) : []
    if (items.length === 0) {
      res.json({ results: [] })
      return
    }

    const ai = getAiClient()
    if (!ai) {
      res.json({ results: [], fallback: true })
      return
    }

    try {
      const promptLines = items.map((item, idx) => {
        const words = tokenizeWords(item.text)
        const numbered = words.map((w, wi) => `${wi}:${w}`).join(' ')
        const errCount = item.level === 3 && words.length >= 16 ? 2 : 1
        return `Verse ${idx} (key="${item.key}", ref="${item.ref}", level=${item.level}, errorsNeeded=${errCount}):\n${numbered}`
      })

      const systemInstruction = [
        'Ты — редактор Синодального перевода Библии и составитель тестов на внимание.',
        'Для каждого стиха выбери указанное количество слов (errorsNeeded) и предложи естественную, но ошибочную подмену (слово-самозванца).',
        'Уровень 1: заметная смысловая подмена в стиле Библии (антоним или слово из другого контекста), 2 неверных варианта.',
        'Уровень 2: тонкая подмена (близкий библейский синоним, другое число или предлог/союз), ровно 2 дополнительных правдоподобных неверных варианта (distractors).',
        'Уровень 3: очень коварная подмена (очень близкое по смыслу слово, соседний падеж/время или близкая библейская форма), ровно 3 дополнительных неверных варианта (distractors).',
        'Требования:',
        '- Выбирай только содержательные слова (длина от 3 букв, не знаки препинания).',
        '- Поле original должно в точности совпадать со словом под индексом wordIndex.',
        '- Поле impostor — ОДНО слово без знаков препинания, отличное от original, грамматически вписывающееся в фразу, чтобы её нельзя было легко угадать по нарушенному согласованию.',
        '- Поле distractors — массив из 2–3 других отдельных слов-ловушек, отличных от original (impostor можно включить в distractors).',
        '- Возвращай строгий JSON по схеме.',
      ].join('\n')

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptLines.join('\n\n'),
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    errors: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          wordIndex: { type: Type.INTEGER },
                          original: { type: Type.STRING },
                          impostor: { type: Type.STRING },
                          distractors: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                        required: ['wordIndex', 'original', 'impostor', 'distractors'],
                      },
                    },
                  },
                  required: ['key', 'errors'],
                },
              },
            },
            required: ['results'],
          },
        },
      })

      const parsed = JSON.parse((response.text ?? '{"results":[]}').trim()) as {
        results?: {
          key: string
          errors: {
            wordIndex: number
            original: string
            impostor: string
            distractors: string[]
          }[]
        }[]
      }

      res.json({ results: Array.isArray(parsed.results) ? parsed.results : [] })
    } catch (err) {
      console.warn('[AI proofread fallback]', err instanceof Error ? err.message : String(err))
      res.json({ results: [], fallback: true })
    }
  })

  const pushStore = loadOrInitPushStore()
  const vapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:reminders@memo-bible.app'
  webpush.setVapidDetails(vapidSubject, pushStore.vapidKeys.publicKey, pushStore.vapidKeys.privateKey)

  let pushTickRunning = false
  async function runPushSchedulerTick() {
    if (pushTickRunning) return
    pushTickRunning = true
    try {
      const now = Date.now()
      let dirty = false
      const entries = Object.entries(pushStore.clients)
      for (const [clientId, client] of entries) {
        const dueList = evaluateDuePushNotifications(
          {
            settings: client.settings,
            snapshot: client.snapshot,
            subscribedAt: client.subscribedAt,
            sentLog: client.sentLog,
          },
          now,
        )
        if (dueList.length === 0) continue

        for (const msg of dueList) {
          try {
            await webpush.sendNotification(
              client.subscription,
              JSON.stringify({
                title: msg.title,
                body: msg.body,
                url: msg.url,
                tag: msg.tag,
              }),
            )
            client.sentLog.push({
              key: msg.dedupeKey,
              kind: msg.kind,
              dateKey: localDateKey(now, client.snapshot.timezone),
              sentAt: now,
            })
            if (client.sentLog.length > 40) {
              client.sentLog = client.sentLog.slice(-40)
            }
            dirty = true
          } catch (err: unknown) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? Number((err as { statusCode?: number }).statusCode)
                : 0
            if (statusCode === 404 || statusCode === 410) {
              delete pushStore.clients[clientId]
              dirty = true
              break
            }
            console.warn('[Push send error]', err instanceof Error ? err.message : String(err))
          }
        }
      }
      if (dirty) savePushStore(pushStore)
    } finally {
      pushTickRunning = false
    }
  }

  app.get('/api/push/vapid-key', (_req, res) => {
    res.json({ publicKey: pushStore.vapidKeys.publicKey })
  })

  app.post('/api/push/subscribe', (req, res) => {
    const body = req.body as {
      clientId?: string
      subscription?: WebPushSubscription
      settings?: Partial<ReminderSettings>
      snapshot?: ReminderSnapshot
    } | undefined

    if (!body?.clientId || !body.subscription?.endpoint || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) {
      res.status(400).json({ error: 'Invalid push subscription payload' })
      return
    }

    const prev = pushStore.clients[body.clientId]
    const mergedSettings: ReminderSettings = {
      ...DEFAULT_REMINDER_SETTINGS,
      ...(prev?.settings ?? {}),
      ...(body.settings ?? {}),
    }
    const snapshot: ReminderSnapshot = body.snapshot ?? prev?.snapshot ?? {
      timezone: 'UTC',
      lastLessonDateKey: null,
      streak: 0,
      verseSchedule: [],
      updatedAt: Date.now(),
    }

    pushStore.clients[body.clientId] = {
      clientId: body.clientId,
      subscription: body.subscription,
      settings: mergedSettings,
      snapshot,
      subscribedAt: prev?.subscribedAt ?? Date.now(),
      sentLog: prev?.sentLog ?? [],
    }
    savePushStore(pushStore)
    res.json({ ok: true })
  })

  app.post('/api/push/unsubscribe', (req, res) => {
    const body = req.body as { clientId?: string; endpoint?: string } | undefined
    let removed = false
    if (body?.clientId && pushStore.clients[body.clientId]) {
      delete pushStore.clients[body.clientId]
      removed = true
    }
    if (body?.endpoint) {
      for (const [id, c] of Object.entries(pushStore.clients)) {
        if (c.subscription.endpoint === body.endpoint) {
          delete pushStore.clients[id]
          removed = true
        }
      }
    }
    if (removed) savePushStore(pushStore)
    res.json({ ok: true })
  })

  app.post('/api/push/test', async (req, res) => {
    const body = req.body as { clientId?: string; snapshot?: ReminderSnapshot } | undefined
    const client = body?.clientId ? pushStore.clients[body.clientId] : undefined
    if (!client) {
      res.status(404).json({ error: 'Подписка не найдена — включите уведомления ещё раз' })
      return
    }

    const snap = body?.snapshot ?? client.snapshot
    const payload = buildTestPushPayload(snap, Date.now())
    try {
      await webpush.sendNotification(client.subscription, JSON.stringify(payload))
      res.json({ ok: true })
    } catch (err: unknown) {
      const statusCode =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0
      if (statusCode === 404 || statusCode === 410) {
        delete pushStore.clients[client.clientId]
        savePushStore(pushStore)
        res.status(410).json({ error: 'Подписка устарела, включите уведомления заново' })
        return
      }
      res.status(500).json({ error: 'Ошибка отправки Push-уведомления' })
    }
  })

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        ws: { server: httpServer },
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distDir = path.resolve(__dirname, 'dist')
    app.use(express.static(distDir))
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html')
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile)
      } else {
        res.status(404).send('Build output not found')
      }
    })
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`)
  })

  const initialTick = setTimeout(() => void runPushSchedulerTick(), 5000)
  const intervalTick = setInterval(() => void runPushSchedulerTick(), 60_000)
  initialTick.unref?.()
  intervalTick.unref?.()
}

startServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
