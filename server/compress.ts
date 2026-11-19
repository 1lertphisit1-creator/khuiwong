import { createBrotliCompress, createGzip, constants } from 'node:zlib'
import type { NextFunction, Request, Response } from 'express'

const COMPRESSIBLE = /text|json|javascript|xml|svg|wasm/

export function compressResponses(req: Request, res: Response, next: NextFunction) {
  const accept = String(req.headers['accept-encoding'] || '')
  const brotli = /\bbr\b/.test(accept)
  const gzip = /\bgzip\b/.test(accept)
  if ((!brotli && !gzip) || req.method === 'HEAD') return next()
  const encoding = brotli ? 'br' : 'gzip'
  const zlibStream = brotli
    ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    : createGzip({ level: 6 })
  const write = res.write.bind(res)
  const end = res.end.bind(res)
  let mode: 'open' | 'compress' | 'plain' = 'open'

  function begin() {
    if (mode !== 'open') return
    if (res.headersSent || res.getHeader('Content-Encoding')) {
      mode = 'plain'
      return
    }
    const type = String(res.getHeader('Content-Type') || '')
    const length = Number(res.getHeader('Content-Length') || 0)
    if ((type && !COMPRESSIBLE.test(type)) || (length > 0 && length < 1024)) {
      mode = 'plain'
      return
    }
    mode = 'compress'
    res.setHeader('Content-Encoding', encoding)
    res.setHeader('Vary', 'Accept-Encoding')
    res.removeHeader('Content-Length')
    zlibStream.on('data', (chunk) => {
      write(chunk)
    })
    zlibStream.on('end', () => {
      end()
    })
  }

  res.write = ((chunk, encodingOrCb, cb) => {
    begin()
    if (mode !== 'compress') return write(chunk, encodingOrCb, cb)
    return zlibStream.write(chunk, encodingOrCb, cb)
  }) as typeof res.write

  res.end = ((chunk, encodingOrCb, cb) => {
    begin()
    if (mode !== 'compress') return end(chunk, encodingOrCb, cb)
    if (chunk) zlibStream.write(chunk, encodingOrCb)
    zlibStream.end()
    return res
  }) as typeof res.end

  next()
}
