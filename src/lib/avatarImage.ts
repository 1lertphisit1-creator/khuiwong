const MAX_EDGE = 256

export async function squareAvatarBlob(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('เลือกไฟล์รูปภาพ')
  if (file.size > 8 * 1024 * 1024) throw new Error('รูปต้นฉบับใหญ่เกิน 8 MB')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = Math.floor((bitmap.width - side) / 2)
  const sy = Math.floor((bitmap.height - side) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = MAX_EDGE
  canvas.height = MAX_EDGE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('แปลงรูปไม่สำเร็จ')
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, MAX_EDGE, MAX_EDGE)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  if (!blob) throw new Error('เบราว์เซอร์นี้ยังบันทึกรูป webp ไม่ได้')
  if (blob.size > 400_000) throw new Error('รูปยังใหญ่เกินไป ลองรูปที่เรียบกว่า')
  return blob
}
