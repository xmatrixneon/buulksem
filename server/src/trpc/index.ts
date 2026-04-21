import { initTRPC, TRPCError } from "@trpc/server"
import type { Context } from "./context"
import superjson from "superjson"

const t = initTRPC.context<Context>().create({
  transformer: superjson
})

export const router = t.router
export const publicProcedure = t.procedure

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(async function isAuthed(opts) {
  const { ctx } = opts

  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource"
    })
  }

  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session // Infers session as non-nullable
    }
  })
})
