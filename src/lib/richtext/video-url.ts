export type SafeVideo = {
  provider: 'youtube' | 'vimeo'
  src: string
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

function normalizeYouTubeUrl(url: URL): SafeVideo | null {
  if (url.protocol !== 'https:') return null

  const host = normalizeHost(url.hostname)
  let videoId: string | null = null

  if (host === 'youtu.be') {
    videoId = url.pathname.replace(/^\//, '').split('/')[0] || null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    videoId = url.searchParams.get('v')
    if (!videoId) {
      const match = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})(?:\/)?$/)
      videoId = match?.[1] || null
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null

  return {
    provider: 'youtube',
    src: `https://www.youtube-nocookie.com/embed/${videoId}`,
  }
}

function normalizeVimeoUrl(url: URL): SafeVideo | null {
  if (url.protocol !== 'https:') return null

  const host = normalizeHost(url.hostname)
  let videoId: string | null = null

  if (host === 'player.vimeo.com') {
    videoId = url.pathname.match(/^\/video\/(\d+)(?:\/)?$/)?.[1] || null
  } else if (host === 'vimeo.com') {
    videoId = url.pathname.match(/^\/(\d+)(?:\/)?$/)?.[1] || null
  }

  if (!videoId) return null

  return {
    provider: 'vimeo',
    src: `https://player.vimeo.com/video/${videoId}`,
  }
}

export function normalizeVideoEmbedUrl(rawUrl: string): SafeVideo | null {
  try {
    const url = new URL(rawUrl)
    return normalizeYouTubeUrl(url) || normalizeVimeoUrl(url)
  } catch {
    return null
  }
}
