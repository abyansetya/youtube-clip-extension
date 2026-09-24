import type {
  RuntimeMessage,
} from '../shared/messages'
import type {
  DownloadRequest,
  HealthResponse,
  JobStatusResponse,
  VideoInfo,
} from '../shared/types'
import { getSettings, normalizeServiceUrl } from '../shared/settings'

const POLL_INTERVAL_MS = 1000
const FALLBACK_DOWNLOAD_DELAY_MS = 10_000

const activeJobs = new Map<string, number>()
const pendingDownloads = new Map<string, number>()

async function serviceBase(): Promise<string> {
  const settings = await getSettings()
  return normalizeServiceUrl(settings.serviceUrl)
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

async function getVideoInfo(): Promise<RuntimeMessage> {
  const tabId = await getActiveTabId()
  if (tabId == null) {
    return { type: 'GET_VIDEO_INFO_RESULT', video: null, error: 'No active tab' }
  }
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'GET_VIDEO_INFO',
    })) as RuntimeMessage | null
    if (response?.type === 'GET_VIDEO_INFO_RESULT') return response
    return {
      type: 'GET_VIDEO_INFO_RESULT',
      video: null,
      error: 'No video detected on this tab',
    }
  } catch {
    return {
      type: 'GET_VIDEO_INFO_RESULT',
      video: null,
      error: 'Content script not reachable — refresh the YouTube tab',
    }
  }
}

async function serviceStatus(): Promise<RuntimeMessage> {
  const base = await serviceBase()
  try {
    const res = await fetch(`${base}/api/health`, { cache: 'no-store' })
    const health: HealthResponse = res.ok ? await res.json() : { ok: false, ffmpeg: false, version: '' }
    return { type: 'SERVICE_STATUS', health, error: res.ok ? undefined : `Service responded with ${res.status}` }
  } catch (err) {
    return {
      type: 'SERVICE_STATUS',
      health: null,
      error: (err as Error).message,
    }
  }
}

async function resolveFormats(url: string): Promise<RuntimeMessage> {
  const base = await serviceBase()
  try {
    const res = await fetch(`${base}/api/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : `Service error ${res.status}`
      return { type: 'RESOLVE_FORMATS_RESULT', formats: [], error: detail }
    }
    return {
      type: 'RESOLVE_FORMATS_RESULT',
      formats: data?.formats ?? [],
      error: data?.formats?.length ? undefined : 'No downloadable formats found',
    }
  } catch (err) {
    return {
      type: 'RESOLVE_FORMATS_RESULT',
      formats: [],
      error: (err as Error).message,
    }
  }
}

async function startDownload(request: DownloadRequest): Promise<RuntimeMessage> {
  const base = await serviceBase()
  try {
    const res = await fetch(`${base}/api/downloads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : `Service error ${res.status}`
      return { type: 'START_DOWNLOAD_RESULT', error: detail }
    }
    const jobId: string | undefined = data?.jobId
    if (!jobId) {
      return { type: 'START_DOWNLOAD_RESULT', error: 'Service did not return a job id' }
    }
    pollJob(jobId)
    return { type: 'START_DOWNLOAD_RESULT', jobId }
  } catch (err) {
    return {
      type: 'START_DOWNLOAD_RESULT',
      error: (err as Error).message,
    }
  }
}

function pollJob(jobId: string): void {
  stopPolling(jobId)
  const timer = window.setInterval(() => {
    void tick(jobId)
  }, POLL_INTERVAL_MS)
  activeJobs.set(jobId, timer)
  void tick(jobId)
}

function stopPolling(jobId: string): void {
  const timer = activeJobs.get(jobId)
  if (timer != null) window.clearInterval(timer)
  activeJobs.delete(jobId)
}

async function tick(jobId: string): Promise<void> {
  const base = await serviceBase()
  let job: JobStatusResponse
  try {
    const res = await fetch(`${base}/api/jobs/${jobId}`, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Job query failed (${res.status})`)
    }
    job = await res.json()
  } catch (err) {
    job = {
      jobId,
      status: 'error',
      progress: 0,
      error: (err as Error).message,
    }
  }

  broadcast({ type: 'JOB_UPDATE', job })

  if (job.status === 'done') {
    stopPolling(jobId)
    scheduleFallbackDownload(jobId, job.filename)
  } else if (job.status === 'error') {
    stopPolling(jobId)
  }
}

/**
 * The popup claims the finished file and starts the browser download. If no
 * popup claims it within the grace period (e.g. the popup was closed), the
 * background worker downloads it as a fallback.
 */
function scheduleFallbackDownload(jobId: string, filename?: string): void {
  cancelFallbackDownload(jobId)
  const timer = window.setTimeout(() => {
    pendingDownloads.delete(jobId)
    void triggerDownload(jobId, filename)
  }, FALLBACK_DOWNLOAD_DELAY_MS)
  pendingDownloads.set(jobId, timer)
}

function cancelFallbackDownload(jobId: string): void {
  const timer = pendingDownloads.get(jobId)
  if (timer != null) window.clearTimeout(timer)
  pendingDownloads.delete(jobId)
}

async function triggerDownload(jobId: string, filename?: string): Promise<void> {
  const base = await serviceBase()
  try {
    await chrome.downloads.download({
      url: `${base}/api/jobs/${jobId}/file`,
      filename: filename ?? 'video.mp4',
      saveAs: true,
    })
  } catch (err) {
    console.error('[clip] download trigger failed:', err)
    broadcast({
      type: 'JOB_UPDATE',
      job: {
        jobId,
        status: 'error',
        progress: 100,
        error: 'File ready but the browser download could not be started',
      },
    })
  }
}

function broadcast(message: RuntimeMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined)
}

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    switch (message?.type) {
      case 'GET_VIDEO_INFO':
        void getVideoInfo().then(sendResponse)
        return true
      case 'RESOLVE_FORMATS':
        void resolveFormats(message.url).then(sendResponse)
        return true
      case 'START_DOWNLOAD':
        void startDownload(message.request).then(sendResponse)
        return true
      case 'SERVICE_STATUS':
        void serviceStatus().then(sendResponse)
        return true
      case 'GET_SETTINGS':
        void getSettings().then((settings) =>
          sendResponse({ type: 'SETTINGS', settings }),
        )
        return true
      case 'CLAIM_DOWNLOAD':
        cancelFallbackDownload(message.jobId)
        sendResponse({ type: 'CLAIM_DOWNLOAD_RESULT' })
        return true
    }
  },
)

export {}