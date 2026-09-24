import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  serviceUrl: 'http://127.0.0.1:8787',
  defaultFormat: 'mp4',
  defaultQuality: '1080',
  confirmBeforeDownload: false,
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch)
}

export function normalizeServiceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}