import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * 每个测试文件在导入任何涉及数据库的模块之前，先调用本函数设置独立的临时 DB_PATH，
 * 保证测试之间互不干扰，也不污染开发库。
 */
export function createTempDatabase(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gsb-${label}-`))
  const dbPath = path.join(dir, 'test.db')
  process.env.DB_PATH = dbPath
  return dbPath
}

/**
 * 直接构造 authMiddleware 可识别的令牌：base64("<userId>:<timestamp>")。
 * 中间件仅校验令牌格式并按 userId 查库，不校验密码。
 */
export function makeToken(userId: number): string {
  return Buffer.from(`${userId}:${Date.now()}`).toString('base64')
}

export interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

/**
 * 启动测试服务器（随机端口），返回基础地址与关闭方法。
 */
export async function startTestServer(app: import('express').Application): Promise<TestServer> {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

export interface HttpResult {
  status: number
  body: { success: boolean; data?: unknown; error?: string; message?: string }
}

export async function api(
  baseUrl: string,
  method: string,
  urlPath: string,
  options?: { token?: string; body?: unknown },
): Promise<HttpResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options?.token) headers.Authorization = `Bearer ${options.token}`
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let body: HttpResult['body']
  try {
    body = (await res.json()) as HttpResult['body']
  } catch {
    body = { success: false }
  }
  return { status: res.status, body }
}
