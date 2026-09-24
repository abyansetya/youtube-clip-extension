import type { Settings } from '../shared/types'
import { getSettings, normalizeServiceUrl, setSettings } from '../shared/settings'

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const els = {
  serviceUrl: $<HTMLInputElement>('service-url'),
  defaultFormat: $<HTMLSelectElement>('default-format'),
  defaultQuality: $<HTMLInputElement>('default-quality'),
  confirm: $<HTMLInputElement>('confirm'),
  save: $<HTMLButtonElement>('save'),
  saved: $<HTMLElement>('saved'),
}

init()

async function init(): Promise<void> {
  const settings = await getSettings()
  els.serviceUrl.value = settings.serviceUrl
  els.defaultFormat.value = settings.defaultFormat
  els.defaultQuality.value = settings.defaultQuality
  els.confirm.checked = settings.confirmBeforeDownload

  els.save.addEventListener('click', async () => {
    const next: Settings = {
      serviceUrl: normalizeServiceUrl(els.serviceUrl.value) || settings.serviceUrl,
      defaultFormat: els.defaultFormat.value,
      defaultQuality: els.defaultQuality.value.trim() || '1080',
      confirmBeforeDownload: els.confirm.checked,
    }
    await setSettings(next)
    els.saved.hidden = false
    window.setTimeout(() => (els.saved.hidden = true), 2000)
  })
}