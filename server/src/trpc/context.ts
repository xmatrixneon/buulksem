import { auth } from "../lib/auth"
import type * as trpcExpress from "@trpc/server/adapters/express"

export type Context = {
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
  req: trpcExpress.CreateExpressContextOptions["req"]
  res: trpcExpress.CreateExpressContextOptions["res"]
}

export async function createContext({
  req,
  res
}: trpcExpress.CreateExpressContextOptions): Promise<Context> {
  // Get session from Better Auth using request headers
  // Convert IncomingHttpHeaders to plain object with string values
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value
    } else if (Array.isArray(value)) {
      headers[key] = value[0] || ''
    }
  }

  const session = await auth.api.getSession({
    headers
  })

  return {
    session,
    req,
    res
  }
}
