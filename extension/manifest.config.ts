import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Comot — YouTube Downloader & Segment Clipper',
  version: '0.1.0',
  description:
    'Download YouTube videos or segments as MP4 / M4A via a local processing service.',
  minimum_chrome_version: '116',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Comot',
    default_icon: {
      '16': 'icons/16.png',
      '32': 'icons/32.png',
      '48': 'icons/48.png',
      '128': 'icons/128.png',
    },
  },
  icons: {
    '16': 'icons/16.png',
    '32': 'icons/32.png',
    '48': 'icons/48.png',
    '128': 'icons/128.png',
  },
  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: ['*://*.youtube.com/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'tabs', 'downloads'],
  host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
})