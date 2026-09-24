import type { RuntimeMessage } from '../shared/messages'
import { YouTubeStreamResolver } from './youTubeStreamResolver'

const resolver = new YouTubeStreamResolver()

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type !== 'GET_VIDEO_INFO') return

    resolver
      .resolve()
      .then((video) => {
        console.debug('[comot] resolver result:', video)
        sendResponse({
          type: 'GET_VIDEO_INFO_RESULT',
          video,
          error: video
            ? undefined
            : 'This page is not a YouTube video (or video data is unavailable)',
        })
      })
      .catch((err: unknown) => {
        console.error('[comot] resolver error:', err)
        sendResponse({
          type: 'GET_VIDEO_INFO_RESULT',
          video: null,
          error: (err as Error).message,
        })
      })
    return true
  },
)