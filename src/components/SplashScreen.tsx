import React, { useEffect, useState } from 'react'

export const SplashScreen: React.FC = () => {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // Небольшая задержка для плавного появления интерфейса
    const fadeTimer = setTimeout(() => {
      setFading(true)
    }, 600)

    const hideTimer = setTimeout(() => {
      setVisible(false)
    }, 950)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0b111e] transition-opacity duration-350 select-none ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'radial-gradient(circle at 50% 45%, rgba(245, 158, 11, 0.08) 0%, rgba(11, 17, 30, 1) 70%)',
      }}
    >
      {/* Контейнер иконки с аурой */}
      <div className="relative mb-6 flex items-center justify-center">
        {/* Мягкое золотое свечение */}
        <div className="absolute -inset-4 rounded-3xl bg-amber-500/20 blur-xl animate-pulse" />
        
        {/* Сама иконка с Библией */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0f172a] shadow-2xl shadow-amber-950/40 p-1">
          <img
            src="/pwa-192x192.png"
            alt="Библия"
            className="h-24 w-24 object-contain rounded-xl"
            width={96}
            height={96}
          />
        </div>
      </div>

      {/* Название приложения */}
      <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 drop-shadow-sm uppercase">
        Наизусть
      </h1>

      {/* Библейская цитата / подзаголовок */}
      <p className="mt-2 text-xs font-medium text-slate-400/90 tracking-wide text-center px-6">
        «Слово Твоё — светильник ноге моей»
      </p>

      {/* Индикатор загрузки в цветах приложения */}
      <div className="mt-8 w-36 h-1 rounded-full bg-slate-800/80 overflow-hidden relative border border-slate-700/40">
        <div
          className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
          style={{
            animation: 'splashBar 1.2s infinite ease-in-out',
          }}
        />
      </div>

      <span className="mt-3 text-[11px] font-medium text-slate-500/80 tracking-wider">
        Запуск приложения…
      </span>

      <style>{`
        @keyframes splashBar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(50%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}
