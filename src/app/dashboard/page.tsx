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
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">export GEMS_API_KEY="{user?.apiKey}"</code>
          </div>
        </div>

        <div className="bg-surface border border-hairline-soft p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Your Published Journeys</h2>
          <p className="text-ink-tint mb-4">These will appear here soon.</p>
        </div>
      </div>
    </main>
  )
}
