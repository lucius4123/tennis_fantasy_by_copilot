import { createClient } from '@/utils/supabase/server'
import { isAdminUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Trophy } from 'lucide-react'

type ScoringRule = {
  id: string
  stat_name: string
  points_per_unit: number
  description: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const userIsAdmin = isAdminUser(user as any);

  // Fetch user's leagues and teams
  const { data: userLeagues } = await supabase
    .from('user_leagues')
    .select('league_id, leagues(name)')
    .eq('user_id', user.id)

  const { data: scoringRules } = await supabase
    .from('scoring_rules')
    .select('id, stat_name, points_per_unit, description')
    .order('stat_name', { ascending: true })

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <nav className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Trophy className="h-6 w-6 text-emerald-600 mr-2" />
              <span className="font-semibold text-xl tracking-tight">Tennis Fantasy</span>
            </div>
            <div className="flex items-center space-x-4">
              <form action="/auth/signout" method="post">
                <button type="submit" className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900">
                  <LogOut className="h-4 w-4 mr-1" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex gap-3">
            {userIsAdmin && (
              <Link href="/admin" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                Admin Panel
              </Link>
            )}
            {userIsAdmin && (
              <Link href="/players" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                View Players
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Leagues Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
            <div className="flex items-center mb-4">
              <Trophy className="h-5 w-5 text-zinc-400 mr-2" />
              <h2 className="text-lg font-semibold">My Leagues</h2>
            </div>
            {userLeagues && userLeagues.length > 0 ? (
              <ul className="space-y-3">
                {userLeagues.map((ul: any) => (
                  <li key={ul.league_id}>
                    <Link
                      href={`/dashboard/league/${ul.league_id}`}
                      className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-3 transition-colors hover:border-emerald-300"
                    >
                      <span className="font-medium">{ul.leagues?.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-zinc-100 border-dashed bg-zinc-50 py-6 text-center">
                <p className="mb-3 text-sm text-zinc-500">You haven&apos;t joined any leagues yet.</p>
                <button className="text-emerald-600 text-sm font-medium hover:underline">Create or Join League</button>
              </div>
            )}
          </div>

          {/* Global Scoring Rules Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
            <div className="flex items-center mb-4">
              <Trophy className="h-5 w-5 text-zinc-400 mr-2" />
              <h2 className="text-lg font-semibold">Globale Punkteverteilung</h2>
            </div>
            {scoringRules && scoringRules.length > 0 ? (
              <ul className="space-y-3">
                {(scoringRules as ScoringRule[]).map((rule) => (
                  <li key={rule.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="flex justify-between items-center gap-3">
                      <span className="font-medium text-zinc-900">{rule.description || rule.stat_name}</span>
                      <span
                        className={`text-sm font-semibold whitespace-nowrap ${
                          rule.points_per_unit < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {rule.points_per_unit > 0 ? '+' : ''}
                        {rule.points_per_unit}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{rule.stat_name}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-zinc-100 border-dashed bg-zinc-50 py-6 text-center">
                <p className="text-sm text-zinc-500">Keine Punkteverteilung gefunden.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="text-xs text-zinc-500 leading-relaxed">
          <p>Tennis Fantasy Manager</p>
          <p>Version 1.0.0</p>
          <p>Early-Access</p>
        </div>
      </footer>
    </div>
  )
}
