type AdminClient = any

export const SEEDING_STATUS_VALUES = [
  'Top-Seed',
  'Main-Draw',
  'Gesetzt',
  'Qualifikation - R1',
  'Qualifikation - R2',
  'Withdrawn',
] as const

export type SeedingStatus = typeof SEEDING_STATUS_VALUES[number]

const MAIN_DRAW_SEEDING: SeedingStatus[] = ['Top-Seed', 'Main-Draw', 'Gesetzt']
const QUALIFICATION_SEEDING: SeedingStatus[] = ['Qualifikation - R1', 'Qualifikation - R2']

function normalizeRanking(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return Number.MAX_SAFE_INTEGER
  return value
}

export function isValidSeedingStatus(value: unknown): value is SeedingStatus {
  return typeof value === 'string' && SEEDING_STATUS_VALUES.includes(value as SeedingStatus)
}

export async function recomputeTournamentSeeding(supabase: AdminClient, tournamentId: string) {
  const { data: rows, error } = await supabase
    .from('tournament_players')
    .select('id, seeding_status, player:players(ranking)')
    .eq('tournament_id', tournamentId)

  if (error) {
    throw new Error(`Failed to load tournament seeding rows: ${error.message}`)
  }

  const allRows = (rows || []) as Array<{
    id: string
    seeding_status: SeedingStatus | null
    player?: { ranking?: number | null } | null
  }>

  const normalizedRows = allRows.map((row) => ({
    id: row.id,
    seedingStatus: isValidSeedingStatus(row.seeding_status) ? row.seeding_status : 'Main-Draw',
    ranking: normalizeRanking(row.player?.ranking ?? null),
  }))

  const mainDrawRows = normalizedRows
    .filter((row) => MAIN_DRAW_SEEDING.includes(row.seedingStatus))
    .sort((a, b) => a.ranking - b.ranking)

  const qualificationRows = normalizedRows
    .filter((row) => QUALIFICATION_SEEDING.includes(row.seedingStatus))
    .sort((a, b) => a.ranking - b.ranking)

  const updates: Array<{
    id: string
    tournament_seed_position: number | null
    qualification_seed_position: number | null
  }> = []

  const mainDrawSeedMap = new Map<string, number>()
  for (let i = 0; i < mainDrawRows.length; i++) {
    mainDrawSeedMap.set(mainDrawRows[i].id, i + 1)
  }

  const qualificationSeedMap = new Map<string, number>()
  for (let i = 0; i < qualificationRows.length; i++) {
    qualificationSeedMap.set(qualificationRows[i].id, i + 1)
  }

  for (const row of normalizedRows) {
    updates.push({
      id: row.id,
      tournament_seed_position: mainDrawSeedMap.get(row.id) ?? null,
      qualification_seed_position: qualificationSeedMap.get(row.id) ?? null,
    })
  }

  if (updates.length === 0) return

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('tournament_players')
      .update({
        tournament_seed_position: update.tournament_seed_position,
        qualification_seed_position: update.qualification_seed_position,
      })
      .eq('id', update.id)

    if (updateError) {
      throw new Error(`Failed to update tournament seeding positions: ${updateError.message}`)
    }
  }
}
