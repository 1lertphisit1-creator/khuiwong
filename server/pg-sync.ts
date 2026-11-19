import path from 'node:path'
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads'

type SqlStatement = {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): { changes: number; lastInsertRowid: number }
}

export type SqlDatabase = {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
}

type WorkerResponse = {
  ok: boolean
  error?: string
  row?: unknown
  rows?: unknown[]
  changes?: number
  lastInsertRowid?: number
}

export function createPgDatabase(): SqlDatabase {
  const worker = new Worker(path.resolve('server/pg-worker.mjs'))
  worker.unref()
  const database: SqlDatabase = {
    exec(sql: string) {
      const result = callWorker(worker, { op: 'exec', sql })
      if (!result.ok) throw new Error(result.error || 'PostgreSQL exec failed')
    },
    prepare(sql: string): SqlStatement {
      return {
        get(...params: unknown[]) {
          const result = callWorker(worker, { op: 'get', sql, params })
          if (!result.ok) throw new Error(result.error || 'PostgreSQL query failed')
          return result.row ?? undefined
        },
        all(...params: unknown[]) {
          const result = callWorker(worker, { op: 'all', sql, params })
          if (!result.ok) throw new Error(result.error || 'PostgreSQL query failed')
          return result.rows ?? []
        },
        run(...params: unknown[]) {
          const result = callWorker(worker, { op: 'run', sql, params })
          if (!result.ok) throw new Error(result.error || 'PostgreSQL query failed')
          return { changes: result.changes ?? 0, lastInsertRowid: result.lastInsertRowid ?? 0 }
        },
      }
    },
  }
  database.exec('SELECT 1')
  return database
}

function callWorker(worker: Worker, message: { op: string; sql: string; params?: unknown[] }): WorkerResponse {
  const { port1, port2 } = new MessageChannel()
  worker.postMessage({ ...message, port: port2 }, [port2])
  const pause = new Int32Array(new SharedArrayBuffer(4))
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    const received = receiveMessageOnPort(port1)
    if (received) return received.message as WorkerResponse
    Atomics.wait(pause, 0, 0, 15)
  }
  throw new Error('PostgreSQL query timed out')
}
