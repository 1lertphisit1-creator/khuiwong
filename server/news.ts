export type NewsPost = {
  id: string
  text: string
  createdAt: string
  url: string
}

export type NewsConfig = {
  facebookPage: string
  xHandle: string
  xUrl: string
  xApi: boolean
}

const DEFAULT_FACEBOOK = 'https://www.facebook.com/bitcoin.chiangrai'
const DEFAULT_HANDLE = 'WatcherGuru'

export function newsConfig(): NewsConfig {
  const facebook = process.env.NEWS_FACEBOOK_PAGE?.trim() || DEFAULT_FACEBOOK
  const handle = (process.env.NEWS_X_HANDLE?.trim() || DEFAULT_HANDLE).replace(/^@/, '')
  const facebookPage = /^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.\-]+\/?$/.test(facebook) ? facebook : DEFAULT_FACEBOOK
  const xHandle = /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : DEFAULT_HANDLE
  return {
    facebookPage,
    xHandle,
    xUrl: `https://x.com/${xHandle}`,
    xApi: Boolean(process.env.X_BEARER_TOKEN?.trim()),
  }
}

type TweetPayload = {
  data?: { id: string; text: string; created_at?: string }[]
}

export class NewsFeed {
  posts: NewsPost[] = []
  private userId = ''
  private timer: ReturnType<typeof setInterval> | null = null
  private warned = false
  private onPosts: (posts: NewsPost[]) => void

  constructor(onPosts: (posts: NewsPost[]) => void) {
    this.onPosts = onPosts
  }

  start() {
    if (!newsConfig().xApi) {
      console.log('[news] X API poller off (X_BEARER_TOKEN not set)')
      return
    }
    void this.poll()
    this.timer = setInterval(() => void this.poll(), 60_000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  private async poll() {
    const token = process.env.X_BEARER_TOKEN?.trim()
    const handle = newsConfig().xHandle
    if (!token) return
    try {
      if (!this.userId) {
        const user = await this.x<{ data?: { id?: string } }>(`/2/users/by/username/${handle}`, token)
        if (!user?.data?.id) return
        this.userId = user.data.id
      }
      const tweets = await this.x<TweetPayload>(
        `/2/users/${this.userId}/tweets?max_results=5&tweet.fields=created_at&exclude=replies`,
        token,
      )
      const next = (tweets?.data ?? []).map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        url: `https://x.com/${handle}/status/${tweet.id}`,
      }))
      if (next.length === 0) return
      const changed = next[0]?.id !== this.posts[0]?.id || next.length !== this.posts.length
      this.posts = next
      if (changed) this.onPosts(next)
    } catch (error) {
      if (!this.warned) {
        console.warn('[news] X API poll failed', error instanceof Error ? error.message : error)
        this.warned = true
      }
    }
  }

  private async x<T>(path: string, token: string): Promise<T | null> {
    for (const host of ['https://api.x.com', 'https://api.twitter.com']) {
      const response = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.ok) return (await response.json()) as T
      if (response.status === 401 || response.status === 403) return null
    }
    return null
  }
}
