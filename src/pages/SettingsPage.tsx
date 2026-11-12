import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Download,
  HardDrive,
  HelpCircle,
  Info,
  Moon,
  Share2,
  ShieldCheck,
  Sun,
  Smartphone,
  Trash2,
  Type,
  Upload,
  X
} from 'lucide-react'
import { useRef, useState } from 'react'
import { usePWAInstall } from '../components/usePWAInstall'
import { clearAll, countLiveVerses, db, liveVerses } from '../db/db'
import { useSync } from '../sync/SyncProvider'
import { useTheme, type FontSize, type Theme } from '../theme/ThemeContext'
import CloudSection from './CloudSection'

export default function SettingsPage() {
  const { theme, setTheme, fontSize, setFontSize } = useTheme()
  const sync = useSync()
  const verseCount = useLiveQuery(() => countLiveVerses(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall()
  const [showInstallGuide, setShowInstallGuide] = useState(false)

  // Модальные окна
  const [activeModal, setActiveModal] = useState<
    'theme' | 'font' | 'pwa' | 'cloud' | 'method' | 'bible' | 'privacy' | null
  >(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 3000)
  }

  // Экспорт данных в JSON
  async function handleExport() {
    try {
      const allVerses = await db.verses.toArray()
      const allLessons = await db.lessons.toArray()
      const allReviews = await db.reviews.toArray()
      const data = {
        app: 'memo-bible',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        verses: allVerses,
        lessons: allLessons,
        reviews: allReviews,
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memo-bible-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Резервная копия сохранена')
    } catch {
      showToast('Ошибка при экспорте данных')
    }
  }

  // Импорт данных из JSON
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (!json.verses || !Array.isArray(json.verses)) {
        throw new Error('Неверный формат файла')
      }
      if (!confirm(`Импортировать ${json.verses.length} стихов? Существующие данные сохранятся.`)) {
        return
      }
      for (const v of json.verses) {
        await db.verses.put(v)
      }
      if (Array.isArray(json.lessons)) {
        for (const l of json.lessons) await db.lessons.put(l)
      }
      if (Array.isArray(json.reviews)) {
        for (const r of json.reviews) await db.reviews.put(r)
      }
      showToast(`Успешно импортировано ${json.verses.length} стихов!`)
    } catch (err) {
      alert('Ошибка при импорте: проверьте формат JSON файла.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Очистка данных
  async function handleClearAll() {
    if (
      !confirm(
        'Удалить все стихи и весь прогресс? Это действие нельзя отменить. Если подключено облако, стихи удалятся и там.'
      )
    ) {
      return
    }
    await clearAll()
    showToast('Все локальные данные удалены')
  }

  // Поделиться приложением
  async function handleShare() {
    const url = window.location.origin
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Наизусть — заучивание библейских стихов',
          text: 'Приложение для заучивания стихов Библии наизусть с интервальными повторениями!',
          url,
        })
      } catch {
        // cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        showToast('Ссылка скопирована в буфер обмена')
      } catch {
        showToast('Не удалось скопировать')
      }
    }
  }

  const themeLabels: Record<Theme, string> = {
    dark: 'Тёмная',
    light: 'Светлая',
    system: 'Системная',
  }

  const fontLabels: Record<FontSize, string> = {
    normal: 'Обычный',
    large: 'Крупный',
    xlarge: 'Очень крупный',
  }

  return (
    <div className="settings-page">
      {/* Toast уведомление */}
      {toast && <div className="settings-toast">{toast}</div>}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        accept=".json"
        style={{ display: 'none' }}
      />

      {/* Заголовок страницы */}
      <h1 className="settings-page-title">Настройки</h1>

      {/* Hero Badge — точь-в-точь как на скриншоте 2 */}
      <div className="settings-hero">
        <div className="settings-avatar-glow">
          <div className="settings-avatar">
            <BookOpen size={34} strokeWidth={2.2} />
          </div>
        </div>
        <h2 className="settings-app-name">Наизусть</h2>
        <p className="settings-app-subtitle">
          {sync.user?.email ? (
            <span className="text-blue-400">Вход выполнен: {sync.user.email}</span>
          ) : (
            'Заучивание библейских стихов · v1.0.0'
          )}
        </p>
      </div>

      {/* СЕКЦИЯ 1: НАСТРОЙКИ */}
      <div className="settings-group">
        <div className="settings-group-header">НАСТРОЙКИ</div>
        <div className="settings-card">
          {/* Тема оформления */}
          <button
            className="settings-row"
            onClick={() => setActiveModal('theme')}
            aria-label="Выбрать тему оформления"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <span className="settings-row-title">Тема оформления</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">{themeLabels[theme]}</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {/* Размер шрифта */}
          <button
            className="settings-row"
            onClick={() => setActiveModal('font')}
            aria-label="Выбрать размер шрифта"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <Type size={20} />
              </div>
              <span className="settings-row-title">Размер шрифта</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">{fontLabels[fontSize]}</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {/* Офлайн-доступ (PWA) */}
          <button
            className="settings-row"
            onClick={() => setActiveModal('pwa')}
            aria-label="Статус офлайн-доступа"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <HardDrive size={20} />
              </div>
              <span className="settings-row-title">Офлайн-доступ (PWA)</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value active-badge">Активен</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>
        </div>
      </div>

      {/* СЕКЦИЯ 2: ОБЛАКО И ДАННЫЕ */}
      <div className="settings-group">
        <div className="settings-group-header">ОБЛАКО И СИНХРОНИЗАЦИЯ</div>
        <div className="settings-card">
          {/* Синхронизация аккаунта */}
          <button
            className="settings-row"
            onClick={() => setActiveModal('cloud')}
            aria-label="Синхронизация профиля и облака"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon text-blue-400">
                <Cloud size={20} />
              </div>
              <span className="settings-row-title">Синхронизация Supabase</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">
                {sync.user ? 'Подключено' : sync.configured ? 'Войти' : 'Локально'}
              </span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {/* Экспорт данных */}
          <button
            className="settings-row"
            onClick={handleExport}
            aria-label="Экспортировать резервную копию"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <Download size={20} />
              </div>
              <span className="settings-row-title">Экспорт базы стихов</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">JSON</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {/* Импорт данных */}
          <button
            className="settings-row"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Импортировать стихи из файла"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <Upload size={20} />
              </div>
              <span className="settings-row-title">Импорт из файла</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">Загрузить</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {/* Очистить данные */}
          <button
            className="settings-row text-red-400 hover:text-red-300"
            onClick={handleClearAll}
            disabled={!verseCount}
            aria-label="Очистить все сохраненные стихи"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon text-red-400">
                <Trash2 size={20} />
              </div>
              <span className="settings-row-title text-red-400">Очистить все данные</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value text-red-400/80">Сброс</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>
        </div>
      </div>

      {/* СЕКЦИЯ 3: ИНФОРМАЦИЯ */}
      <div className="settings-group">
        <div className="settings-group-header">ИНФОРМАЦИЯ</div>
        <div className="settings-card">
          <button
            className="settings-row"
            onClick={() => setActiveModal('method')}
            aria-label="О методике интервальных повторений"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <HelpCircle size={20} />
              </div>
              <span className="settings-row-title">Методика повторений</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">Алгоритм</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          <button
            className="settings-row"
            onClick={() => setActiveModal('bible')}
            aria-label="О Синодальном переводе Библии"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <BookOpen size={20} />
              </div>
              <span className="settings-row-title">Перевод текста</span>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-value">Синодальный (RST)</span>
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          <button
            className="settings-row"
            onClick={() => setActiveModal('privacy')}
            aria-label="Политика конфиденциальности"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <ShieldCheck size={20} />
              </div>
              <span className="settings-row-title">Конфиденциальность</span>
            </div>
            <div className="settings-row-right">
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>
        </div>
      </div>

      {/* СЕКЦИЯ 4: ПОДДЕРЖКА & УСТАНОВКА */}
      <div className="settings-group">
        <div className="settings-group-header">ПОДДЕРЖКА & УСТАНОВКА</div>
        <div className="settings-card">
          <button
            className="settings-row"
            onClick={handleShare}
            aria-label="Поделиться ссылкой на приложение"
          >
            <div className="settings-row-left">
              <div className="settings-row-icon">
                <Share2 size={20} />
              </div>
              <span className="settings-row-title">Поделиться приложением</span>
            </div>
            <div className="settings-row-right">
              <ChevronRight size={18} className="chevron" />
            </div>
          </button>

          <div className="settings-row-divider" />

          {isInstalled ? (
            <div className="settings-row cursor-default">
              <div className="settings-row-left">
                <div className="settings-row-icon text-emerald-400">
                  <Download size={20} />
                </div>
                <span className="settings-row-title">Приложение установлено</span>
              </div>
              <div className="settings-row-right">
                <span className="settings-row-value text-emerald-400">Готово</span>
              </div>
            </div>
          ) : (
            <button
              className="settings-row"
              onClick={async () => {
                if (isInstallable) {
                  const res = await install()
                  if (res) {
                    showToast('Приложение установлено')
                    return
                  }
                }
                setShowInstallGuide(true)
              }}
              aria-label="Установить приложение на телефон"
            >
              <div className="settings-row-left">
                <div className="settings-row-icon text-blue-400">
                  <Download size={20} />
                </div>
                <span className="settings-row-title">Установить на телефон</span>
              </div>
              <div className="settings-row-right">
                <span className="settings-row-value text-blue-400">Установить</span>
                <ChevronRight size={18} className="chevron" />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* МОДАЛЬНЫЕ ОКНА */}
      {/* 1. Выбор темы */}
      {activeModal === 'theme' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Тема оформления</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body">
              {(['dark', 'light', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  className={`modal-option-row ${theme === t ? 'selected' : ''}`}
                  onClick={() => {
                    setTheme(t)
                    setActiveModal(null)
                  }}
                >
                  <span>{themeLabels[t]}</span>
                  {theme === t && <Check size={18} className="text-blue-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Выбор размера шрифта */}
      {activeModal === 'font' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Размер шрифта</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body">
              {(['normal', 'large', 'xlarge'] as FontSize[]).map((s) => (
                <button
                  key={s}
                  className={`modal-option-row ${fontSize === s ? 'selected' : ''}`}
                  onClick={() => {
                    setFontSize(s)
                    setActiveModal(null)
                  }}
                >
                  <div>
                    <div className="font-medium">{fontLabels[s]}</div>
                    <small className="text-xs text-slate-400">
                      {s === 'normal'
                        ? 'Стандартный размер текста'
                        : s === 'large'
                        ? 'Увеличенный текст для комфортного чтения'
                        : 'Максимальный размер для слабовидящих'}
                    </small>
                  </div>
                  {fontSize === s && <Check size={18} className="text-blue-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Офлайн-доступ PWA */}
      {activeModal === 'pwa' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Офлайн-доступ (PWA)</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body text-slate-300 text-sm space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl border border-amber-500/25">
                <img
                  src="/pwa-192x192.png"
                  alt="Иконка Библии"
                  className="w-14 h-14 rounded-xl object-contain border border-amber-500/30 bg-[#0b111e] shadow-md shadow-amber-950/30"
                />
                <div>
                  <div className="font-bold text-white text-base">Наизусть</div>
                  <div className="text-xs text-amber-400 font-medium">Новая иконка с Библией</div>
                  <div className="text-[11px] text-slate-400">Стильный темный экран запуска</div>
                </div>
              </div>
              <p>
                Приложение разработано по стандарту Progressive Web App (PWA) со встроенным Service Worker.
                Все добавленные стихи, история повторений и интерфейс кэшируются на вашем телефоне.
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 space-y-1.5">
                <div className="font-medium text-emerald-400 flex items-center gap-2">
                  <Check size={16} /> Полная автономность без интернета
                </div>
                <p className="text-xs text-slate-400">
                  Вы можете запускать приложение с главного экрана телефона без интернета — в самолёте,
                  метро или поездках. Все сохранённые стихи и тренировки работают офлайн.
                </p>
              </div>
              {!isInstalled && (
                <button
                  type="button"
                  onClick={async () => {
                    setActiveModal(null)
                    if (isInstallable) {
                      const ok = await install()
                      if (ok) {
                        showToast('Приложение установлено')
                        return
                      }
                    }
                    setShowInstallGuide(true)
                  }}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Download size={16} />
                  Установить на главный экран
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Облако и профиль Supabase */}
      {activeModal === 'cloud' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Синхронизация профиля</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body">
              <CloudSection />
            </div>
          </div>
        </div>
      )}

      {/* 5. Методика повторений */}
      {activeModal === 'method' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Методика интервальных повторений</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body text-slate-300 text-sm space-y-3">
              <p>
                Приложение использует научный алгоритм интервальных повторений на основе кривой
                забывания Эббингауза:
              </p>
              <ul className="space-y-2 text-xs list-disc pl-4 text-slate-300">
                <li>
                  <strong className="text-blue-400">Сила 0 (Новый):</strong> Первое знакомство —
                  открытие по тапу, скрытый текст, сборка стиха.
                </li>
                <li>
                  <strong className="text-sky-400">Силы 1–3 (Начальный):</strong> Повторение на
                  следующий день, затем через 3 и 7 дней. Ввод пропущенных слов и первые буквы.
                </li>
                <li>
                  <strong className="text-emerald-400">Силы 4–5 (Средний):</strong> Повторение через
                  14 и 30 дней. Свободный ввод стиха по памяти.
                </li>
                <li>
                  <strong className="text-amber-400">Силы 6–7 (Выучено наизусть):</strong> Долгосрочная
                  память. Редкие контрольные повторения раз в несколько месяцев.
                </li>
              </ul>
              <p className="text-xs text-slate-400 mt-2">
                Уроки составляются автоматически: новые стихи сочетаются с теми, которым настало время
                освежения.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6. О переводе */}
      {activeModal === 'bible' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Синодальный перевод (RST)</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body text-slate-300 text-sm space-y-2">
              <p>
                Используется канонический русский Синодальный перевод Библии, включающий все 66 книг
                (39 книг Ветхого Завета и 27 книг Нового Завета).
              </p>
              <p className="text-xs text-slate-400">
                Нумерация стихов и псалмов приведена в соответствие с общепринятыми русскими
                печатными изданиями.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. Конфиденциальность */}
      {activeModal === 'privacy' && (
        <div className="modal-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h3>Конфиденциальность</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body text-slate-300 text-sm space-y-2">
              <p>
                Приложение уважает ваше уединение: мы не собираем личную информацию, не используем
                аналитические трекеры и не передаем данные третьим лицам.
              </p>
              <p>
                Ваши стихи и статистика хранятся исключительно на вашем личном устройстве, либо в
                вашем защищенном аккаунте Supabase при включенной синхронизации.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 8. Подсказка по установке PWA на телефон */}
      {showInstallGuide && (
        <div className="modal-sheet-overlay" onClick={() => setShowInstallGuide(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <div className="flex items-center gap-2">
                <Smartphone size={20} className="text-blue-400" />
                <h3>Установка на телефон</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowInstallGuide(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-sheet-body text-slate-300 text-sm space-y-3">
              <div className="flex items-center gap-3 p-2.5 bg-slate-800/40 rounded-xl border border-slate-700/50">
                <img
                  src="/pwa-192x192.png"
                  alt="Иконка"
                  className="w-11 h-11 rounded-xl object-contain border border-amber-500/30 bg-[#0b111e]"
                />
                <div>
                  <div className="font-semibold text-white text-sm">Наизусть</div>
                  <div className="text-[11px] text-slate-400">Иконка Библии на экране «Домой»</div>
                </div>
              </div>
              {isIOS ? (
                <>
                  <p>
                    Чтобы запускать приложение без интернета прямо с экрана «Домой» iPhone / iPad:
                  </p>
                  <div className="space-y-2 rounded-xl bg-slate-800/70 p-3.5 border border-slate-700/60 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        1
                      </span>
                      <span>
                        Нажмите кнопку <strong className="text-white">«Поделиться»</strong>{' '}
                        <Share2 className="inline w-3.5 h-3.5 text-blue-400 align-text-bottom" /> в панели Safari.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        2
                      </span>
                      <span>
                        Прокрутите список вниз и выберите{' '}
                        <strong className="text-white">«На экран "Домой"»</strong>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        3
                      </span>
                      <span>
                        Нажмите <strong className="text-white">«Добавить»</strong>.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Чтобы запускать приложение без интернета прямо с главного экрана Android:
                  </p>
                  <div className="space-y-2 rounded-xl bg-slate-800/70 p-3.5 border border-slate-700/60 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        1
                      </span>
                      <span>
                        Нажмите на меню браузера Chrome (три точки <strong className="text-white">⋮</strong> в правом верхнем углу).
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        2
                      </span>
                      <span>
                        Выберите пункт <strong className="text-white">«Установить приложение»</strong> или{' '}
                        <strong className="text-white">«Добавить на главный экран»</strong>.
                      </span>
                    </div>
                  </div>
                </>
              )}
              <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/30 text-xs text-emerald-300">
                ✓ Приложение будет открываться в отдельном окне без адресной строки и работать полностью автономно без интернета!
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
