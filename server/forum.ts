import { createHash } from 'node:crypto'
import express, { type Express, type Request, type Response } from 'express'
import { accountFromToken, isSiteOwnerAccount, nicknameKey, siteOwnerUsername } from './auth.ts'
import { activityRankById, activityRankForPosts, ACTIVITY_RANKS, type ActivityRank } from './activityRanks.ts'
import { parseNameColor, storedHex } from './color.ts'
import {
  avatarStamp,
  findAccountById,
  findAccountByKey,
  getMember,
  getRankColors,
  isAccountBanned,
  sqlite,
  updateAccountNameColor,
  usingPostgres,
} from './db.ts'
import { forumOnlineSnapshot } from './presence.ts'
import { isRankId, rankLabel, rankLevel, type RankId } from './ranks.ts'

const FORUM_ROOM = 'MAIN'
const TOPIC_PAGE = 20
const POST_PAGE = 15
const DEFAULT_SITE_NAME = 'Bitcoin'
const DEFAULT_FORUM_NAME = 'Bitcoin'
const lastPostAt = new Map<string, number>()
const viewSeen = new Map<string, number>()

type Hub = { emit: (event: string, payload: unknown) => void }

export type ForumAuthor = {
  accountId: string | null
  name: string
  rank: RankId
  rankLabel: string
  color: string
  avatarUrl: string | null
  posts: number
  signature: string
  activity: ActivityView | null
}

export type ForumPost = {
  id: number
  topicId: number
  body: string
  createdAt: number
  updatedAt: number | null
  author: ForumAuthor
}

export type ForumMe = {
  accountId: string | null
  name: string
  rank: RankId
  rankLabel: string
  color: string
  nameColor: string | null
  colorLocked: boolean
  avatarUrl: string | null
  posts: number
  signature: string
  canPost: boolean
  canModerate: boolean
  canRename: boolean
  guestPosting: boolean
  textMuted: boolean
  postBlock: string | null
  activity: ActivityView | null
  promotion: { title: string; nickname: string } | null
}

type ActivityView = {
  id: string
  title: string
  nickname: string
  kind: ActivityRank['kind']
  marks: number
  threshold: number
  overridden: boolean
}

type TopicRow = {
  id: number
  board_id: number
  subject: string
  author_account_id: string | null
  author_name: string
  author_rank: string
  sticky: number
  locked: number
  views: number
  reply_count: number
  created_at: number
  last_post_at: number
  last_poster_name: string
}

type PostRow = {
  id: number
  topic_id: number
  author_account_id: string | null
  author_name: string
  author_rank: string
  body: string
  created_at: number
  updated_at: number | null
}

export function initForum() {
  if (!usingPostgres()) initSqliteForum()
  const categories = sqlite().prepare('SELECT COUNT(*) AS n FROM forum_categories').get() as { n: number }
  if (categories.n === 0) seedForum()
  ensureSetting('guest_posting', '0')
  ensureSetting('site_name', DEFAULT_SITE_NAME)
  ensureSetting('forum_name', DEFAULT_FORUM_NAME)
  removeEtfBoard()
  ensureTrafficTables()
  sqlite()
    .prepare(
      `UPDATE forum_posts SET body = REPLACE(body, ?, ?) WHERE body LIKE ?`,
    )
    .run(
      'กระดานนี้เป็นที่ถาม-ตอบแบบกระทู้ ห้องเสียง ไมค์ แชร์จอ และดีเจอยู่ที่ Live Room',
      'กระดานนี้เป็นที่ถาม-ตอบแบบกระทู้',
      '%Live Room%',
    )
}

function initSqliteForum() {
  const db = sqlite()
  db.exec(`
    CREATE TABLE IF NOT EXISTS forum_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      author_account_id TEXT,
      author_name TEXT NOT NULL,
      author_rank TEXT NOT NULL,
      sticky INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_post_at INTEGER NOT NULL,
      last_poster_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      author_account_id TEXT,
      author_name TEXT NOT NULL,
      author_rank TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS forum_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS forum_topics_board ON forum_topics (board_id, sticky, last_post_at);
    CREATE INDEX IF NOT EXISTS forum_posts_topic ON forum_posts (topic_id, id);
  `)
  const accountColumns = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[]
  if (!accountColumns.some((column) => column.name === 'signature')) {
    db.exec('ALTER TABLE accounts ADD COLUMN signature TEXT')
  }
  const categories = db.prepare('SELECT COUNT(*) AS n FROM forum_categories').get() as { n: number }
  if (categories.n === 0) seedForum()
  ensureSetting('guest_posting', '0')
  ensureSetting('site_name', DEFAULT_SITE_NAME)
  ensureSetting('forum_name', DEFAULT_FORUM_NAME)
}

export function mountForum(app: Express, io: Hub) {
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || req.method === 'HEAD' || res.statusCode >= 400) return
      if (req.path.endsWith('/views') || req.path.endsWith('/view')) return
      forgetForumReads()
    })
    next()
  })

  app.get('/api/forum', (req, res) => {
    res.json({ categories: listCategories(), me: meFor(req), stats: forumStats(), branding: forumBranding() })
  })

  app.get('/api/forum/bootstrap', (req, res) => {
    res.json({ me: meFor(req), stats: forumStats(), branding: forumBranding(), online: forumOnlineSnapshot() })
  })

  app.post('/api/forum/views', (req, res) => {
    const path = cleanViewPath(req.body?.path)
    if (!path) {
      res.json(viewTotals())
      return
    }
    res.json(recordPageView(visitorKey(req.body?.visitor, req.ip || ''), path))
  })

  app.get('/api/forum/ads', (_req, res) => {
    res.json({ slots: listAds() })
  })

  app.get('/api/forum/ranks', (_req, res) => {
    res.json({ ranks: ACTIVITY_RANKS })
  })

  app.post('/api/forum/promotion/ack', (req, res) => {
    const actor = actorFor(req)
    if (actor.accountId) sqlite().prepare('UPDATE accounts SET promotion_rank = NULL WHERE id = ?').run(actor.accountId)
    res.json({ me: meFor(req) })
  })

  app.put('/api/forum/activity-rank', (req, res) => {
    const actor = actorFor(req)
    if (!actor.canModerate || rankLevel(actor.rank) < rankLevel('admin')) {
      res.status(403).json({ message: 'เฉพาะผู้ดูแลแต่งตั้งยศได้' })
      return
    }
    const nickname = cleanPlain(req.body?.nickname, 2, 24)
    if (!nickname) {
      res.status(400).json({ message: 'ไม่พบชื่อสมาชิกนี้' })
      return
    }
    const account = findAccountByKey(nicknameKey(nickname))
    if (!account) {
      res.status(404).json({ message: 'ไม่พบชื่อสมาชิกนี้' })
      return
    }
    const raw = req.body?.rank
    if (raw == null || raw === '') {
      sqlite().prepare('UPDATE accounts SET activity_rank = NULL WHERE id = ?').run(account.id)
      res.json({ ok: true })
      return
    }
    if (typeof raw !== 'string' || !activityRankById(raw)) {
      res.status(400).json({ message: 'ไม่พบยศนี้' })
      return
    }
    sqlite().prepare('UPDATE accounts SET activity_rank = ? WHERE id = ?').run(raw, account.id)
    res.json({ ok: true, activity: activityFor(account.id) })
  })

  app.put('/api/forum/ads/:slot', (req, res) => {
    if (!canManageAds(actorFor(req))) {
      res.status(403).json({ message: 'เฉพาะเจ้าของหรือผู้ดูแลตั้งป้ายโฆษณาได้' })
      return
    }
    const slot = Number(req.params.slot)
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
      res.status(404).json({ message: 'ไม่พบช่องโฆษณานี้' })
      return
    }
    const imageUrl = httpUrl(req.body?.imageUrl)
    const linkUrl = httpUrl(req.body?.linkUrl)
    const alt = cleanPlain(req.body?.alt ?? '', 0, 120)
    if (imageUrl == null || linkUrl == null || alt == null) {
      res.status(400).json({ message: 'ใส่ลิงก์รูปและลิงก์ปลายทางเป็น http หรือ https' })
      return
    }
    const enabled = req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1
    sqlite()
      .prepare('UPDATE ad_slots SET image_url = ?, link_url = ?, alt_text = ?, enabled = ? WHERE slot = ?')
      .run(imageUrl, linkUrl, alt, enabled, slot)
    if (req.body?.clearImage) {
      sqlite()
        .prepare(`UPDATE ad_slots SET image_bytes = NULL, image_type = '', image_updated = 0 WHERE slot = ?`)
        .run(slot)
    }
    res.json({ slots: listAds() })
  })

  app.post(
    '/api/forum/ads/:slot/image',
    express.raw({
      limit: '1mb',
      type: (req) => /^image\/(jpe?g|pjpeg|png|webp|gif)/i.test(String(req.headers['content-type'] ?? '')),
    }),
    (req, res) => {
      if (!canManageAds(actorFor(req))) {
        res.status(403).json({ message: 'เฉพาะเจ้าของหรือผู้ดูแลตั้งป้ายโฆษณาได้' })
        return
      }
      const slot = Number(req.params.slot)
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        res.status(404).json({ message: 'ไม่พบช่องโฆษณานี้' })
        return
      }
      const body = req.body
      const type = Buffer.isBuffer(body) ? imageMime(body) : null
      if (!type) {
        res.status(400).json({ message: 'รองรับเฉพาะ jpg, png, webp และ gif ไม่เกิน 1 MB' })
        return
      }
      sqlite()
        .prepare('UPDATE ad_slots SET image_bytes = ?, image_type = ?, image_updated = ? WHERE slot = ?')
        .run(body, type, Date.now(), slot)
      res.json({ slots: listAds() })
    },
  )

  app.get('/api/forum/ads/:slot/image', (req, res) => {
    const slot = Number(req.params.slot)
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
      res.status(404).end()
      return
    }
    const row = sqlite().prepare('SELECT image_bytes, image_type FROM ad_slots WHERE slot = ?').get(slot) as
      | { image_bytes: Buffer | Uint8Array | null; image_type: string }
      | undefined
    if (!row?.image_bytes || !row.image_type) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', row.image_type)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(row.image_bytes))
  })

  app.get('/api/forum/boards/:id', (req, res) => {
    const boardId = intId(req.params.id)
    const board = boardId ? getBoard(boardId) : undefined
    if (!board) {
      res.status(404).json({ message: 'ไม่พบบอร์ดนี้' })
      return
    }
    const page = pageParam(req.query.page)
    const pageSize = TOPIC_PAGE
    const total = countTopics(boardId, false)
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, pages)
    res.json({
      board,
      category: getCategory(board.categoryId),
      stickies: listTopics(boardId, true, 0, 100),
      topics: listTopics(boardId, false, (safePage - 1) * pageSize, pageSize),
      page: safePage,
      pages,
      me: meFor(req),
      boards: boardChoices(),
    })
  })

  app.get('/api/forum/topics/:id', (req, res) => {
    const topicId = intId(req.params.id)
    const topic = topicId ? getTopic(topicId) : undefined
    if (!topic) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const page = pageParam(req.query.page)
    const total = countPosts(topicId)
    const pages = Math.max(1, Math.ceil(total / POST_PAGE))
    const safePage = Math.min(page, pages)
    const board = getBoard(topic.boardId)
    res.json({
      topic,
      board,
      category: board ? getCategory(board.categoryId) : null,
      posts: listPosts(topicId, (safePage - 1) * POST_PAGE, POST_PAGE),
      page: safePage,
      pages,
      postPageSize: POST_PAGE,
      me: meFor(req),
      boards: boardChoices(),
    })
  })

  app.post('/api/forum/topics/:id/view', (req, res) => {
    const topicId = intId(req.params.id)
    if (!topicId || !getTopic(topicId)) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const key = `${requestIp(req)}:${topicId}`
    const now = Date.now()
    const seen = viewSeen.get(key) ?? 0
    if (now - seen > 30 * 60 * 1000) {
      viewSeen.set(key, now)
      sqlite().prepare('UPDATE forum_topics SET views = views + 1 WHERE id = ?').run(topicId)
    }
    const topic = getTopic(topicId)
    res.json({ views: topic?.views ?? 0 })
  })

  app.get('/api/forum/search', (req, res) => {
    const query = cleanPlain(req.query.q, 2, 80)
    if (!query) {
      res.json({ query: '', results: [], me: meFor(req) })
      return
    }
    const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    const rows = sqlite()
      .prepare(
        `SELECT t.id AS topic_id, t.subject, t.board_id, b.name AS board_name, t.last_post_at, t.last_poster_name,
                p.body AS body
         FROM forum_posts p
         JOIN forum_topics t ON t.id = p.topic_id
         JOIN forum_boards b ON b.id = t.board_id
         WHERE t.subject LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\'
         GROUP BY t.id
         ORDER BY t.last_post_at DESC
         LIMIT 30`,
      )
      .all(like, like) as {
      topic_id: number
      subject: string
      board_id: number
      board_name: string
      last_post_at: number
      last_poster_name: string
      body: string
    }[]
    res.json({
      query,
      results: rows.map((row) => ({
        topicId: row.topic_id,
        subject: row.subject,
        boardId: row.board_id,
        boardName: row.board_name,
        lastPostAt: row.last_post_at,
        lastPosterName: row.last_poster_name,
        lastPosterColor: displayColor(null, row.last_poster_name),
        snippet: snippet(row.body, query),
      })),
      me: meFor(req),
    })
  })

  app.post('/api/forum/boards/:id/topics', (req, res) => {
    const boardId = intId(req.params.id)
    const board = boardId ? getBoard(boardId) : undefined
    if (!board) {
      res.status(404).json({ message: 'ไม่พบบอร์ดนี้' })
      return
    }
    const actor = actorFor(req)
    const blocked = postBlock(actor)
    if (blocked) {
      res.status(blocked.status).json({ message: blocked.message })
      return
    }
    const subject = cleanPlain(req.body?.subject, 2, 80)
    const body = cleanBody(req.body?.body)
    if (!subject) {
      res.status(400).json({ message: 'ตั้งชื่อกระทู้ 2–80 ตัวอักษร' })
      return
    }
    if (!body) {
      res.status(400).json({ message: 'เขียนข้อความก่อนโพสต์' })
      return
    }
    const author = authorFrom(actor, req.body?.guestName)
    if ('error' in author) {
      res.status(400).json({ message: author.error })
      return
    }
    if (tooFast(actor)) {
      res.status(429).json({ message: 'โพสต์ถี่เกินไป รอสักครู่' })
      return
    }
    const now = Date.now()
    const db = sqlite()
    const topicId = Number(
      db.prepare(
        `INSERT INTO forum_topics (
          board_id, subject, author_account_id, author_name, author_rank, sticky, locked, views, reply_count, created_at, last_post_at, last_poster_name
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
      ).run(boardId, subject, author.accountId, author.name, author.rank, now, now, author.name).lastInsertRowid,
    )
    const postId = Number(
      db.prepare(
        `INSERT INTO forum_posts (topic_id, author_account_id, author_name, author_rank, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )      .run(topicId, author.accountId, author.name, author.rank, body, now).lastInsertRowid,
    )
    notePromotion(author.accountId)
    const post = publicPost(getPost(postId)!)
    io.emit('forum-event', { type: 'post', topicId, boardId, post })
    io.emit('forum-event', { type: 'topic', topicId, boardId })
    res.status(201).json({ topicId, post, me: meFor(req) })
  })

  app.post('/api/forum/topics/:id/replies', (req, res) => {
    const topicId = intId(req.params.id)
    const topic = topicId ? getTopic(topicId) : undefined
    if (!topic) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const actor = actorFor(req)
    if (topic.locked && !actor.canModerate) {
      res.status(403).json({ message: 'กระทู้นี้ถูกล็อก' })
      return
    }
    const blocked = postBlock(actor)
    if (blocked) {
      res.status(blocked.status).json({ message: blocked.message })
      return
    }
    const body = cleanBody(req.body?.body)
    if (!body) {
      res.status(400).json({ message: 'เขียนข้อความก่อนโพสต์' })
      return
    }
    const author = authorFrom(actor, req.body?.guestName)
    if ('error' in author) {
      res.status(400).json({ message: author.error })
      return
    }
    if (tooFast(actor)) {
      res.status(429).json({ message: 'โพสต์ถี่เกินไป รอสักครู่' })
      return
    }
    const now = Date.now()
    const postId = Number(
      sqlite()
        .prepare(
          `INSERT INTO forum_posts (topic_id, author_account_id, author_name, author_rank, body, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(topicId, author.accountId, author.name, author.rank, body, now).lastInsertRowid,
    )
    notePromotion(author.accountId)
    refreshTopic(topicId)
    const post = publicPost(getPost(postId)!)
    const total = countPosts(topicId)
    const page = Math.max(1, Math.ceil(total / POST_PAGE))
    io.emit('forum-event', { type: 'post', topicId, boardId: topic.boardId, post })
    io.emit('forum-event', { type: 'topic', topicId, boardId: topic.boardId })
    res.status(201).json({ post, page, pages: page, me: meFor(req) })
  })

  app.put('/api/forum/posts/:id', (req, res) => {
    const postId = intId(req.params.id)
    const row = postId ? getPost(postId) : undefined
    if (!row) {
      res.status(404).json({ message: 'ไม่พบข้อความนี้' })
      return
    }
    const actor = actorFor(req)
    const topic = getTopic(row.topic_id)
    if (!topic) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const owns = Boolean(actor.accountId && actor.accountId === row.author_account_id)
    if (!owns && !actor.canModerate) {
      res.status(403).json({ message: 'แก้ได้เฉพาะข้อความของตัวเอง' })
      return
    }
    const body = cleanBody(req.body?.body)
    if (!body) {
      res.status(400).json({ message: 'เขียนข้อความก่อนบันทึก' })
      return
    }
    sqlite().prepare('UPDATE forum_posts SET body = ?, updated_at = ? WHERE id = ?').run(body, Date.now(), postId)
    const first = firstPostId(topic.id)
    const subject = cleanPlain(req.body?.subject, 2, 80)
    if (first === postId && subject) {
      sqlite().prepare('UPDATE forum_topics SET subject = ? WHERE id = ?').run(subject, topic.id)
    }
    const post = publicPost(getPost(postId)!)
    io.emit('forum-event', { type: 'topic', topicId: topic.id, boardId: topic.boardId })
    res.json({ post, me: meFor(req) })
  })

  app.delete('/api/forum/posts/:id', (req, res) => {
    const actor = actorFor(req)
    if (!actor.canModerate) {
      res.status(403).json({ message: 'เฉพาะผู้ดูแลลบข้อความได้' })
      return
    }
    const postId = intId(req.params.id)
    const row = postId ? getPost(postId) : undefined
    if (!row) {
      res.status(404).json({ message: 'ไม่พบข้อความนี้' })
      return
    }
    const topic = getTopic(row.topic_id)
    if (!topic) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const first = firstPostId(topic.id)
    if (first === postId || countPosts(topic.id) <= 1) {
      deleteTopic(topic.id)
      io.emit('forum-event', { type: 'topic', topicId: topic.id, boardId: topic.boardId, deleted: true })
      res.json({ topicDeleted: true })
      return
    }
    sqlite().prepare('DELETE FROM forum_posts WHERE id = ?').run(postId)
    refreshTopic(topic.id)
    io.emit('forum-event', { type: 'topic', topicId: topic.id, boardId: topic.boardId })
    res.json({ topicDeleted: false })
  })

  app.post('/api/forum/topics/:id/moderate', (req, res) => {
    const actor = actorFor(req)
    if (!actor.canModerate) {
      res.status(403).json({ message: 'เฉพาะผู้ดูแลจัดการกระทู้ได้' })
      return
    }
    const topicId = intId(req.params.id)
    const topic = topicId ? getTopic(topicId) : undefined
    if (!topic) {
      res.status(404).json({ message: 'ไม่พบกระทู้นี้' })
      return
    }
    const db = sqlite()
    if (typeof req.body?.sticky === 'boolean') {
      db.prepare('UPDATE forum_topics SET sticky = ? WHERE id = ?').run(req.body.sticky ? 1 : 0, topicId)
    }
    if (typeof req.body?.locked === 'boolean') {
      db.prepare('UPDATE forum_topics SET locked = ? WHERE id = ?').run(req.body.locked ? 1 : 0, topicId)
    }
    let boardId = topic.boardId
    if (req.body?.boardId != null) {
      const nextBoard = intId(req.body.boardId)
      if (!nextBoard || !getBoard(nextBoard)) {
        res.status(400).json({ message: 'ไม่พบบอร์ดปลายทาง' })
        return
      }
      db.prepare('UPDATE forum_topics SET board_id = ? WHERE id = ?').run(nextBoard, topicId)
      boardId = nextBoard
    }
    if (req.body?.delete === true) {
      deleteTopic(topicId)
      io.emit('forum-event', { type: 'topic', topicId, boardId: topic.boardId, deleted: true })
      res.json({ deleted: true })
      return
    }
    io.emit('forum-event', { type: 'topic', topicId, boardId, fromBoardId: topic.boardId })
    res.json({ topic: getTopic(topicId), me: meFor(req) })
  })

  app.post('/api/forum/categories', (req, res) => {
    if (!requireMod(req, res)) return
    const name = cleanPlain(req.body?.name, 2, 60)
    if (!name) {
      res.status(400).json({ message: 'ตั้งชื่อหมวด 2–60 ตัวอักษร' })
      return
    }
    const position = nextPosition('forum_categories')
    const id = Number(
      sqlite().prepare('INSERT INTO forum_categories (name, position) VALUES (?, ?)').run(name, position).lastInsertRowid,
    )
    io.emit('forum-event', { type: 'boards' })
    res.status(201).json({ id, categories: listCategories() })
  })

  app.put('/api/forum/categories/:id', (req, res) => {
    if (!requireMod(req, res)) return
    const id = intId(req.params.id)
    if (!id || !getCategory(id)) {
      res.status(404).json({ message: 'ไม่พบหมวดนี้' })
      return
    }
    const name = cleanPlain(req.body?.name, 2, 60)
    if (!name) {
      res.status(400).json({ message: 'ตั้งชื่อหมวด 2–60 ตัวอักษร' })
      return
    }
    sqlite().prepare('UPDATE forum_categories SET name = ? WHERE id = ?').run(name, id)
    if (req.body?.direction === 'up' || req.body?.direction === 'down') moveRow('forum_categories', id, req.body.direction)
    io.emit('forum-event', { type: 'boards' })
    res.json({ categories: listCategories() })
  })

  app.delete('/api/forum/categories/:id', (req, res) => {
    if (!requireMod(req, res)) return
    const id = intId(req.params.id)
    if (!id || !getCategory(id)) {
      res.status(404).json({ message: 'ไม่พบหมวดนี้' })
      return
    }
    const boards = sqlite().prepare('SELECT COUNT(*) AS n FROM forum_boards WHERE category_id = ?').get(id) as { n: number }
    if (boards.n > 0) {
      res.status(400).json({ message: 'ย้ายหรือลบบอร์ดในหมวดนี้ก่อน' })
      return
    }
    sqlite().prepare('DELETE FROM forum_categories WHERE id = ?').run(id)
    io.emit('forum-event', { type: 'boards' })
    res.json({ categories: listCategories() })
  })

  app.post('/api/forum/boards', (req, res) => {
    if (!requireMod(req, res)) return
    const categoryId = intId(req.body?.categoryId)
    if (!categoryId || !getCategory(categoryId)) {
      res.status(400).json({ message: 'เลือกหมวดก่อน' })
      return
    }
    const name = cleanPlain(req.body?.name, 2, 60)
    const description = cleanPlain(req.body?.description, 0, 200) ?? ''
    if (!name) {
      res.status(400).json({ message: 'ตั้งชื่อบอร์ด 2–60 ตัวอักษร' })
      return
    }
    const position = nextPosition('forum_boards', categoryId)
    sqlite()
      .prepare('INSERT INTO forum_boards (category_id, name, description, position) VALUES (?, ?, ?, ?)')
      .run(categoryId, name, description, position)
    io.emit('forum-event', { type: 'boards' })
    res.status(201).json({ categories: listCategories() })
  })

  app.put('/api/forum/boards/:id', (req, res) => {
    if (!requireMod(req, res)) return
    const id = intId(req.params.id)
    const board = id ? getBoard(id) : undefined
    if (!board) {
      res.status(404).json({ message: 'ไม่พบบอร์ดนี้' })
      return
    }
    const name = cleanPlain(req.body?.name, 2, 60) ?? board.name
    const description = req.body?.description == null ? board.description : (cleanPlain(req.body.description, 0, 200) ?? '')
    let categoryId = board.categoryId
    if (req.body?.categoryId != null) {
      const next = intId(req.body.categoryId)
      if (!next || !getCategory(next)) {
        res.status(400).json({ message: 'ไม่พบหมวดปลายทาง' })
        return
      }
      categoryId = next
    }
    sqlite()
      .prepare('UPDATE forum_boards SET name = ?, description = ?, category_id = ? WHERE id = ?')
      .run(name, description, categoryId, id)
    if (req.body?.direction === 'up' || req.body?.direction === 'down') {
      moveRow('forum_boards', id, req.body.direction, categoryId)
    }
    io.emit('forum-event', { type: 'boards' })
    res.json({ categories: listCategories() })
  })

  app.delete('/api/forum/boards/:id', (req, res) => {
    if (!requireMod(req, res)) return
    const id = intId(req.params.id)
    if (!id || !getBoard(id)) {
      res.status(404).json({ message: 'ไม่พบบอร์ดนี้' })
      return
    }
    const db = sqlite()
    db.exec('BEGIN')
    try {
      db.prepare(
        'DELETE FROM forum_posts WHERE topic_id IN (SELECT id FROM forum_topics WHERE board_id = ?)',
      ).run(id)
      db.prepare('DELETE FROM forum_topics WHERE board_id = ?').run(id)
      db.prepare('DELETE FROM forum_boards WHERE id = ?').run(id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    io.emit('forum-event', { type: 'boards' })
    res.json({ categories: listCategories() })
  })

  app.put('/api/forum/settings', (req, res) => {
    const actor = actorFor(req)
    const renaming = req.body?.siteName != null || req.body?.forumName != null
    if (renaming) {
      if (actor.rank !== 'owner') {
        res.status(403).json({ message: 'เฉพาะเจ้าของเปลี่ยนชื่อเว็บได้' })
        return
      }
      if (req.body?.siteName != null) {
        const siteName = cleanPlain(req.body.siteName, 1, 40)
        if (!siteName) {
          res.status(400).json({ message: 'ชื่อเว็บต้องมี 1–40 ตัวอักษร' })
          return
        }
        saveSetting('site_name', siteName)
      }
      if (req.body?.forumName != null) {
        const forumName = cleanPlain(req.body.forumName, 1, 40)
        if (!forumName) {
          res.status(400).json({ message: 'ชื่อฟอรัมต้องมี 1–40 ตัวอักษร' })
          return
        }
        saveSetting('forum_name', forumName)
      }
    }
    if (typeof req.body?.guestPosting === 'boolean') {
      if (!actor.canModerate) {
        res.status(403).json({ message: 'เฉพาะผู้ดูแลจัดการบอร์ดได้' })
        return
      }
      saveSetting('guest_posting', req.body.guestPosting ? '1' : '0')
    }
    if (!renaming && typeof req.body?.guestPosting !== 'boolean') {
      if (!actor.canModerate) {
        res.status(403).json({ message: 'เฉพาะผู้ดูแลจัดการบอร์ดได้' })
        return
      }
    }
    io.emit('forum-event', { type: 'boards' })
    res.json({ me: meFor(req), branding: forumBranding() })
  })

  app.put('/api/forum/signature', (req, res) => {
    const actor = actorFor(req)
    if (!actor.accountId) {
      res.status(401).json({ message: 'เข้าสู่ระบบก่อนตั้งลายเซ็น' })
      return
    }
    const signature = cleanBody(req.body?.signature ?? '') ?? ''
    if ([...signature].length > 300) {
      res.status(400).json({ message: 'ลายเซ็นยาวได้ไม่เกิน 300 ตัวอักษร' })
      return
    }
    sqlite().prepare('UPDATE accounts SET signature = ? WHERE id = ?').run(signature, actor.accountId)
    res.json({ me: meFor(req) })
  })

  app.put('/api/forum/name-color', (req, res) => {
    const actor = actorFor(req)
    if (!actor.accountId) {
      res.status(401).json({ message: 'เข้าสู่ระบบก่อนเลือกสีชื่อ' })
      return
    }
    const parsed = parseNameColor(req.body?.color)
    if ('error' in parsed) {
      res.status(400).json({ message: parsed.error })
      return
    }
    updateAccountNameColor(actor.accountId, parsed.color)
    io.emit('forum-event', { type: 'boards' })
    res.json({ me: meFor(req) })
  })
}

export function presenceFromToken(token: string | null | undefined) {
  const account = token ? accountFromToken(token) : null
  const actor = identity(account?.id ?? null, account?.nickname ?? 'Guest')
  return {
    accountId: actor.accountId,
    name: actor.accountId ? actor.name : 'Guest',
    rank: actor.rank,
    color: actor.color,
  }
}

function requireMod(req: Request, res: Response) {
  if (!actorFor(req).canModerate) {
    res.status(403).json({ message: 'เฉพาะผู้ดูแลจัดการบอร์ดได้' })
    return false
  }
  return true
}

function seedForum() {
  const db = sqlite()
  const categories = [
    {
      name: 'Markets',
      boards: [
        ['Bitcoin Discussion', 'คุยเรื่องบิตคอยน์ ราคา โปรโตคอล และข่าว'],
        ['Altcoins', 'เหรียญและโทเคนอื่น ๆ'],
        ['เทรดและสัญญาณ', 'สัญญาณ มุมมอง และวิธีเทรด'],
      ],
    },
    {
      name: 'Community',
      boards: [['คุยเล่น (Off-topic)', 'คุยเรื่องอื่นนอกตลาด']],
    },
  ] as const
  db.exec('BEGIN')
  try {
    let categoryPosition = 1
    let welcomeBoard = 0
    for (const category of categories) {
      const categoryId = Number(
        db.prepare('INSERT INTO forum_categories (name, position) VALUES (?, ?)').run(category.name, categoryPosition).lastInsertRowid,
      )
      categoryPosition += 1
      category.boards.forEach((board, index) => {
        const boardId = Number(
          db.prepare('INSERT INTO forum_boards (category_id, name, description, position) VALUES (?, ?, ?, ?)').run(
            categoryId,
            board[0],
            board[1],
            index + 1,
          ).lastInsertRowid,
        )
        if (!welcomeBoard) welcomeBoard = boardId
      })
    }
    const owner = findAccountByKey(nicknameKey(siteOwnerUsername()))
    const now = Date.now()
    const name = owner?.nickname ?? 'FIBO99'
    const accountId = owner?.id ?? null
    const topicId = Number(
      db.prepare(
        `INSERT INTO forum_topics (
          board_id, subject, author_account_id, author_name, author_rank, sticky, locked, views, reply_count, created_at, last_post_at, last_poster_name
        ) VALUES (?, ?, ?, ?, 'owner', 1, 0, 0, 0, ?, ?, ?)`,
      ).run(welcomeBoard, 'Welcome to Bitcoin', accountId, name, now, now, name).lastInsertRowid,
    )
    const body = [
      'ยินดีต้อนรับสู่ Bitcoin',
      '',
      'กระดานนี้เป็นที่ถาม-ตอบแบบกระทู้',
      '',
      '[quote author=Satoshi Nakamoto date=January 03, 2009]',
      'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks',
      '[/quote]',
      '',
      'กด New Topic ในบอร์ดที่ต้องการ แล้วตอบในกระทู้ได้เลย',
    ].join('\n')
    db.prepare(
      `INSERT INTO forum_posts (topic_id, author_account_id, author_name, author_rank, body, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', ?, ?, NULL)`,
    ).run(topicId, accountId, name, body, now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function setting(key: string) {
  const row = sqlite().prepare('SELECT value FROM forum_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function ensureSetting(key: string, value: string) {
  if (setting(key)) return
  saveSetting(key, value)
}

function saveSetting(key: string, value: string) {
  sqlite()
    .prepare(
      `INSERT INTO forum_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value)
}

function forumBranding() {
  return {
    siteName: setting('site_name') || DEFAULT_SITE_NAME,
    forumName: setting('forum_name') || DEFAULT_FORUM_NAME,
  }
}

export type PageShare = {
  title: string
  documentTitle: string
  description: string
  siteName: string
  type: 'article' | 'website'
  imageUrl: string | null
}

export function pageShare(pathname: string): PageShare {
  const branding = forumBranding()
  const home = homeShare(branding.siteName)
  const topicMatch = pathname.match(/^\/topic\/(\d+)\/?$/)
  if (topicMatch) {
    const topic = getTopic(Number(topicMatch[1]))
    if (!topic) return home
    const body = firstPostBody(topic.id)
    const description = clipText(stripMarkup(body), 200) || topic.subject
    return {
      title: topic.subject,
      documentTitle: `${topic.subject} · ${branding.siteName}`,
      description,
      siteName: branding.siteName,
      type: 'article',
      imageUrl: firstImageUrl(body),
    }
  }
  const boardMatch = pathname.match(/^\/board\/(\d+)\/?$/)
  if (boardMatch) {
    const board = getBoard(Number(boardMatch[1]))
    if (!board) return home
    return {
      title: board.name,
      documentTitle: `${board.name} · ${branding.siteName}`,
      description: clipText(board.description, 200) || home.description,
      siteName: branding.siteName,
      type: 'website',
      imageUrl: null,
    }
  }
  return home
}

function homeShare(siteName: string): PageShare {
  return {
    title: siteName,
    documentTitle: siteName,
    description: 'Bitcoin กระดานถาม-ตอบ',
    siteName,
    type: 'website',
    imageUrl: null,
  }
}

function firstPostBody(topicId: number) {
  const row = sqlite()
    .prepare('SELECT body FROM forum_posts WHERE topic_id = ? ORDER BY id ASC LIMIT 1')
    .get(topicId) as { body: string } | undefined
  return row?.body ?? ''
}

function firstImageUrl(body: string) {
  const match = body.match(/\[img\]\s*(https?:\/\/[^\]\s]+)\s*\[\/img\]/i)
  const raw = match?.[1]
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function stripMarkup(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, ' $1 ')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, ' $2 ')
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, ' $1 ')
    .replace(/\[\/?[a-z0-9]+(?:[^\]]*)\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clipText(text: string, max: number) {
  const chars = [...text]
  if (chars.length <= max) return text
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

function canManageAds(actor: Actor) {
  return rankLevel(actor.rank) >= rankLevel('admin')
}

function guestPosting() {
  return setting('guest_posting') === '1'
}

type Actor = {
  accountId: string | null
  name: string
  rank: RankId
  color: string
  canModerate: boolean
  textMuted: boolean
  banned: boolean
}

function actorFor(req: Request): Actor {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  const account = accountFromToken(token)
  const base = identity(account?.id ?? null, account?.nickname ?? 'Guest')
  const banned = account ? isAccountBanned(FORUM_ROOM, account.id) : false
  const member = account ? getMember(FORUM_ROOM, account.id) : undefined
  return {
    accountId: account?.id ?? null,
    name: base.name,
    rank: base.rank,
    color: base.color,
    canModerate: rankLevel(base.rank) >= rankLevel('moderator'),
    textMuted: Boolean(member && member.text_muted === 1 && base.rank !== 'owner'),
    banned,
  }
}

function identity(accountId: string | null, fallbackName: string) {
  const colors = getRankColors(FORUM_ROOM)
  if (!accountId) {
    return {
      accountId: null,
      name: fallbackName,
      rank: 'guest' as RankId,
      color: colors.guest,
      nameColor: null,
      colorLocked: false,
    }
  }
  const account = findAccountById(accountId)
  const member = getMember(FORUM_ROOM, accountId)
  let rank: RankId = 'member'
  if (account && nicknameKey(account.nickname) === nicknameKey(siteOwnerUsername()) && findAccountByKey(nicknameKey(siteOwnerUsername()))?.id === accountId) {
    rank = 'owner'
  }
  if (member && isRankId(member.rank) && rank !== 'owner') rank = member.rank
  if (member?.rank === 'owner') rank = 'owner'
  const ownerAccount = findAccountByKey(nicknameKey(siteOwnerUsername()))
  if (ownerAccount && ownerAccount.id === accountId) rank = 'owner'
  if (isSiteOwnerAccount(accountId)) rank = 'owner'
  return {
    accountId,
    name: account?.nickname ?? fallbackName,
    rank,
    color: storedHex(member?.name_color) || storedHex(account?.name_color) || colors[rank],
    nameColor: storedHex(account?.name_color),
    colorLocked: Boolean(storedHex(member?.name_color)),
  }
}

function meFor(req: Request): ForumMe {
  const actor = actorFor(req)
  const posts = actor.accountId ? postCount(actor.accountId) : 0
  const block = postBlock(actor)
  return {
    accountId: actor.accountId,
    name: actor.accountId ? actor.name : 'Guest',
    rank: actor.rank,
    rankLabel: rankLabel(actor.rank),
    color: actor.color,
    nameColor: actor.accountId ? identity(actor.accountId, actor.name).nameColor : null,
    colorLocked: actor.accountId ? identity(actor.accountId, actor.name).colorLocked : false,
    avatarUrl: avatarUrl(actor.accountId),
    posts,
    signature: signatureOf(actor.accountId),
    activity: actor.accountId ? activityFor(actor.accountId) : null,
    promotion: promotionFor(actor.accountId),
    canPost: !block,
    canModerate: actor.canModerate,
    canRename: actor.rank === 'owner',
    guestPosting: guestPosting(),
    textMuted: actor.textMuted,
    postBlock: block?.message ?? null,
  }
}

function postBlock(actor: Actor) {
  if (actor.banned) return { status: 403, message: 'คุณถูกแบนจากห้องหลัก' }
  if (actor.textMuted) return { status: 403, message: 'คุณถูกปิดแชต' }
  if (!actor.accountId && !guestPosting()) return { status: 401, message: 'เข้าสู่ระบบก่อนโพสต์' }
  return null
}

function authorFrom(actor: Actor, guestName: unknown): { accountId: string | null; name: string; rank: RankId } | { error: string } {
  if (actor.accountId) return { accountId: actor.accountId, name: actor.name, rank: actor.rank }
  const name = cleanPlain(guestName, 2, 24)
  if (!name) return { error: 'ตั้งชื่อผู้มาเยือน 2–24 ตัวอักษร' }
  if (findAccountByKey(nicknameKey(name.replace(/\s+/g, ''))) || findAccountByKey(nicknameKey(name))) {
    return { error: 'ชื่อนี้เป็นบัญชีสมาชิก ให้เข้าสู่ระบบก่อน' }
  }
  return { accountId: null, name, rank: 'guest' }
}

function tooFast(actor: Actor) {
  const key = actor.accountId ?? 'guest'
  const now = Date.now()
  const previous = lastPostAt.get(key) ?? 0
  if (now - previous < 500) return true
  lastPostAt.set(key, now)
  return false
}

const HOT_MS = 8_000
const hotCache = new Map<string, { at: number; value: unknown }>()

function remember<T>(key: string, load: () => T): T {
  const hit = hotCache.get(key)
  if (hit && Date.now() - hit.at < HOT_MS) return hit.value as T
  const value = load()
  hotCache.set(key, { at: Date.now(), value })
  return value
}

function forgetForumReads() {
  hotCache.delete('categories')
  hotCache.delete('stats')
  colorCache = null
}

function listCategories() {
  return remember('categories', buildCategories)
}

function buildCategories() {
  const categories = sqlite().prepare('SELECT id, name, position FROM forum_categories ORDER BY position ASC, id ASC').all() as {
    id: number
    name: string
    position: number
  }[]
  const boards = sqlite()
    .prepare('SELECT id, category_id, name, description, position FROM forum_boards ORDER BY position ASC, id ASC')
    .all() as { id: number; category_id: number; name: string; description: string; position: number }[]
  const counts = sqlite()
    .prepare(
      `SELECT t.board_id AS id, COUNT(DISTINCT t.id) AS topics, COUNT(p.id) AS posts
       FROM forum_topics t
       LEFT JOIN forum_posts p ON p.topic_id = t.id
       GROUP BY t.board_id`,
    )
    .all() as { id: number; topics: number; posts: number }[]
  const lasts = sqlite()
    .prepare(
      `SELECT t.board_id, t.id, t.subject, t.last_poster_name, t.last_post_at, t.reply_count
       FROM forum_topics t
       JOIN (
         SELECT board_id, MAX(last_post_at) AS last_post_at FROM forum_topics GROUP BY board_id
       ) latest ON latest.board_id = t.board_id AND latest.last_post_at = t.last_post_at`,
    )
    .all() as {
    board_id: number
    id: number
    subject: string
    last_poster_name: string
    last_post_at: number
    reply_count: number
  }[]
  const countByBoard = new Map(counts.map((row) => [Number(row.id), row]))
  const lastByBoard = new Map<number, (typeof lasts)[number]>()
  for (const row of lasts) {
    const current = lastByBoard.get(Number(row.board_id))
    if (!current || row.id > current.id) lastByBoard.set(Number(row.board_id), row)
  }
  const colors = colorsForNames(lasts.map((row) => row.last_poster_name))
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    position: category.position,
    boards: boards
      .filter((board) => board.category_id === category.id)
      .map((board) => {
        const count = countByBoard.get(board.id)
        const last = lastByBoard.get(board.id)
        return {
          id: board.id,
          categoryId: board.category_id,
          name: board.name,
          description: board.description,
          position: board.position,
          topics: Number(count?.topics ?? 0),
          posts: Number(count?.posts ?? 0),
          lastPost: last
            ? {
                topicId: last.id,
                subject: last.subject,
                name: last.last_poster_name,
                color: colors.get(nicknameKey(last.last_poster_name)) ?? cachedRankColors().guest,
                at: last.last_post_at,
                page: Math.max(1, Math.ceil((last.reply_count + 1) / POST_PAGE)),
              }
            : null,
        }
      }),
  }))
}

function getBoard(id: number) {
  for (const category of listCategories()) {
    const board = category.boards.find((item) => item.id === id)
    if (board) return board
  }
  return undefined
}

function getCategory(id: number) {
  const row = sqlite().prepare('SELECT id, name, position FROM forum_categories WHERE id = ?').get(id) as
    | { id: number; name: string; position: number }
    | undefined
  return row ? { id: row.id, name: row.name, position: row.position } : null
}

function boardChoices() {
  return sqlite()
    .prepare(
      `SELECT b.id, b.name, c.name AS category
       FROM forum_boards b JOIN forum_categories c ON c.id = b.category_id
       ORDER BY c.position ASC, b.position ASC`,
    )
    .all() as { id: number; name: string; category: string }[]
}

function listTopics(boardId: number, sticky: boolean, offset: number, limit: number) {
  const rows = sqlite()
    .prepare(
      `SELECT * FROM forum_topics
       WHERE board_id = ? AND sticky = ?
       ORDER BY last_post_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(boardId, sticky ? 1 : 0, limit, offset) as TopicRow[]
  const authorColors = colorsForIds(rows.map((row) => row.author_account_id).filter((id): id is string => Boolean(id)))
  const nameColors = colorsForNames(rows.map((row) => row.last_poster_name))
  return rows.map((row) =>
    publicTopic(
      row,
      row.author_account_id ? authorColors.get(row.author_account_id) : undefined,
      nameColors.get(nicknameKey(row.last_poster_name)),
    ),
  )
}

function countTopics(boardId: number, sticky: boolean) {
  const row = sqlite()
    .prepare('SELECT COUNT(*) AS n FROM forum_topics WHERE board_id = ? AND sticky = ?')
    .get(boardId, sticky ? 1 : 0) as { n: number }
  return row.n
}

function getTopic(id: number) {
  const row = sqlite().prepare('SELECT * FROM forum_topics WHERE id = ?').get(id) as TopicRow | undefined
  return row ? publicTopic(row) : undefined
}

function publicTopic(row: TopicRow, authorColor?: string, lastPosterColor?: string) {
  const rank = isRankId(row.author_rank) ? row.author_rank : 'member'
  return {
    id: row.id,
    boardId: row.board_id,
    subject: row.subject,
    authorName: row.author_name,
    authorColor: authorColor ?? displayColor(row.author_account_id, row.author_name),
    authorRank: rank,
    sticky: row.sticky === 1,
    locked: row.locked === 1,
    views: row.views,
    replies: row.reply_count,
    createdAt: row.created_at,
    lastPostAt: row.last_post_at,
    lastPosterName: row.last_poster_name,
    lastPosterColor: lastPosterColor ?? displayColor(null, row.last_poster_name),
  }
}

function listPosts(topicId: number, offset: number, limit: number) {
  const rows = sqlite()
    .prepare('SELECT * FROM forum_posts WHERE topic_id = ? ORDER BY id ASC LIMIT ? OFFSET ?')
    .all(topicId, limit, offset) as PostRow[]
  return postsPublic(rows)
}

function getPost(id: number) {
  return sqlite().prepare('SELECT * FROM forum_posts WHERE id = ?').get(id) as PostRow | undefined
}

function postsPublic(rows: PostRow[]): ForumPost[] {
  const ids = rows.map((row) => row.author_account_id).filter((id): id is string => Boolean(id))
  const directory = loadAuthors(ids)
  return rows.map((row) => publicPost(row, directory))
}

function publicPost(row: PostRow, directory = loadAuthors(row.author_account_id ? [row.author_account_id] : [])): ForumPost {
  const authorId = row.author_account_id
  const known = authorId ? directory.accounts.get(authorId) : undefined
  const member = authorId ? directory.members.get(authorId) : undefined
  const colors = directory.colors
  let rank: RankId = 'guest'
  if (authorId) {
    rank = authorId === directory.ownerId ? 'owner' : member && isRankId(member.rank) ? member.rank : 'member'
  } else if (isRankId(row.author_rank)) rank = row.author_rank
  const posts = authorId ? (directory.counts.get(authorId) ?? 0) : 0
  const override = activityRankById(known?.activity_rank)
  const activityRank = authorId
    ? (override ?? (authorId === directory.ownerId ? activityRankById('marshal')! : activityRankForPosts(posts)))
    : null
  const stamp = authorId ? directory.avatars.get(authorId) : 0
  return {
    id: row.id,
    topicId: row.topic_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      accountId: authorId,
      name: known?.nickname ?? row.author_name,
      rank,
      rankLabel: rankLabel(rank),
      color: storedHex(member?.name_color) || storedHex(known?.name_color) || colors[rank],
      avatarUrl: authorId && stamp ? `/api/avatars/${authorId}?v=${stamp}` : null,
      posts,
      signature: (known?.signature ?? '').slice(0, 300),
      activity: activityRank
        ? {
            id: activityRank.id,
            title: activityRank.title,
            nickname: activityRank.nickname,
            kind: activityRank.kind,
            marks: activityRank.marks,
            threshold: activityRank.threshold,
            overridden: Boolean(override),
          }
        : null,
    },
  }
}

function loadAuthors(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  const colors = cachedRankColors()
  const ownerId = siteOwnerId()
  const accounts = new Map<string, { nickname: string; name_color: string | null; activity_rank: string | null; signature: string | null }>()
  const members = new Map<string, { rank: string; name_color: string | null }>()
  const avatars = new Map<string, number>()
  const counts = new Map<string, number>()
  if (unique.length > 0) {
    const marks = unique.map(() => '?').join(', ')
    const accountRows = sqlite()
      .prepare(`SELECT id, nickname, name_color, activity_rank, signature FROM accounts WHERE id IN (${marks})`)
      .all(...unique) as { id: string; nickname: string; name_color: string | null; activity_rank: string | null; signature: string | null }[]
    for (const row of accountRows) accounts.set(row.id, row)
    const memberRows = sqlite()
      .prepare(`SELECT account_id, rank, name_color FROM room_members WHERE room_id = ? AND account_id IN (${marks})`)
      .all(FORUM_ROOM, ...unique) as { account_id: string; rank: string; name_color: string | null }[]
    for (const row of memberRows) members.set(row.account_id, row)
    const avatarRows = sqlite()
      .prepare(`SELECT account_id, updated_at FROM avatars WHERE account_id IN (${marks})`)
      .all(...unique) as { account_id: string; updated_at: number }[]
    for (const row of avatarRows) avatars.set(row.account_id, Number(row.updated_at))
    const countRows = sqlite()
      .prepare(`SELECT author_account_id AS id, COUNT(*) AS n FROM forum_posts WHERE author_account_id IN (${marks}) GROUP BY author_account_id`)
      .all(...unique) as { id: string; n: number }[]
    for (const row of countRows) counts.set(row.id, Number(row.n))
  }
  return { accounts, members, avatars, counts, colors, ownerId }
}

function colorsForIds(ids: string[]) {
  const directory = loadAuthors(ids)
  const colors = new Map<string, string>()
  for (const id of ids) {
    const account = directory.accounts.get(id)
    const member = directory.members.get(id)
    if (!account) continue
    const rank: RankId = id === directory.ownerId ? 'owner' : member && isRankId(member.rank) ? member.rank : 'member'
    colors.set(id, storedHex(member?.name_color) || storedHex(account.name_color) || directory.colors[rank])
  }
  return colors
}

function colorsForNames(names: string[]) {
  const keys = [...new Set(names.filter(Boolean).map((name) => nicknameKey(name)))]
  const colors = new Map<string, string>()
  if (keys.length === 0) return colors
  const marks = keys.map(() => '?').join(', ')
  const accounts = sqlite()
    .prepare(`SELECT id, nickname_key, name_color FROM accounts WHERE nickname_key IN (${marks})`)
    .all(...keys) as { id: string; nickname_key: string; name_color: string | null }[]
  const byId = colorsForIds(accounts.map((account) => account.id))
  for (const account of accounts) {
    const color = byId.get(account.id)
    if (color) colors.set(account.nickname_key, color)
  }
  return colors
}

let colorCache: { at: number; colors: ReturnType<typeof getRankColors> } | null = null
let ownerCache: { at: number; id: string | null } | null = null

function cachedRankColors() {
  if (colorCache && Date.now() - colorCache.at < 60_000) return colorCache.colors
  const colors = getRankColors(FORUM_ROOM)
  colorCache = { at: Date.now(), colors }
  return colors
}

function siteOwnerId() {
  if (ownerCache && Date.now() - ownerCache.at < 60_000) return ownerCache.id
  const owner = findAccountByKey(nicknameKey(siteOwnerUsername()))
  ownerCache = { at: Date.now(), id: owner?.id ?? null }
  return ownerCache.id
}

function countPosts(topicId: number) {
  const row = sqlite().prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE topic_id = ?').get(topicId) as { n: number }
  return row.n
}

function firstPostId(topicId: number) {
  const row = sqlite().prepare('SELECT id FROM forum_posts WHERE topic_id = ? ORDER BY id ASC LIMIT 1').get(topicId) as
    | { id: number }
    | undefined
  return row?.id ?? 0
}

function refreshTopic(topicId: number) {
  const count = countPosts(topicId)
  const last = sqlite()
    .prepare('SELECT author_name, created_at FROM forum_posts WHERE topic_id = ? ORDER BY id DESC LIMIT 1')
    .get(topicId) as { author_name: string; created_at: number } | undefined
  if (!last) return
  sqlite()
    .prepare('UPDATE forum_topics SET reply_count = ?, last_post_at = ?, last_poster_name = ? WHERE id = ?')
    .run(Math.max(0, count - 1), last.created_at, last.author_name, topicId)
}

function deleteTopic(topicId: number) {
  const db = sqlite()
  db.prepare('DELETE FROM forum_posts WHERE topic_id = ?').run(topicId)
  db.prepare('DELETE FROM forum_topics WHERE id = ?').run(topicId)
}

function isSiteOwnerId(accountId: string) {
  const owner = findAccountByKey(nicknameKey(siteOwnerUsername()))
  return Boolean(owner && owner.id === accountId)
}

function activityFor(accountId: string): ActivityView {
  const posts = postCount(accountId)
  const account = findAccountById(accountId)
  const override = activityRankById(account?.activity_rank)
  const rank = override ?? (isSiteOwnerId(accountId) ? activityRankById('marshal')! : activityRankForPosts(posts))
  return {
    id: rank.id,
    title: rank.title,
    nickname: rank.nickname,
    kind: rank.kind,
    marks: rank.marks,
    threshold: rank.threshold,
    overridden: Boolean(override),
  }
}

function promotionFor(accountId: string | null) {
  if (!accountId) return null
  const account = findAccountById(accountId)
  const rank = activityRankById(account?.promotion_rank)
  if (!rank) return null
  return { title: rank.title, nickname: rank.nickname }
}

function notePromotion(accountId: string | null) {
  if (!accountId || isSiteOwnerId(accountId)) return
  const account = findAccountById(accountId)
  if (!account || account.activity_rank) return
  const posts = postCount(accountId)
  const next = activityRankForPosts(posts)
  const prev = activityRankForPosts(Math.max(0, posts - 1))
  if (next.id === prev.id) return
  sqlite().prepare('UPDATE accounts SET promotion_rank = ? WHERE id = ?').run(next.id, accountId)
}

function postCount(accountId: string) {
  const row = sqlite().prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE author_account_id = ?').get(accountId) as {
    n: number
  }
  return row.n
}

function signatureOf(accountId: string | null) {
  if (!accountId) return ''
  const row = sqlite().prepare('SELECT signature FROM accounts WHERE id = ?').get(accountId) as
    | { signature: string | null }
    | undefined
  return (row?.signature ?? '').slice(0, 300)
}

function forumStats() {
  return remember('stats', readForumStats)
}

function readForumStats() {
  const posts = (sqlite().prepare('SELECT COUNT(*) AS n FROM forum_posts').get() as { n: number }).n
  const topics = (sqlite().prepare('SELECT COUNT(*) AS n FROM forum_topics').get() as { n: number }).n
  const members = (sqlite().prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n
  const latest = sqlite().prepare('SELECT id, nickname FROM accounts ORDER BY created_at DESC LIMIT 1').get() as
    | { id: string; nickname: string }
    | undefined
  return {
    posts,
    topics,
    members,
    latestMember: latest ? { name: latest.nickname, color: displayColor(latest.id, latest.nickname) } : null,
  }
}

function displayColor(accountId: string | null, name: string) {
  if (accountId) return identity(accountId, name).color
  const account = findAccountByKey(nicknameKey(name))
  if (account) return identity(account.id, account.nickname).color
  return getRankColors(FORUM_ROOM).guest
}

function avatarUrl(accountId: string | null) {
  if (!accountId || !/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) return null
  const stamp = avatarStamp(accountId)
  if (!stamp) return null
  return `/api/avatars/${accountId}?v=${stamp}`
}

const VIEW_WINDOW_MS = 30 * 60 * 1000

function ensureTrafficTables() {
  sqlite().exec(`
    CREATE TABLE IF NOT EXISTS page_counters (
      key TEXT PRIMARY KEY,
      value BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_view_days (
      day TEXT PRIMARY KEY,
      views BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_view_seen (
      visitor_key TEXT NOT NULL,
      path TEXT NOT NULL,
      seen_at BIGINT NOT NULL,
      PRIMARY KEY (visitor_key, path)
    );
    CREATE TABLE IF NOT EXISTS ad_slots (
      slot INTEGER PRIMARY KEY,
      image_url TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      alt_text TEXT NOT NULL DEFAULT ''
    );
  `)
  const adColumns = new Set(
    (sqlite().prepare('PRAGMA table_info(ad_slots)').all() as { name: string }[]).map((column) => column.name),
  )
  if (!adColumns.has('enabled')) sqlite().exec('ALTER TABLE ad_slots ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
  if (!adColumns.has('image_bytes')) {
    sqlite().exec(usingPostgres() ? 'ALTER TABLE ad_slots ADD COLUMN image_bytes BYTEA' : 'ALTER TABLE ad_slots ADD COLUMN image_bytes BLOB')
  }
  if (!adColumns.has('image_type')) sqlite().exec(`ALTER TABLE ad_slots ADD COLUMN image_type TEXT NOT NULL DEFAULT ''`)
  if (!adColumns.has('image_updated')) {
    sqlite().exec(
      usingPostgres()
        ? 'ALTER TABLE ad_slots ADD COLUMN image_updated BIGINT NOT NULL DEFAULT 0'
        : 'ALTER TABLE ad_slots ADD COLUMN image_updated INTEGER NOT NULL DEFAULT 0',
    )
  }
  const insert = sqlite().prepare(
    'INSERT INTO ad_slots (slot, image_url, link_url, alt_text) VALUES (?, ?, ?, ?) ON CONFLICT(slot) DO NOTHING',
  )
  for (let slot = 1; slot <= 5; slot += 1) insert.run(slot, '', '', '')
}

function bangkokDay(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function visitorKey(raw: unknown, ip: string) {
  const id = typeof raw === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(raw) ? raw : ip || 'anon'
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

function cleanViewPath(input: unknown) {
  if (typeof input !== 'string') return null
  const path = input.split('#')[0]?.slice(0, 180) ?? ''
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  if (path.startsWith('/api') || path.startsWith('/socket.io') || path.startsWith('/room')) return null
  return path
}

function viewTotals() {
  return remember('views', readViewTotals)
}

function readViewTotals() {
  const totalRow = sqlite().prepare(`SELECT value FROM page_counters WHERE key = 'total'`).get() as { value: number } | undefined
  const todayRow = sqlite().prepare('SELECT views FROM page_view_days WHERE day = ?').get(bangkokDay()) as { views: number } | undefined
  return { total: Number(totalRow?.value ?? 0), today: Number(todayRow?.views ?? 0) }
}

function recordPageView(visitor: string, path: string) {
  const now = Date.now()
  const db = sqlite()
  db.prepare('DELETE FROM page_view_seen WHERE seen_at < ?').run(now - VIEW_WINDOW_MS)
  const seen = db.prepare('SELECT seen_at FROM page_view_seen WHERE visitor_key = ? AND path = ?').get(visitor, path) as
    | { seen_at: number }
    | undefined
  if (!seen || now - Number(seen.seen_at) >= VIEW_WINDOW_MS) {
    db.prepare(
      `INSERT INTO page_view_seen (visitor_key, path, seen_at) VALUES (?, ?, ?)
       ON CONFLICT(visitor_key, path) DO UPDATE SET seen_at = excluded.seen_at`,
    ).run(visitor, path, now)
    db.prepare(
      `INSERT INTO page_counters (key, value) VALUES ('total', 1)
       ON CONFLICT(key) DO UPDATE SET value = page_counters.value + 1`,
    ).run()
    db.prepare(
      `INSERT INTO page_view_days (day, views) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET views = page_view_days.views + 1`,
    )    .run(bangkokDay(now))
  }
  const totals = readViewTotals()
  hotCache.set('views', { at: Date.now(), value: totals })
  return totals
}

function listAds() {
  const rows = sqlite()
    .prepare('SELECT slot, image_url, link_url, alt_text, enabled, image_updated FROM ad_slots ORDER BY slot ASC')
    .all() as {
    slot: number
    image_url: string
    link_url: string
    alt_text: string
    enabled: number
    image_updated: number
  }[]
  const bySlot = new Map(rows.map((row) => [Number(row.slot), row]))
  return [1, 2, 3, 4, 5].map((slot) => {
    const row = bySlot.get(slot)
    const updated = Number(row?.image_updated ?? 0)
    const imageUrl = row?.image_url ?? ''
    return {
      slot,
      imageUrl,
      linkUrl: row?.link_url ?? '',
      alt: row?.alt_text ?? '',
      enabled: Number(row?.enabled ?? 1) !== 0,
      hasFile: updated > 0,
      image: updated > 0 ? `/api/forum/ads/${slot}/image?v=${updated}` : imageUrl,
    }
  })
}

function imageMime(bytes: Buffer) {
  if (bytes.length < 12 || bytes.length > 1024 * 1024) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

function httpUrl(input: unknown) {
  if (input == null || input === '') return ''
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value || value.length > 500) return value ? null : ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function removeEtfBoard() {
  const board = sqlite().prepare('SELECT id FROM forum_boards WHERE name = ?').get('ETF & Macro') as { id: number } | undefined
  if (!board) return
  sqlite().prepare('DELETE FROM forum_posts WHERE topic_id IN (SELECT id FROM forum_topics WHERE board_id = ?)').run(board.id)
  sqlite().prepare('DELETE FROM forum_topics WHERE board_id = ?').run(board.id)
  sqlite().prepare('DELETE FROM forum_boards WHERE id = ?').run(board.id)
}

function nextPosition(table: 'forum_categories' | 'forum_boards', categoryId?: number) {
  const row = categoryId
    ? (sqlite().prepare(`SELECT COALESCE(MAX(position), 0) AS n FROM ${table} WHERE category_id = ?`).get(categoryId) as {
        n: number
      })
    : (sqlite().prepare(`SELECT COALESCE(MAX(position), 0) AS n FROM ${table}`).get() as { n: number })
  return row.n + 1
}

function moveRow(table: 'forum_categories' | 'forum_boards', id: number, direction: 'up' | 'down', categoryId?: number) {
  const rows = (
    categoryId
      ? sqlite().prepare(`SELECT id FROM ${table} WHERE category_id = ? ORDER BY position ASC, id ASC`).all(categoryId)
      : sqlite().prepare(`SELECT id FROM ${table} ORDER BY position ASC, id ASC`).all()
  ) as { id: number }[]
  const index = rows.findIndex((row) => row.id === id)
  const swap = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || swap < 0 || swap >= rows.length) return
  const reordered = rows.slice()
  const current = reordered[index]
  reordered[index] = reordered[swap]!
  reordered[swap] = current!
  const update = sqlite().prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
  reordered.forEach((row, position) => update.run(position + 1, row.id))
}

function snippet(body: string, query: string) {
  const flat = body.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, at < 0 ? 0 : at - 40)
  const slice = flat.slice(start, start + 140)
  return `${start > 0 ? '…' : ''}${slice}${start + 140 < flat.length ? '…' : ''}`
}

function pageParam(value: unknown) {
  const page = Number(value)
  if (!Number.isInteger(page) || page < 1 || page > 5000) return 1
  return page
}

function intId(value: unknown) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) return 0
  return id
}

function cleanPlain(input: unknown, min: number, max: number) {
  if (typeof input !== 'string') return null
  const text = stripControls(input).replace(/\s+/g, ' ').trim()
  const chars = [...text]
  if (chars.length < min || chars.length > max) return min === 0 && chars.length === 0 ? '' : null
  return chars.join('')
}

function cleanBody(input: unknown) {
  if (typeof input !== 'string') return null
  if (input.trim() === '') return ''
  let out = ''
  for (const char of input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0x0a || code === 0x09) {
      out += char
      continue
    }
    if (code <= 0x1f || code === 0x7f) continue
    out += char
  }
  const trimmed = out.trim()
  const chars = [...trimmed]
  if (chars.length < 1 || chars.length > 8000) return null
  return chars.join('')
}

function stripControls(input: string) {
  let out = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) continue
    out += char
  }
  return out
}

function requestIp(req: Request) {
  return (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '')
}
