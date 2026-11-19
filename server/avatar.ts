import sharp from 'sharp'

const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])

export async function compressAvatar(input: Buffer) {
  if (input.length === 0) throw new Error('ไม่พบไฟล์รูป')
  if (input.length > 2 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 2 MB')
  const image = sharp(input, { animated: false, failOn: 'none' })
  const meta = await image.metadata()
  if (!meta.format || !FORMATS.has(meta.format)) throw new Error('รองรับเฉพาะ jpg, png, webp และ gif')
  return image.rotate().resize(128, 128, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toBuffer()
}
