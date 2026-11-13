import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { GoogleGenAI, Type } from '@google/genai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3000
const isProd = process.env.NODE_ENV === 'production'

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
}

startServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
