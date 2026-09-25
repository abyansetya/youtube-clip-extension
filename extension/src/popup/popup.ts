import type {
  RuntimeMessage,
} from '../shared/messages'
import type {
  DownloadRequest,
  JobStatusResponse,
  ResolvedFormat,
  ResolveResponse,
  Settings,
  VideoInfo,
} from '../shared/types'
import { formatTime, parseTime, WATCH_URL } from '../shared/messages'
import { getSettings, normalizeServiceUrl, setSettings } from '../shared/settings'
import { applyTheme, watchSystemTheme, type Theme } from '../shared/theme'

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const els = {
  serviceStatus: $<HTMLSpanElement>('service-status'),
  videoInfo: $<HTMLElement>('video-info'),
  thumb: $<HTMLImageElement>('thumb'),
  title: $<HTMLElement>('title'),
  duration: $<HTMLElement>('duration'),
  emptyState: $<HTMLElement>('empty-state'),
  loading: $<HTMLElement>('loading'),
  loadingText: $<HTMLElement>('loading-text'),
  form: $<HTMLFormElement>('download-form'),
  format: $<HTMLSelectElement>('format'),
  quality: $<HTMLSelectElement>('quality'),
  start: $<HTMLInputElement>('start'),
  end: $<HTMLInputElement>('end'),
  downloadBtn: $<HTMLButtonElement>('download'),
  confirmRow: $<HTMLElement>('confirm-row'),
  confirmCancel: $<HTMLButtonElement>('confirm-cancel'),
  confirmYes: $<HTMLButtonElement>('confirm-yes'),
  progress: $<HTMLElement>('progress'),
  bar: $<HTMLProgressElement>('bar'),
  statusText: $<HTMLElement>('status-text'),
  saveFileBtn: $<HTMLButtonElement>('save-file'),
  cancelBtn: $<HTMLButtonElement>('cancel'),
  themeToggle: $<HTMLButtonElement>('theme-toggle'),
  openOptions: $<HTMLAnchorElement>('open-options'),
}

const SESSION_JOB_KEY = 'activeJobId'

let settings: Settings = await getSettings()
let video: VideoInfo | null = null
let formats: ResolvedFormat[] = []
let activeJob: JobStatusResponse | null = null
let pollTimer: number | undefined
let currentTheme: Theme

init()

function init(): void {
  els.openOptions.addEventListener('click', (e) => {
    e.preventDefault()
    void chrome.runtime.openOptionsPage()
  })

  els.themeToggle.addEventListener('click', () => {
    const next: Settings['theme'] = currentTheme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    settings.theme = next
    void setSettings({ theme: next })
  })
  watchSystemTheme(() => {
    if (settings.theme === 'system') setTheme('system')
  })

  els.format.addEventListener('change', () => renderQualityOptions())
  els.downloadBtn.addEventListener('click', startDownload)
  els.confirmYes.addEventListener('click', () => void startDownloadJob())
  els.confirmCancel.addEventListener('click', () => {
    showDownloadButton()
    validateForm()
  })
  els.saveFileBtn.addEventListener('click', () => {
    if (activeJob) void startBrowserDownload(activeJob)
  })
  els.cancelBtn.addEventListener('click', () => void cancelDownload())
  els.start.addEventListener('input', validateForm)
  els.end.addEventListener('input', validateForm)

  setTheme(settings.theme)
  void refresh()
}

function setTheme(pref: Settings['theme']): void {
  currentTheme = applyTheme(pref)
  els.themeToggle.textContent = currentTheme === 'dark' ? '☀' : '☾'
  els.themeToggle.title =
    currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
}

function setBadge(text: string): void {
  if (text) {
    void chrome.action.setBadgeText({ text }).catch(() => undefined)
    void chrome.action.setBadgeBackgroundColor({ color: '#3ea6ff' }).catch(() => undefined)
  } else {
    void chrome.action.setBadgeText({ text: '' }).catch(() => undefined)
  }
}

function trackJob(jobId: string): void {
  void chrome.runtime
    .sendMessage({ type: 'TRACK_JOB', jobId })
    .catch(() => undefined)
}

function untrackJob(): void {
  void chrome.runtime
    .sendMessage({ type: 'UNTRACK_JOB' })
    .catch(() => undefined)
}

async function rememberJob(jobId: string | null): Promise<void> {
  if (jobId) await chrome.storage.session.set({ [SESSION_JOB_KEY]: jobId })
  else await chrome.storage.session.remove(SESSION_JOB_KEY)
}

async function refresh(): Promise<void> {
  setServiceStatus(await queryServiceStatus())

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const videoId = tab?.url ? videoIdFromUrl(tab.url) : null
  if (!videoId) {
    hideLoading()
    showEmpty('Open a YouTube video, then reopen this popup.')
    return
  }

  showLoading('Loading video…')
  const base = normalizeServiceUrl(settings.serviceUrl)
  try {
    const res = await fetch(`${base}/api/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: WATCH_URL(videoId) }),
    })
    const data = (await res.json().catch(() => null)) as ResolveResponse | null
    if (!res.ok || !data) {
      const detail = (data as { detail?: string } | null)?.detail
      throw new Error(detail ?? `Service error ${res.status}`)
    }
    if (!data.videoId) throw new Error('Service returned no video')

    video = {
      id: data.videoId,
      title: data.title || data.videoId,
      duration: data.duration,
      thumbnail: `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`,
      streams: [],
    }
    formats = data.formats ?? []
    hideLoading()
    showVideo(video)
    renderFormatAndQuality()
    if (!formats.length) {
      setStatusText('This video has no downloadable formats (may be restricted).', true)
    }
    validateForm()
  } catch (err) {
    hideLoading()
    showEmpty(`Could not resolve video: ${(err as Error).message}`)
    return
  }

  // Resume an in-progress download that survived a popup close/reopen.
  const stored = await chrome.storage.session.get(SESSION_JOB_KEY)
  const jobId: string | undefined = stored[SESSION_JOB_KEY]
  if (jobId) {
    els.form.hidden = true
    els.progress.hidden = false
    els.saveFileBtn.hidden = true
    els.cancelBtn.hidden = false
    setStatusText('Resuming download…')
    trackJob(jobId)
    pollJob(jobId)
  } else {
    setBadge('')
  }
}

function videoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const v = u.searchParams.get('v')
    if (v && /^[\w-]{6,}$/.test(v)) return v
    const m = u.pathname.match(/\/(?:shorts|embed)\/([\w-]{6,})/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

async function queryServiceStatus(): Promise<RuntimeMessage> {
  try {
    return (await chrome.runtime.sendMessage({
      type: 'SERVICE_STATUS',
    })) as RuntimeMessage
  } catch {
    return { type: 'SERVICE_STATUS', health: null, error: 'Unreachable' }
  }
}

function setServiceStatus(message: RuntimeMessage): void {
  if (message.type !== 'SERVICE_STATUS') return
  const ok = Boolean(message.health?.ok)
  els.serviceStatus.dataset.state = ok ? 'ok' : 'error'
  els.serviceStatus.textContent = ok
    ? `service ${message.health?.ffmpeg ? 'ready' : 'no ffmpeg'}`
    : 'service offline'
  els.serviceStatus.title = message.error ?? ''
}

function showLoading(text: string): void {
  els.loading.hidden = false
  els.loadingText.textContent = text
  els.emptyState.hidden = true
  els.videoInfo.hidden = true
  els.form.hidden = true
}

function hideLoading(): void {
  els.loading.hidden = true
}

function showEmpty(error?: string): void {
  hideLoading()
  els.emptyState.hidden = false
  els.emptyState.textContent = error ?? 'Open a YouTube video, then reopen this popup.'
  els.videoInfo.hidden = true
  els.form.hidden = true
  els.downloadBtn.disabled = true
}

function showVideo(v: VideoInfo): void {
  hideLoading()
  els.emptyState.hidden = true
  els.videoInfo.hidden = false
  els.form.hidden = false
  els.thumb.src = v.thumbnail
  els.title.textContent = v.title || v.id
  els.duration.textContent = v.duration ? formatTime(v.duration) : '—'
}

function renderFormatAndQuality(): void {
  els.format.value = formats.some((f) => f.kind === 'video')
    ? settings.defaultFormat
    : 'm4a'
  renderQualityOptions()
}

function renderQualityOptions(): void {
  const kind = els.format.value === 'm4a' ? 'audio' : 'video'
  const opts = formats.filter((f) => f.kind === kind)

  els.quality.innerHTML = ''
  if (kind === 'audio' || !opts.length) {
    const o = document.createElement('option')
    o.value = kind === 'audio' ? 'best-audio' : 'best'
    o.textContent =
      kind === 'audio' ? 'Best audio' : formats.some((f) => f.kind === 'video') ? 'Best (auto)' : 'Unavailable'
    els.quality.appendChild(o)
  } else {
    for (const f of opts) {
      const o = document.createElement('option')
      o.value = f.id
      const detail = [f.container, f.codec].filter(Boolean).join(' ')
      o.textContent = detail ? `${f.label} (${detail})` : f.label
      els.quality.appendChild(o)
    }
  }

  if (kind === 'video' && opts.length) {
    const match = opts.find((f) => String(f.height) === settings.defaultQuality)
    if (match) els.quality.value = match.id
  }
  validateForm()
}

function validateForm(): void {
  const hasVideo = Boolean(video)
  const hasFormats = formats.length > 0
  const start = parseTime(els.start.value)
  const end = parseTime(els.end.value)
  let valid = hasVideo && hasFormats

  if (valid) {
    if (start === undefined && els.start.value.trim() !== '') valid = false
    else if (end === undefined && els.end.value.trim() !== '') valid = false
    else if (start !== undefined && end !== undefined && start >= end) valid = false
    else if (start !== undefined && video && start >= video.duration) valid = false
    else if (end !== undefined && video && end > video.duration) valid = false
  }
  els.downloadBtn.disabled = !valid
  els.confirmYes.disabled = !valid
}

function startDownload(): void {
  if (!video) return
  els.downloadBtn.hidden = true
  els.confirmRow.hidden = false
}

function showDownloadButton(): void {
  els.downloadBtn.hidden = false
  els.confirmRow.hidden = true
}

async function startDownloadJob(): Promise<void> {
  if (!video) return

  const request: DownloadRequest = {
    url: WATCH_URL(video.id),
    formatId: els.quality.value,
    start: parseTime(els.start.value),
    end: parseTime(els.end.value),
  }

  els.form.hidden = true
  els.progress.hidden = false
  els.saveFileBtn.hidden = true
  els.cancelBtn.hidden = false
  els.bar.value = 0
  setStatusText('Starting download…')
  console.debug('[comot] starting download request')

  // Start the job directly against the processing service.
  const base = normalizeServiceUrl(settings.serviceUrl)
  let jobId: string
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(`${base}/api/downloads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      const data = (await res.json().catch(() => null)) as {
        jobId?: string
        detail?: unknown
      } | null
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Service error ${res.status}`,
        )
      }
      if (!data?.jobId) throw new Error('Service did not return a job id')
      jobId = data.jobId
    } finally {
      window.clearTimeout(timeout)
    }
  } catch (err) {
    console.error('[comot] failed to create job:', err)
    els.form.hidden = false
    els.progress.hidden = true
    showDownloadButton()
    validateForm()
    setStatusText(`Failed to start: ${(err as Error).message}`, true)
    return
  }

  console.debug('[comot] job created:', jobId)
  els.bar.value = 1
  setStatusText('Queued — processing on the service…')
  await rememberJob(jobId)
  trackJob(jobId)
  pollJob(jobId)
}

function pollJob(jobId: string): void {
  window.clearInterval(pollTimer)
  pollTimer = window.setInterval(async () => {
    const base = normalizeServiceUrl(settings.serviceUrl)
    try {
      const res = await fetch(`${base}/api/jobs/${jobId}`, { cache: 'no-store' })
      if (res.status === 404) {
        // Job no longer exists on the service (e.g. service restarted).
        window.clearInterval(pollTimer)
        await rememberJob(null)
        untrackJob()
        setBadge('')
        els.progress.hidden = true
        els.saveFileBtn.hidden = true
        els.cancelBtn.hidden = true
        els.form.hidden = false
        showDownloadButton()
        setStatusText('That download job expired — try again.', true)
        return
      }
      if (!res.ok) throw new Error(`Job query failed (${res.status})`)
      const job = (await res.json()) as JobStatusResponse
      console.debug('[comot] job update:', job.status, job.progress)
      onJobUpdate(job)
    } catch (err) {
      console.error('[comot] poll failed:', err)
      window.clearInterval(pollTimer)
      setStatusText(`Cannot reach service: ${(err as Error).message}`, true)
    }
  }, 1000)
}

function onJobUpdate(job: JobStatusResponse): void {
  activeJob = job
  els.bar.value = job.progress
  setStatusText(job.message ?? job.status)
  if (job.status === 'done') {
    window.clearInterval(pollTimer)
    void rememberJob(null)
    untrackJob()
    setBadge('')
    els.cancelBtn.hidden = true
    els.saveFileBtn.hidden = false
    void startBrowserDownload(job)
  } else if (job.status === 'error') {
    window.clearInterval(pollTimer)
    void rememberJob(null)
    untrackJob()
    setBadge('')
    setStatusText(job.error ?? 'Download failed', true)
    els.cancelBtn.hidden = true
  } else if (job.status === 'cancelled') {
    window.clearInterval(pollTimer)
    void rememberJob(null)
    untrackJob()
    setBadge('')
    resetAfterCancel()
  } else {
    setBadge(`${Math.round(job.progress)}%`)
  }
}

async function cancelDownload(): Promise<void> {
  if (!activeJob) return
  const jobId = activeJob.jobId
  window.clearInterval(pollTimer)
  setStatusText('Cancelling…')

  const base = normalizeServiceUrl(settings.serviceUrl)
  try {
    await fetch(`${base}/api/jobs/${jobId}/cancel`, { method: 'POST' })
  } catch (err) {
    console.error('[comot] cancel request failed:', err)
  }
  await rememberJob(null)
  untrackJob()
  setBadge('')
  resetAfterCancel()
}

function resetAfterCancel(): void {
  activeJob = null
  els.progress.hidden = true
  els.saveFileBtn.hidden = true
  els.cancelBtn.hidden = true
  els.form.hidden = false
  showDownloadButton()
  validateForm()
  setStatusText('')
}

async function startBrowserDownload(job: JobStatusResponse): Promise<void> {
  // Tell the background worker we're handling the file (cancels any fallback
  // download it may have scheduled), then start the browser download here.
  void chrome.runtime
    .sendMessage({ type: 'CLAIM_DOWNLOAD', jobId: job.jobId })
    .catch(() => undefined)

  const base = normalizeServiceUrl(settings.serviceUrl)
  try {
    const id = await chrome.downloads.download({
      url: `${base}/api/jobs/${job.jobId}/file`,
      filename: job.filename ?? 'video.mp4',
      saveAs: true,
    })
    console.debug('[comot] download started:', id)
    setStatusText('Done — saving to your downloads…', false)
  } catch (err) {
    console.error('[comot] download trigger failed:', err)
    setStatusText('File ready — click "Save file" to download it', true)
  }
}

function setStatusText(text: string, isError = false): void {
  els.statusText.textContent = text
  els.statusText.style.color = isError ? 'var(--danger)' : ''
}