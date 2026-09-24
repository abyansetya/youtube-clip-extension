import type { StreamInfo, VideoInfo } from '../shared/types'

const PAGE_EVENT = 'clip:player-response'
const RESPONSE_VAR = 'ytInitialPlayerResponse'
const MAX_POLL_TRIES = 50
const POLL_INTERVAL_MS = 100

interface RawFormat {
  itag?: number
  mimeType?: string
  width?: number
  height?: number
  fps?: number
  bitrate?: number
  contentLength?: string
}

interface RawPlayerResponse {
  videoDetails?: {
    videoId?: string
    title?: string
    lengthSeconds?: string
    thumbnail?: { thumbnails?: { url?: string }[] }
  }
  streamingData?: {
    formats?: RawFormat[]
    adaptiveFormats?: RawFormat[]
  }
}

/**
 * Resolves the current YouTube video and its stream list.
 *
 * All YouTube-specific parsing lives here so it can be updated (or swapped)
 * without touching the rest of the application.
 *
 * Resolution strategy:
 *  1. Inject a page-context script that reads `window.ytInitialPlayerResponse`
 *     and forwards it via a DOM CustomEvent (content scripts run in an
 *     isolated world and cannot read page globals directly).
 *  2. Fallback: read the video id from the URL and metadata from the page
 *     (title, player API, <video> element). No stream list in this path — the
 *     processing service supplies formats from the id.
 */
export class YouTubeStreamResolver {
  async resolve(timeoutMs = 5000): Promise<VideoInfo | null> {
    const raw = await this.readPlayerResponse(timeoutMs)
    if (raw) {
      const parsed = this.parse(raw)
      if (parsed) return parsed
    }
    return this.readFromPage()
  }

  private async readPlayerResponse(timeoutMs: number): Promise<RawPlayerResponse | null> {
    return new Promise((resolve) => {
      let el: HTMLScriptElement | null = null

      const cleanup = () => {
        window.clearTimeout(timer)
        document.removeEventListener(PAGE_EVENT, onEvent)
        el?.remove()
      }

      const onEvent = (e: Event) => {
        const detail = (e as CustomEvent<RawPlayerResponse | null>).detail
        cleanup()
        resolve(detail && detail.videoDetails ? detail : null)
      }

      const timer = window.setTimeout(() => {
        cleanup()
        resolve(null)
      }, timeoutMs)

      document.addEventListener(PAGE_EVENT, onEvent)

      el = document.createElement('script')
      el.textContent = `
        (() => {
          const send = () => {
            const data = window.${RESPONSE_VAR} || null
            document.dispatchEvent(new CustomEvent('${PAGE_EVENT}', { detail: data }))
          }
          if (window.${RESPONSE_VAR}) { send(); return }
          let tries = 0
          const iv = setInterval(() => {
            tries++
            if (window.${RESPONSE_VAR}) { clearInterval(iv); send() }
            else if (tries > ${MAX_POLL_TRIES}) { clearInterval(iv); send() }
          }, ${POLL_INTERVAL_MS})
        })();
      `
      ;(document.head || document.documentElement).appendChild(el)
    })
  }

  private parse(data: RawPlayerResponse): VideoInfo | null {
    const vd = data.videoDetails
    if (!vd?.videoId) return null

    const all: RawFormat[] = [
      ...(data.streamingData?.formats ?? []),
      ...(data.streamingData?.adaptiveFormats ?? []),
    ]
    const streams: StreamInfo[] = all.map((f) => {
      const mimeType = f.mimeType ?? ''
      const container = (mimeType.match(/^[^/;]+/) ?? [''])[0].toLowerCase()
      const codec = (mimeType.match(/codecs="([^"]+)"/) ?? ['', ''])[1]
      return {
        itag: f.itag ?? 0,
        mimeType,
        container,
        codec,
        width: f.width,
        height: f.height,
        fps: f.fps,
        bitrate: f.bitrate,
        hasVideo: Boolean(f.width && f.height),
        hasAudio: mimeType.includes('audio'),
        contentLength: Number(f.contentLength ?? 0),
      }
    })

    const thumbs = vd.thumbnail?.thumbnails ?? []
    const thumbnail =
      thumbs.length > 0 ? (thumbs[thumbs.length - 1].url ?? '') : ''

    return {
      id: vd.videoId,
      title: vd.title ?? '',
      duration: Number(vd.lengthSeconds ?? 0),
      thumbnail,
      streams,
    }
  }

  /** URL-based fallback: id from the URL, metadata from the page. */
  private readFromPage(): VideoInfo | null {
    const videoId = this.videoIdFromUrl()
    if (!videoId) return null

    let title = ''
    let duration = 0

    const player = document.getElementById('movie_player') as
      | (HTMLElement & {
          getVideoData?: () => { video_id?: string; title?: string }
          getDuration?: () => number
        })
      | null
    const playerData = player?.getVideoData?.()
    if (playerData?.video_id === videoId && playerData.title) {
      title = playerData.title
    } else {
      title = document.title
        .replace(/\s*[-–—]\s*YouTube\s*$/, '')
        .trim()
    }
    if (typeof player?.getDuration === 'function') {
      const d = Number(player.getDuration())
      if (Number.isFinite(d) && d > 0) duration = d
    }
    if (!duration) {
      const videoEl = document.querySelector('video') as HTMLVideoElement | null
      if (videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        duration = videoEl.duration
      }
    }

    return {
      id: videoId,
      title: title || videoId,
      duration,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      streams: [],
    }
  }

  private videoIdFromUrl(): string | null {
    try {
      const url = new URL(location.href)
      const v = url.searchParams.get('v')
      if (v && /^[\w-]{6,}$/.test(v)) return v
      const shorts = url.pathname.match(/^\/shorts\/([\w-]{6,})/)
      if (shorts) return shorts[1]
      const embed = url.pathname.match(/^\/embed\/([\w-]{6,})/)
      if (embed) return embed[1]
    } catch {
      return null
    }
    return null
  }
}