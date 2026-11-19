export type ActivityKind = 'plain' | 'chevron' | 'pip' | 'flower' | 'star'

export type ActivityRank = {
  id: string
  threshold: number
  title: string
  nickname: string
  kind: ActivityKind
  marks: number
}

export const ACTIVITY_RANKS: ActivityRank[] = [
  { id: 'private', threshold: 0, title: 'พลทหาร', nickname: 'มือใหม่สายเชน', kind: 'plain', marks: 0 },
  { id: 'lance', threshold: 10, title: 'สิบตรี', nickname: 'เฝ้ายามบล็อก', kind: 'chevron', marks: 1 },
  { id: 'corporal', threshold: 25, title: 'สิบโท', nickname: 'นักสอดวอลเล็ต', kind: 'chevron', marks: 2 },
  { id: 'sergeant', threshold: 50, title: 'สิบเอก', nickname: 'ผู้คุมคีย์', kind: 'chevron', marks: 3 },
  { id: 'sgt-major', threshold: 100, title: 'จ่าสิบเอก', nickname: 'จ่าเหรียญ', kind: 'chevron', marks: 4 },
  { id: 'sub-lt', threshold: 150, title: 'ร้อยตรี', nickname: 'นายร้อยแฮช', kind: 'pip', marks: 1 },
  { id: 'lt', threshold: 250, title: 'ร้อยโท', nickname: 'นักล่าสัญญาณ', kind: 'pip', marks: 2 },
  { id: 'captain', threshold: 400, title: 'ร้อยเอก', nickname: 'กัปตันออเดอร์', kind: 'pip', marks: 3 },
  { id: 'major', threshold: 600, title: 'พันตรี', nickname: 'แม่ทัพกราฟ', kind: 'flower', marks: 1 },
  { id: 'lt-col', threshold: 850, title: 'พันโท', nickname: 'ผู้การโหนด', kind: 'flower', marks: 2 },
  { id: 'colonel', threshold: 1200, title: 'พันเอก', nickname: 'ผู้พิทักษ์ซัพพลาย', kind: 'flower', marks: 3 },
  { id: 'brigadier', threshold: 1600, title: 'พลจัตวา', nickname: 'ดาวรุ่งบล็อกเชน', kind: 'star', marks: 1 },
  { id: 'maj-gen', threshold: 2200, title: 'พลตรี', nickname: 'แม่ทัพสภาพคล่อง', kind: 'star', marks: 2 },
  { id: 'lt-gen', threshold: 3000, title: 'พลโท', nickname: 'จอมยุทธ์ตลาด', kind: 'star', marks: 3 },
  { id: 'general', threshold: 4000, title: 'พลเอก', nickname: 'ผู้บัญชาการบิตคอยน์', kind: 'star', marks: 4 },
  { id: 'marshal', threshold: 6000, title: 'จอมพล', nickname: 'จอมทัพบิตคอยน์', kind: 'star', marks: 5 },
]

export function activityRankForPosts(posts: number) {
  let current = ACTIVITY_RANKS[0]!
  for (const rank of ACTIVITY_RANKS) {
    if (posts >= rank.threshold) current = rank
  }
  return current
}

export function activityRankById(id: string | null | undefined) {
  if (!id) return null
  return ACTIVITY_RANKS.find((rank) => rank.id === id) ?? null
}
