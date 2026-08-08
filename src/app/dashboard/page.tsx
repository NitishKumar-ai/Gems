import Link from "next/link"
import { auth, signIn } from "@/auth"
import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

export default async function DashboardPage() {
  const session = await auth()
  
  if (!session?.user) {
    return (
      <main className="min-h-screen bg-canvas text-ink flex flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <p className="mb-8 text-ink-tint">Please sign in to view your API key.</p>
        <form
          action={async () => {
            "use server"
            await signIn("github")
          }}
        >
          <button type="submit" className="bg-primary text-on-primary px-6 py-3 rounded-md font-medium">
            Sign in with GitHub
          </button>
        </form>
      </main>
    )
  }

  // Get user from db
  let user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (user && !user.apiKey) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { apiKey: randomUUID() }
    })
  }

  const journeys = user
    ? await prisma.journey.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, username: true, repo: true, updatedAt: true },
      })
    : []

  return (
    <main className="min-h-screen bg-canvas text-ink p-8 lg:p-24">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-4xl font-display font-bold">Welcome, {user?.name}</h1>
        
        <div className="bg-surface border border-hairline-soft p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Your CLI API Key</h2>
          <p className="text-ink-tint mb-4">
            Set this in your environment to publish your vibe journeys from the terminal.
          </p>
          <div className="bg-canvas p-4 rounded-md border border-hairline-strong font-mono text-sm break-all">
            {user?.apiKey}
          </div>
          <div className="mt-4">
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">export GEMS_API_KEY=&quot;{user?.apiKey}&quot;</code>
          </div>
        </div>

        <div className="bg-surface border border-hairline-soft p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Your Published Journeys</h2>
          {journeys.length === 0 ? (
            <p className="text-ink-tint">
              Nothing published yet. Run <code className="font-mono">/gems publish</code> in a
              repository to put one here.
            </p>
          ) : (
            <ul className="space-y-2">
              {journeys.map((journey) => (
                <li key={journey.id} className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/${journey.username}/${journey.repo}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {journey.username}/{journey.repo}
                  </Link>
                  {/* An ISO date rather than a locale one: this renders on the server, so
                      `toLocaleDateString` would format in the server's locale and then mismatch
                      the client on hydration. */}
                  <span className="text-ink-tint text-sm">
                    {journey.updatedAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
