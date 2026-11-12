import React, { useState } from 'react'
import { Download, Share2, Smartphone, X } from 'lucide-react'
import { usePWAInstall } from './usePWAInstall'

interface PWAInstallButtonProps {
  className?: string
  showWhenInstalled?: boolean
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  showWhenInstalled = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall()
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  if (isInstalled && !showWhenInstalled) {
    return null
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install()
    } else if (isIOS) {
      setShowIOSGuide(true)
    } else {
      // Браузер без прямого prompt, показываем подсказку
      setShowIOSGuide(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`flex items-center gap-2 rounded-xl bg-blue-600/90 hover:bg-blue-600 active:scale-98 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-all ${className}`}
        aria-label="Установить приложение на телефон"
      >
        <Download size={16} />
        <span>Установить приложение</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#141d30] border border-slate-700/60 p-5 text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="text-blue-400" size={20} />
                <h3 className="font-semibold text-white text-base">
                  Установка на телефон
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3.5 space-y-3 text-sm">
              {isIOS ? (
                <>
                  <p className="text-slate-300">
                    Чтобы запускать приложение без интернета прямо с экрана «Домой»:
                  </p>
                  <div className="space-y-2 rounded-xl bg-slate-900/60 p-3.5 border border-slate-800/80 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        1
                      </span>
                      <span>
                        Нажмите кнопку <strong className="text-white">«Поделиться»</strong>{' '}
                        <Share2 className="inline w-3.5 h-3.5 text-blue-400 align-text-bottom" /> в нижней панели Safari.
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
                        Нажмите <strong className="text-white">«Добавить»</strong> в правом верхнем углу.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-slate-300">
                    Чтобы установить приложение на главный экран и открывать его даже без интернета:
                  </p>
                  <div className="space-y-2 rounded-xl bg-slate-900/60 p-3.5 border border-slate-800/80 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-semibold">
                        1
                      </span>
                      <span>
                        Откройте меню браузера (кнопка <strong className="text-white">⋮</strong> вверху справа).
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
              <p className="text-xs text-emerald-400/90 pt-1">
                ✓ После этого иконка появится на рабочем столе, а все стихи будут открываться полностью офлайн!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-200 transition"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  )
}
