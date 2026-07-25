/** Functions 共用的 JSON 请求/响应助手。 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 同域调用，无需 CORS；显式禁缓存以防中间层缓存接口响应
      'Cache-Control': 'no-store',
    },
  })
}

export function errorJson(code: string, status: number): Response {
  return json({ error: code }, status)
}

/** 读 JSON body，超过 size 上限或格式非法返回 null（不抛） */
export async function readJson<T>(req: Request, maxBytes = 1_048_576): Promise<T | null> {
  const len = Number(req.headers.get('Content-Length') ?? '0')
  if (len > maxBytes) return null
  try {
    const text = await req.text()
    if (text.length > maxBytes) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/** 取客户端 IP（Cloudflare 保证 CF-Connecting-IP 存在且不可伪造） */
export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'unknown'
}
