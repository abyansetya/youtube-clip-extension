import type {
  VideoInfo,
  ResolvedFormat,
  DownloadRequest,
  JobStatusResponse,
  Settings,
  HealthResponse,
} from './types'

export type RuntimeMessage =
  | { type: 'GET_VIDEO_INFO' }
  | { type: 'GET_VIDEO_INFO_RESULT'; video: VideoInfo | null; error?: string }
  | { type: 'RESOLVE_FORMATS'; url: string }
  | {
      type: 'RESOLVE_FORMATS_RESULT'
      formats: ResolvedFormat[]
      error?: string
    }
  | { type: 'START_DOWNLOAD'; request: DownloadRequest }
  | { type: 'START_DOWNLOAD_RESULT'; jobId?: string; error?: string }
  | { type: 'JOB_UPDATE'; job: JobStatusResponse }
  | { type: 'CLAIM_DOWNLOAD'; jobId: string }
  | { type: 'CLAIM_DOWNLOAD_RESULT' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SETTINGS'; settings: Settings }
  | { type: 'SERVICE_STATUS'; health: HealthResponse | null; error?: string }

export function sendToBackground(
  message: RuntimeMessage,
): Promise<RuntimeMessage> {
  return chrome.runtime.sendMessage(message)
}

export function sendToTab(
  tabId: number,
  message: RuntimeMessage,
): Promise<RuntimeMessage> {
  return chrome.tabs.sendMessage(tabId, message)
}

export const WATCH_URL = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`

export function parseTime(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  const parts = trimmed.split(':').map((p) => Number(p))
  if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return NaN
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}