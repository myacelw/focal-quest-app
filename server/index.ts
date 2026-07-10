import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  upsertSession, allSessions,
  upsertCheckin, allCheckins,
  upsertBadge, allBadges,
  upsertMonster, allMonsters,
} from './db.ts'

const PORT = Number(process.env.PORT ?? 3001)

function send(res: ServerResponse, code: number, body?: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    // 家用局域网，放开跨域；正式部署再收紧
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c) => { d += c })
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? 'GET'
  const url = (req.url ?? '').split('?')[0]
  if (method === 'OPTIONS') return send(res, 204)
  try {
    if (url === '/api/health') return send(res, 200, { ok: true })

    if (url === '/api/sessions' && method === 'GET') return send(res, 200, allSessions())
    if (url === '/api/sessions' && method === 'POST') {
      upsertSession((await readBody(req)) as never)
      return send(res, 201, { ok: true })
    }

    if (url === '/api/checkins' && method === 'GET') return send(res, 200, allCheckins())
    if (url === '/api/checkins' && method === 'POST') {
      upsertCheckin((await readBody(req)) as never)
      return send(res, 200, { ok: true })
    }

    if (url === '/api/badges' && method === 'GET') return send(res, 200, allBadges())
    if (url === '/api/badges' && method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      for (const b of rows) upsertBadge(b as never)
      return send(res, 200, { ok: true })
    }

    if (url === '/api/monsters' && method === 'GET') return send(res, 200, allMonsters())
    if (url === '/api/monsters' && method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      for (const m of rows) upsertMonster(m as never)
      return send(res, 200, { ok: true })
    }

    return send(res, 404, { error: 'not found' })
  } catch (e) {
    return send(res, 500, { error: String(e) })
  }
})

server.listen(PORT, () => {
  console.log(`[focalquest-server] SQLite 后端已启动 → http://localhost:${PORT}`)
})
