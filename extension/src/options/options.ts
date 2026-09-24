import type { Settings } from '../shared/types'
import { getSettings, normalizeServiceUrl, setSettings } from '../shared/settings'
import { applyTheme } from '../shared/theme'

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const els = {
  serviceUrl: $<HTMLInputElement>('service-url'),
  defaultFormat: $<HTMLSelectElement>('default-format'),
  defaultQuality: $<HTMLInputElement>('default-quality'),
  theme: $<HTMLSelectElement>('theme'),
  save: $<HTMLButtonElement>('save'),
  saved: $<HTMLElement>('saved'),
}

init()

async function init(): Promise<void> {
  const settings = await getSettings()
  els.serviceUrl.value = settings.serviceUrl
  els.defaultFormat.value = settings.defaultFormat
  els.defaultQuality.value = settings.defaultQuality
  els.theme.value = settings.theme

  applyTheme(settings.theme)
  els.theme.addEventListener('change', () => {
    applyTheme(els.theme.value as Settings['theme'])
  })

  els.save.addEventListener('click', async () => {
    const next: Settings = {
      serviceUrl: normalizeServiceUrl(els.serviceUrl.value) || settings.serviceUrl,
      defaultFormat: els.defaultFormat.value,
      defaultQuality: els.defaultQuality.value.trim() || '1080',
      theme: els.theme.value as Settings['theme'],
    }
    await setSettings(next)
    els.saved.hidden = false
    window.setTimeout(() => (els.saved.hidden = true), 2000)
  })
}