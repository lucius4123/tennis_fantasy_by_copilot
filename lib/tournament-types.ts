export type TournamentCategory = 'grand_slam' | 'masters_1000' | 'atp_500' | 'atp_250'

export type TournamentTypeOption = {
  value: string
  label: string
  category: TournamentCategory
  singlesPlayerCount: number
}

export const TOURNAMENT_TYPE_OPTIONS: TournamentTypeOption[] = [
  {
    value: 'grand_slam_128',
    label: 'Grand Slam (128 Spieler)',
    category: 'grand_slam',
    singlesPlayerCount: 128,
  },
  {
    value: 'masters_1000_96',
    label: 'Masters 1000 (96 Spieler)',
    category: 'masters_1000',
    singlesPlayerCount: 96,
  },
  {
    value: 'masters_1000_56',
    label: 'Masters 1000 (56 Spieler)',
    category: 'masters_1000',
    singlesPlayerCount: 56,
  },
  {
    value: 'atp_500_48',
    label: 'ATP 500 (48 Spieler)',
    category: 'atp_500',
    singlesPlayerCount: 48,
  },
  {
    value: 'atp_500_32',
    label: 'ATP 500 (32 Spieler)',
    category: 'atp_500',
    singlesPlayerCount: 32,
  },
  {
    value: 'atp_250_32',
    label: 'ATP 250 (32 Spieler)',
    category: 'atp_250',
    singlesPlayerCount: 32,
  },
  {
    value: 'atp_250_28',
    label: 'ATP 250 (28 Spieler)',
    category: 'atp_250',
    singlesPlayerCount: 28,
  },
]

export function findTournamentTypeOption(value: string | null | undefined) {
  if (!value) return null
  return TOURNAMENT_TYPE_OPTIONS.find((option) => option.value === value) || null
}

export function getTournamentTypeValue(
  category: string | null | undefined,
  singlesPlayerCount: number | null | undefined,
) {
  const normalizedCount = typeof singlesPlayerCount === 'number' ? singlesPlayerCount : Number(singlesPlayerCount)
  if (!category || !Number.isFinite(normalizedCount)) return null

  const match = TOURNAMENT_TYPE_OPTIONS.find(
    (option) => option.category === category && option.singlesPlayerCount === normalizedCount
  )

  return match?.value || null
}
