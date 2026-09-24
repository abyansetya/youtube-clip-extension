import type { Settings, ThemePreference } from './types'

export type Theme = 'dark' | 'light'

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function effectiveTheme(pref: ThemePreference): Theme {
  return pref === 'system' ? systemTheme() : pref
}

export function applyTheme(pref: ThemePreference): Theme {
  const value = effectiveTheme(pref)
  document.documentElement.dataset.theme = value
  return value
}

export function watchSystemTheme(onChange: (theme: Theme) => void): void {
  const media = window.matchMedia('(prefers-color-scheme: light)')
  media.addEventListener('change', () => onChange(media.matches ? 'light' : 'dark'))
}