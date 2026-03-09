import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Trophy, Users } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Fetch user's leagues and teams
  const { data: userLeagues } = await supabase
    .from('user_leagues')
    .select('league_id, leagues(name)')
    .eq('user_id', user.id)

  const { data: userTeams } = await supabase
    .from('fantasy_teams')
    .select('id, name, league_id')
    .eq('user_id', user.id)

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
              <span className="text-sm text-zinc-500">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-zinc-500 hover:text-zinc-900 flex items-center text-sm font-medium">
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
            <Link href="/admin" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              Admin Panel
            </Link>
            <Link href="/players" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              View Players
            </Link>
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
                  <li key={ul.league_id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center">
                    <span className="font-medium">{ul.leagues?.name}</span>
                    <Link href={`/dashboard/league/${ul.league_id}`} className="text-emerald-600 text-sm hover:underline">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-6 bg-zinc-50 rounded-xl border border-zinc-100 border-dashed">
                <p className="text-zinc-500 text-sm mb-3">You haven&apos;t joined any leagues yet.</p>
                <button className="text-emerald-600 text-sm font-medium hover:underline">Create or Join League</button>
              </div>
            )}
          </div>

          {/* Teams Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
            <div className="flex items-center mb-4">
              <Users className="h-5 w-5 text-zinc-400 mr-2" />
              <h2 className="text-lg font-semibold">My Teams</h2>
            </div>
            {userTeams && userTeams.length > 0 ? (
              <ul className="space-y-3">
                {userTeams.map((team: any) => (
                  <li key={team.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center">
                    <span className="font-medium">{team.name}</span>
                    <Link href={`/teams/${team.id}`} className="text-emerald-600 text-sm hover:underline">
                      Manage
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-6 bg-zinc-50 rounded-xl border border-zinc-100 border-dashed">
                <p className="text-zinc-500 text-sm mb-3">You don&apos;t have any teams yet.</p>
                <button className="text-emerald-600 text-sm font-medium hover:underline">Create Team</button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
