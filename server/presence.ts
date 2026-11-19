export type OnlineUser = { accountId: string | null; name: string; rank: string; color: string }

const forumOnline = new Map<string, OnlineUser>()

export function setForumPresence(id: string, user: OnlineUser) {
  forumOnline.set(id, user)
}

export function clearForumPresence(id: string) {
  return forumOnline.delete(id)
}

export function forumOnlineSnapshot() {
  const values = [...forumOnline.values()]
  const memberSessions = values.filter((user) => user.accountId)
  const seen = new Set<string>()
  const users: { name: string; rank: string; color: string }[] = []
  for (const user of memberSessions) {
    if (!user.accountId || seen.has(user.accountId)) continue
    seen.add(user.accountId)
    users.push({ name: user.name, rank: user.rank, color: user.color })
  }
  return {
    total: values.length,
    guests: values.length - memberSessions.length,
    members: memberSessions.length,
    users,
  }
}
