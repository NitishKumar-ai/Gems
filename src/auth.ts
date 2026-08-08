import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    /**
     * Records the GitHub handle on the user row. `/api/publish` publishes under this and nothing
     * else, so it is the only thing standing between a signed-in stranger and a profile at
     * `/torvalds/linux`.
     *
     * This is an *event*, not the `signIn` callback, and the difference is load-bearing. The
     * callback runs inside `handleAuthorized`, before `handleLoginOrRegister` — so on a first
     * sign-in there is no row yet and `user.id` is the provider's id rather than a database one.
     * Events run after, with the persisted user and the raw OAuth profile both in hand.
     *
     * Overriding the provider's `profile()` mapper would cover new users only. Running on every
     * sign-in also backfills accounts created before this field existed, and follows a handle
     * rename on GitHub.
     */
    async signIn({ user, profile, account }) {
      if (account?.provider !== "github") return

      const login = typeof profile?.login === "string" ? profile.login : null
      if (!login || !user.id) return

      try {
        await prisma.user.update({ where: { id: user.id }, data: { githubLogin: login } })
      } catch (error) {
        // `githubLogin` is unique, so this throws when a handle now points at a different
        // account than it used to — someone renamed, and someone else took the name. Publishing
        // is refused for an unbound account, which is the safe end to fail on, so sign-in itself
        // must not break here.
        console.error(`Could not bind GitHub login "${login}" to user ${user.id}:`, error)
      }
    },
  },
})
