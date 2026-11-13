import { useEffect, useState } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    return typeof window !== 'undefined' ? (window.__deferredPWAInstallPrompt ?? null) : null
  })
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
  })
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const checkStandalone = () => {
      const standalone =
        mediaQuery.matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      setIsInstalled(standalone)
    }

    checkStandalone()

    // Определение iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(isIOSDevice)

    // Если событие уже было поймано до монтирования компонента
    if (window.__deferredPWAInstallPrompt) {
      setDeferredPrompt(window.__deferredPWAInstallPrompt)
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      window.__deferredPWAInstallPrompt = promptEvent
      setDeferredPrompt(promptEvent)
    }

    const handleInstallAvailable = () => {
      if (window.__deferredPWAInstallPrompt) {
        setDeferredPrompt(window.__deferredPWAInstallPrompt)
      }
    }

    const handleAppInstalled = () => {
      window.__deferredPWAInstallPrompt = null
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('pwa-install-available', handleInstallAvailable)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('pwa-installed', handleAppInstalled)
    mediaQuery.addEventListener?.('change', checkStandalone)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('pwa-install-available', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('pwa-installed', handleAppInstalled)
      mediaQuery.removeEventListener?.('change', checkStandalone)
    }
  }, [])

  const install = async (): Promise<boolean> => {
    const promptEvent = deferredPrompt ?? window.__deferredPWAInstallPrompt ?? null
    if (!promptEvent) return false

    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice

    // BeforeInstallPromptEvent можно использовать только один раз
    window.__deferredPWAInstallPrompt = null
    setDeferredPrompt(null)

    if (outcome === 'accepted') {
      setIsInstalled(true)
      return true
    }
    return false
  }

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  }
}
