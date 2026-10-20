import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && preference.matches)
      document.documentElement.classList.toggle('dark', isDark)
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    }

    applyTheme()
    preference.addEventListener('change', applyTheme)
    return () => preference.removeEventListener('change', applyTheme)
  }, [theme])

  return { theme, setTheme }
}
