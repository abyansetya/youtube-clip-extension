export interface StreamInfo {
  itag: number
  mimeType: string
  container: string
  codec: string
  width?: number
  height?: number
  fps?: number
  bitrate?: number
  hasVideo: boolean
  hasAudio: boolean
  contentLength: number
}

export interface VideoInfo {
  id: string
  title: string
  duration: number
  thumbnail: string
  streams: StreamInfo[]
}

export type FormatKind = 'video' | 'audio'

export interface ResolvedFormat {
  id: string
  kind: FormatKind
  label: string
  container: string
  height?: number
  codec?: string
  note?: string
}

export interface ResolveResponse {
  videoId: string
  title: string
  duration: number
  formats: ResolvedFormat[]
}

export interface DownloadRequest {
  url: string
  formatId: string
  start?: number
  end?: number
}

export type JobStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'processing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  progress: number
  message?: string
  filename?: string
  error?: string
}

export interface Settings {
  serviceUrl: string
  defaultFormat: string
  defaultQuality: string
  confirmBeforeDownload: boolean
}

export interface HealthResponse {
  ok: boolean
  ffmpeg: boolean
  version: string
}