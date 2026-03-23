import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'

type TournamentData = {
  id: string
  name: string
  start_date: string
}

type TournamentPlayerRow = {
  id: string
  seeding_status: 'Top-Seed' | 'Main-Draw' | 'Gesetzt' | 'Qualifikation - R1' | 'Qualifikation - R2' | null
  appearance_probability: string | null
  tournament_seed_position: number | null
  player:
    | {
    id: string
    first_name: string
    last_name: string
    ranking: number | null
    image_url: string | null
  }
    | {
    id: string
    first_name: string
    last_name: string
    ranking: number | null
    image_url: string | null
  }[]
    | null
}

const defaultPlayerImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`

export default async function TournamentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, name, start_date')
    .eq('id', id)
    .single()

  if (tournamentError || !tournament) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <main className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 mb-6">
            <ArrowLeft className="h-4 w-4" />
            Zurueck zum Dashboard
          </Link>
          <div className="bg-white p-6 rounded-2xl border border-zinc-200">
            <p className="text-sm text-zinc-600">Turnier nicht gefunden.</p>
          </div>
        </main>
      </div>
    )
  }

  const { data: tournamentPlayers, error: playersError } = await supabase
    .from('tournament_players')
    .select('id, seeding_status, appearance_probability, tournament_seed_position, player:players(id, first_name, last_name, ranking, image_url)')
    .eq('tournament_id', id)

  if (playersError) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <main className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 mb-6">
            <ArrowLeft className="h-4 w-4" />
            Zurueck zum Dashboard
          </Link>
          <div className="bg-white p-6 rounded-2xl border border-zinc-200">
            <p className="text-sm text-zinc-600">Fehler beim Laden der Spieler.</p>
          </div>
        </main>
      </div>
    )
  }

  const normalizedPlayers = ((tournamentPlayers as TournamentPlayerRow[] | null) || [])
    .map((row) => ({
      ...row,
      player: Array.isArray(row.player)
        ? row.player[0] || null
        : row.player,
    }))
    .filter((row) => {
      const probability = (row.appearance_probability || '').trim()
      const seedingStatus = (row.seeding_status || 'Main-Draw').trim()

      return (
        Boolean(row.player) &&
        probability === 'Garantiert' &&
        (seedingStatus === 'Top-Seed' || seedingStatus === 'Main-Draw' || seedingStatus === 'Gesetzt')
      )
    })

  const sortedPlayers = normalizedPlayers
    .sort((a, b) => {
      const seedingPriority = (status: string | null) => {
        if (status === 'Top-Seed') return 0
        if (status === 'Gesetzt') return 1
        if (status === 'Main-Draw') return 2
        return 3
      }

      const statusDiff = seedingPriority(a.seeding_status) - seedingPriority(b.seeding_status)
      if (statusDiff !== 0) return statusDiff

      const aSeed = a.tournament_seed_position ?? Number.MAX_SAFE_INTEGER
      const bSeed = b.tournament_seed_position ?? Number.MAX_SAFE_INTEGER
      if (aSeed !== bSeed) return aSeed - bSeed

      const aRanking = a.player?.ranking ?? Number.MAX_SAFE_INTEGER
      const bRanking = b.player?.ranking ?? Number.MAX_SAFE_INTEGER
      if (aRanking !== bRanking) return aRanking - bRanking

      const aName = `${a.player?.first_name || ''} ${a.player?.last_name || ''}`.toLowerCase()
      const bName = `${b.player?.first_name || ''} ${b.player?.last_name || ''}`.toLowerCase()
      return aName.localeCompare(bName)
    })

  const typedTournament = tournament as TournamentData

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 mb-6">
          <ArrowLeft className="h-4 w-4" />
          Zurueck zum Dashboard
        </Link>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-semibold">{typedTournament.name}</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Garantierte Spieler im Main Draw ({sortedPlayers.length})
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Start: {new Date(typedTournament.start_date).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
          {sortedPlayers.length > 0 ? (
            <ul className="space-y-3">
              {sortedPlayers.map((entry) => (
                <li
                  key={entry.id}
                  className={`rounded-xl border p-3 ${
                    entry.seeding_status === 'Top-Seed'
                      ? 'border-fuchsia-300 bg-fuchsia-50'
                      : entry.seeding_status === 'Gesetzt'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-zinc-100 bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={entry.player?.image_url || defaultPlayerImageUrl}
                        alt={`${entry.player?.first_name} ${entry.player?.last_name}`}
                        className="h-10 w-10 rounded-full object-cover border border-zinc-200"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 truncate">
                          {entry.player?.first_name} {entry.player?.last_name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Rang #{entry.player?.ranking ?? '-'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                        Setzung #{entry.tournament_seed_position ?? '-'}
                      </span>
                      {entry.seeding_status === 'Top-Seed' ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-fuchsia-200 text-fuchsia-900">
                          Top-Seed
                        </span>
                      ) : entry.seeding_status === 'Gesetzt' ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-200 text-amber-900">
                          Gesetzt
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-zinc-200 text-zinc-700">
                          Main-Draw
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-zinc-100 border-dashed bg-zinc-50 py-8 text-center">
              <p className="text-sm text-zinc-500">
                Fuer dieses Turnier gibt es aktuell keine garantierten Main-Draw-Spieler.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
