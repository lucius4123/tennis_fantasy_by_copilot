'use client'

import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Calendar, Users, Save, RotateCcw, Target, Trophy, Pencil } from 'lucide-react'
import { useState, useEffect } from 'react'
import { findTournamentTypeOption, getTournamentTypeValue, TOURNAMENT_TYPE_OPTIONS } from '@/lib/tournament-types'

interface Tournament {
  id: string
  name: string
  start_date: string
  is_active: boolean
  status: 'upcoming' | 'on-going' | 'completed'
  start_budget: number
  starter_team_target_value: number
  starter_team_player_count: number
  country_code: string | null
  previous_winner_player_id: string | null
  tournament_category: string | null
  singles_player_count: number | null
  tournament_type: string | null
  newcomer_enabled: boolean
}

interface SupabaseErrorLike {
  code?: string
  message?: string
}

interface Player {
  id: string
  first_name: string
  last_name: string
  ranking: number
  image_url: string
}

interface TournamentPlayer {
  id: string
  tournament_id: string
  player_id: string
  appearance_probability: string
  is_wildcard?: boolean
  seeding_status?: 'Top-Seed' | 'Main-Draw' | 'Gesetzt' | 'Qualifikation - R1' | 'Qualifikation - R2' | 'Withdrawn'
  tournament_seed_position?: number | null
  qualification_seed_position?: number | null
  market_value?: number
  player?: Player
}

interface Match {
  id: string
  player_id: string
  tournament_id?: string
  tournament_name: string
  round?: 'R1' | 'R2' | 'R3' | 'QF' | 'SF' | 'F' | null
  opponent_name: string
  match_result: string
  match_date: string
  fantasy_points: number
  aces: number
  double_faults: number
  first_serve_percentage: number
  break_points_won: number
  break_points_faced: number
  net_points_won: number
  breaks_conceded: number
  total_points_won: number
  winners: number
  unforced_errors: number
  sets_won: number
  player?: Player
}

interface ScoringRule {
  id: string
  stat_name: string
  points_per_unit: number
  description: string
}

const probabilityOptions = [
  'Garantiert',
  'Sehr Wahrscheinlich',
  'Wahrscheinlich',
  'Riskant',
  'Sehr Riskant',
  'Ausgeschlossen',
]

const seedingStatusOptions = [
  'Top-Seed',
  'Main-Draw',
  'Gesetzt',
  'Qualifikation - R1',
  'Qualifikation - R2',
  'Withdrawn',
] as const

const probabilityColors: Record<string, string> = {
  Garantiert: 'bg-green-100 text-green-800 border-green-300',
  'Sehr Wahrscheinlich': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Wahrscheinlich: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Riskant: 'bg-orange-100 text-orange-800 border-orange-300',
  'Sehr Riskant': 'bg-red-100 text-red-800 border-red-300',
  Ausgeschlossen: 'bg-zinc-200 text-zinc-800 border-zinc-400',
}

const roundOptions = ['R1', 'R2', 'R3', 'QF', 'SF', 'F'] as const

const emptyMatchFormData = {
  player_id: '',
  tournament_id: '',
  tournament_name: '',
  round: 'R1',
  opponent_name: '',
  match_result: 'won',
  match_date: '',
  aces: 0,
  double_faults: 0,
  first_serve_percentage: 0,
  break_points_won: 0,
  break_points_faced: 0,
  net_points_won: 0,
  breaks_conceded: 0,
  total_points_won: 0,
  winners: 0,
  unforced_errors: 0,
  sets_won: 0,
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'tournaments' | 'matches' | 'scoring' | 'transfermarkt'>('tournaments')
  
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [originalTournaments, setOriginalTournaments] = useState<Tournament[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null)
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([])
  const [originalTournamentPlayers, setOriginalTournamentPlayers] = useState<TournamentPlayer[]>([])
  const [pendingDeletedTournamentIds, setPendingDeletedTournamentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newTournamentName, setNewTournamentName] = useState('')
  const [newTournamentDate, setNewTournamentDate] = useState('')
  const [newTournamentStartBudget, setNewTournamentStartBudget] = useState(1000000)
  const [newTournamentStarterTeamTargetValue, setNewTournamentStarterTeamTargetValue] = useState(0)
  const [newTournamentStarterTeamPlayerCount, setNewTournamentStarterTeamPlayerCount] = useState(8)
  const [newTournamentCountryCode, setNewTournamentCountryCode] = useState('')
  const [newTournamentPreviousWinnerPlayerId, setNewTournamentPreviousWinnerPlayerId] = useState('')
  const [newTournamentType, setNewTournamentType] = useState('')
  const [newTournamentNewcomerEnabled, setNewTournamentNewcomerEnabled] = useState(true)
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Match management state
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [matchFormData, setMatchFormData] = useState(emptyMatchFormData)

  // Scoring rules state
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([])
  const [originalScoringRules, setOriginalScoringRules] = useState<ScoringRule[]>([])

  // Transfer market config state
  const [tmTargetOffers, setTmTargetOffers] = useState(8)
  const [tmMinHours, setTmMinHours] = useState(3)
  const [tmMaxHours, setTmMaxHours] = useState(24)
  const [tmRunning, setTmRunning] = useState(false)
  const [tmResult, setTmResult] = useState<{ success?: boolean; summary?: any; error?: string } | null>(null)

  // Clear news state
  const [clearNewsRunning, setClearNewsRunning] = useState(false)
  const [clearNewsResult, setClearNewsResult] = useState<{ success?: boolean; error?: string } | null>(null)

  const formatSupabaseError = (error: SupabaseErrorLike | null) => {
    if (!error) return 'Unbekannter Fehler'
    return `${error.message || 'Fehler'}${error.code ? ` (Code: ${error.code})` : ''}`
  }

  useEffect(() => {
    loadTournaments()
    loadPlayers()
    loadMatches()
    loadScoringRules()
  }, [])

  useEffect(() => {
    if (!selectedTournament) return

    if (selectedTournament.id.startsWith('temp-')) {
      setTournamentPlayers([])
      setOriginalTournamentPlayers([])
      return
    }

    loadTournamentPlayers(selectedTournament.id)
  }, [selectedTournament])

  const loadTournaments = async () => {
    const response = await fetch('/api/admin/tournaments')
    const payload = await response.json()

    if (!response.ok) {
      console.error('Error loading tournaments:', payload)
    } else {
      const normalized = (payload.tournaments || []).map((t: any) => ({
        ...t,
        is_active: Boolean(t.is_active),
        start_budget: Number(t.start_budget ?? 1000000),
        starter_team_target_value: Number(t.starter_team_target_value ?? 0),
        starter_team_player_count: Number(t.starter_team_player_count ?? 8),
        country_code: t.country_code ? String(t.country_code).toUpperCase() : null,
        previous_winner_player_id: t.previous_winner_player_id || null,
        tournament_category: t.tournament_category || null,
        singles_player_count: t.singles_player_count != null ? Number(t.singles_player_count) : null,
        tournament_type: getTournamentTypeValue(t.tournament_category || null, t.singles_player_count ?? null),
        newcomer_enabled: t.newcomer_enabled !== false,
      }))
      setTournaments(normalized)
      setOriginalTournaments(normalized)
      setPendingDeletedTournamentIds([])
    }

    setLoading(false)
  }

  const loadPlayers = async () => {
    const response = await fetch('/api/admin/players')
    const payload = await response.json()

    if (!response.ok) {
      console.error('Error loading players:', payload)
      return
    }

    setPlayers(payload.players || [])
  }

  const loadTournamentPlayers = async (tournamentId: string) => {
    const response = await fetch(`/api/admin/tournaments/${tournamentId}/players`)
    const payload = await response.json()

    if (!response.ok) {
      console.error('Error loading tournament players:', payload)
      return
    }

    const normalized = (payload.tournamentPlayers || []).map((tp: TournamentPlayer) => ({
      ...tp,
      is_wildcard: Boolean(tp.is_wildcard),
      seeding_status: tp.seeding_status || 'Main-Draw',
      tournament_seed_position: tp.tournament_seed_position ?? null,
      qualification_seed_position: tp.qualification_seed_position ?? null,
    }))
    setTournamentPlayers(normalized)
    setOriginalTournamentPlayers(normalized)
    setHasUnsavedChanges(false)
  }

  const createTournament = async () => {
    if (!newTournamentName || !newTournamentDate) {
      alert('Bitte fülle alle Felder aus')
      return
    }

    if (newTournamentStartBudget < 0 || newTournamentStarterTeamTargetValue < 0) {
      alert('Startkapital und Starterteam-Zielwert müssen 0 oder größer sein')
      return
    }

    if (!Number.isInteger(newTournamentStarterTeamPlayerCount) || newTournamentStarterTeamPlayerCount <= 0) {
      alert('Die Anzahl der Starterteam-Spieler muss mindestens 1 sein')
      return
    }

    const normalizedCountryCode = newTournamentCountryCode.trim().toUpperCase()
    if (normalizedCountryCode && !/^[A-Z]{2}$/.test(normalizedCountryCode)) {
      alert('Land muss als ISO-2 Code angegeben werden (z. B. DE)')
      return
    }

    const tempTournament: Tournament = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newTournamentName,
      start_date: new Date(newTournamentDate).toISOString(),
      is_active: false,
      status: 'upcoming',
      start_budget: newTournamentStartBudget,
      starter_team_target_value: newTournamentStarterTeamTargetValue,
      starter_team_player_count: newTournamentStarterTeamPlayerCount,
      country_code: normalizedCountryCode || null,
      previous_winner_player_id: newTournamentPreviousWinnerPlayerId || null,
      tournament_category: findTournamentTypeOption(newTournamentType)?.category ?? null,
      singles_player_count: findTournamentTypeOption(newTournamentType)?.singlesPlayerCount ?? null,
      tournament_type: newTournamentType || null,
      newcomer_enabled: newTournamentNewcomerEnabled,
    }

    setTournaments((prev) => [...prev, tempTournament])
    setNewTournamentName('')
    setNewTournamentDate('')
    setNewTournamentStartBudget(1000000)
    setNewTournamentStarterTeamTargetValue(0)
    setNewTournamentStarterTeamPlayerCount(8)
    setNewTournamentCountryCode('')
    setNewTournamentPreviousWinnerPlayerId('')
    setNewTournamentType('')
    setNewTournamentNewcomerEnabled(true)
    setHasUnsavedChanges(true)
  }

  const updateTournamentSettings = (tournamentId: string, updates: Partial<Tournament>) => {
    setTournaments((prev) =>
      prev.map((t) => (t.id === tournamentId ? { ...t, ...updates } : t))
    )
    setHasUnsavedChanges(true)
  }

  const toggleTournamentActive = (tournament: Tournament) => {
    const nextActive = !tournament.is_active

    setTournaments((prev) =>
      prev.map((t) => (t.id === tournament.id ? { ...t, is_active: nextActive } : t))
    )

    setHasUnsavedChanges(true)
  }

  const updateTournamentStatus = (tournamentId: string, newStatus: 'upcoming' | 'on-going' | 'completed') => {
    setTournaments((prev) =>
      prev.map((t) => (t.id === tournamentId ? { ...t, status: newStatus } : t))
    )
    setHasUnsavedChanges(true)
  }

  const deleteTournament = (tournamentId: string) => {
    if (!confirm('Turnier wirklich löschen?')) return

    if (!tournamentId.startsWith('temp-')) {
      setPendingDeletedTournamentIds((prev) => [...prev, tournamentId])
    }

    setTournaments((prev) => prev.filter((t) => t.id !== tournamentId))

    if (selectedTournament?.id === tournamentId) {
      setSelectedTournament(null)
    }

    setHasUnsavedChanges(true)
  }

  const addPlayerToTournament = (playerId: string) => {
    if (!selectedTournament) return

    const exists = tournamentPlayers.some((tp) => tp.player_id === playerId)
    if (exists) {
      alert('Spieler ist bereits diesem Turnier zugeordnet')
      return
    }

    const selectedPlayer = players.find((p) => p.id === playerId)
    if (!selectedPlayer) return

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    setTournamentPlayers((prev) => [
      ...prev,
      {
        id: tempId,
        tournament_id: selectedTournament.id,
        player_id: playerId,
        appearance_probability: 'Garantiert',
        is_wildcard: false,
        seeding_status: 'Main-Draw',
        tournament_seed_position: null,
        qualification_seed_position: null,
        market_value: 0,
        player: selectedPlayer,
      },
    ])

    setHasUnsavedChanges(true)
  }

  const updatePlayerProbability = (tournamentPlayerId: string, probability: string) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) =>
        tp.id === tournamentPlayerId
          ? {
              ...tp,
              appearance_probability: probability,
              is_wildcard: probability === 'Garantiert' ? tp.is_wildcard : false,
            }
          : tp
      )
    )
    setHasUnsavedChanges(true)
  }

  const updatePlayerWildcard = (tournamentPlayerId: string, isWildcard: boolean) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) =>
        tp.id === tournamentPlayerId
          ? {
              ...tp,
              is_wildcard: isWildcard,
              appearance_probability: isWildcard ? 'Garantiert' : tp.appearance_probability,
            }
          : tp
      )
    )
    setHasUnsavedChanges(true)
  }

  const updatePlayerMarketValue = (tournamentPlayerId: string, marketValue: number) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) => (tp.id === tournamentPlayerId ? { ...tp, market_value: marketValue } : tp))
    )
    setHasUnsavedChanges(true)
  }

  const updatePlayerSeedingStatus = (
    tournamentPlayerId: string,
    seedingStatus: 'Top-Seed' | 'Main-Draw' | 'Gesetzt' | 'Qualifikation - R1' | 'Qualifikation - R2'
  ) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) =>
        tp.id === tournamentPlayerId
          ? {
              ...tp,
              seeding_status: seedingStatus,
              tournament_seed_position: null,
              qualification_seed_position: null,
            }
          : tp
      )
    )
    setHasUnsavedChanges(true)
  }

  const removePlayerFromTournament = (tournamentPlayerId: string) => {
    setTournamentPlayers((prev) => prev.filter((tp) => tp.id !== tournamentPlayerId))
    setHasUnsavedChanges(true)
  }

  const discardChanges = () => {
    setTournaments(originalTournaments)
    setTournamentPlayers(originalTournamentPlayers)
    setScoringRules(originalScoringRules)
    setPendingDeletedTournamentIds([])

    if (selectedTournament?.id.startsWith('temp-')) {
      setSelectedTournament(null)
    }

    setHasUnsavedChanges(false)
  }

  const saveChanges = async () => {
    setSaving(true)

    try {
      const createdTournaments = tournaments.filter((t) => t.id.startsWith('temp-'))
      for (const tournament of createdTournaments) {
        const response = await fetch('/api/admin/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: tournament.name,
              startDate: tournament.start_date,
              start_budget: tournament.start_budget,
              starter_team_target_value: tournament.starter_team_target_value,
              starter_team_player_count: tournament.starter_team_player_count,
              country_code: tournament.country_code,
              previous_winner_player_id: tournament.previous_winner_player_id,
              tournament_type: tournament.tournament_type,
              newcomer_enabled: tournament.newcomer_enabled,
            }),
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Fehler beim Erstellen eines Turniers')
        }
      }

      for (const tournamentId of pendingDeletedTournamentIds) {
        const response = await fetch(`/api/admin/tournaments/${tournamentId}`, { method: 'DELETE' })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Fehler beim Löschen eines Turniers')
        }
      }

      const changedTournaments = tournaments.filter((t) => {
        if (t.id.startsWith('temp-')) return false
        const original = originalTournaments.find((o) => o.id === t.id)
        return original && (
          original.is_active !== t.is_active ||
          original.status !== t.status ||
          original.start_budget !== t.start_budget ||
          original.starter_team_target_value !== t.starter_team_target_value ||
          original.starter_team_player_count !== t.starter_team_player_count ||
          (original.country_code || null) !== (t.country_code || null) ||
          (original.previous_winner_player_id || null) !== (t.previous_winner_player_id || null) ||
          (original.tournament_type || null) !== (t.tournament_type || null) ||
          original.newcomer_enabled !== t.newcomer_enabled
        )
      })

      for (const tournament of changedTournaments) {
        const updatePayload: any = {}
        const original = originalTournaments.find((o) => o.id === tournament.id)
        
        if (original && original.is_active !== tournament.is_active) {
          updatePayload.is_active = tournament.is_active
        }
        if (original && original.status !== tournament.status) {
          updatePayload.status = tournament.status
        }
        if (original && original.start_budget !== tournament.start_budget) {
          updatePayload.start_budget = tournament.start_budget
        }
        if (original && original.starter_team_target_value !== tournament.starter_team_target_value) {
          updatePayload.starter_team_target_value = tournament.starter_team_target_value
        }
        if (original && original.starter_team_player_count !== tournament.starter_team_player_count) {
          updatePayload.starter_team_player_count = tournament.starter_team_player_count
        }
        if (original && (original.country_code || null) !== (tournament.country_code || null)) {
          updatePayload.country_code = tournament.country_code || null
        }
        if (original && (original.previous_winner_player_id || null) !== (tournament.previous_winner_player_id || null)) {
          updatePayload.previous_winner_player_id = tournament.previous_winner_player_id || null
        }
        if (original && (original.tournament_type || null) !== (tournament.tournament_type || null)) {
          updatePayload.tournament_type = tournament.tournament_type || null
        }
        if (original && original.newcomer_enabled !== tournament.newcomer_enabled) {
          updatePayload.newcomer_enabled = tournament.newcomer_enabled
        }

        const response = await fetch(`/api/admin/tournaments/${tournament.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Fehler beim Speichern des Turniers')
        }
      }

      if (selectedTournament && !selectedTournament.id.startsWith('temp-')) {
        const originalById = new Map(originalTournamentPlayers.map((tp) => [tp.id, tp]))
        const currentById = new Map(tournamentPlayers.map((tp) => [tp.id, tp]))

        const deleted = originalTournamentPlayers.filter((tp) => !currentById.has(tp.id))
        for (const item of deleted) {
          const response = await fetch(`/api/admin/tournament-players/${item.id}`, { method: 'DELETE' })
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload?.error || 'Fehler beim Entfernen eines Spielers')
          }
        }

        const changedItems = tournamentPlayers.filter((tp) => {
          if (tp.id.startsWith('temp-')) return false
          const original = originalById.get(tp.id)
          return original && (
            original.appearance_probability !== tp.appearance_probability ||
            original.market_value !== tp.market_value ||
            Boolean(original.is_wildcard) !== Boolean(tp.is_wildcard) ||
            (original.seeding_status || 'Main-Draw') !== (tp.seeding_status || 'Main-Draw')
          )
        })

        for (const item of changedItems) {
          const updatePayload: any = {}
          const original = originalById.get(item.id)
          
          if (original && original.appearance_probability !== item.appearance_probability) {
            updatePayload.appearance_probability = item.appearance_probability
          }
          if (original && original.market_value !== item.market_value) {
            updatePayload.market_value = item.market_value
          }
          if (original && Boolean(original.is_wildcard) !== Boolean(item.is_wildcard)) {
            updatePayload.is_wildcard = Boolean(item.is_wildcard)
          }
          if (original && (original.seeding_status || 'Main-Draw') !== (item.seeding_status || 'Main-Draw')) {
            updatePayload.seeding_status = item.seeding_status || 'Main-Draw'
          }

          const response = await fetch(`/api/admin/tournament-players/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          })
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload?.error || 'Fehler beim Aktualisieren des Spielers')
          }
        }

        const created = tournamentPlayers.filter((tp) => tp.id.startsWith('temp-'))
        for (const item of created) {
          const response = await fetch(`/api/admin/tournaments/${selectedTournament.id}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              player_id: item.player_id,
              appearance_probability: item.appearance_probability,
              market_value: item.market_value || 0,
              is_wildcard: Boolean(item.is_wildcard),
              seeding_status: item.seeding_status || 'Main-Draw',
            }),
          })
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload?.error || 'Fehler beim Hinzufügen eines Spielers')
          }
        }
      }

      // Save changed scoring rules
      const changedRules = scoringRules.filter((rule) => {
        const original = originalScoringRules.find((o) => o.id === rule.id)
        return original && original.points_per_unit !== rule.points_per_unit
      })

      for (const rule of changedRules) {
        const response = await fetch(`/api/admin/scoring-rules/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points_per_unit: rule.points_per_unit }),
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Fehler beim Speichern der Punkteverteilung')
        }
      }

      await loadTournaments()
      if (selectedTournament && !selectedTournament.id.startsWith('temp-')) {
        await loadTournamentPlayers(selectedTournament.id)
      }
      await loadScoringRules()

      setHasUnsavedChanges(false)
      alert('Änderungen gespeichert')
    } catch (error: any) {
      console.error('Save failed:', error)
      alert(`Speichern fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}`)
    } finally {
      setSaving(false)
    }
  }

  const loadMatches = async () => {
    const response = await fetch('/api/admin/matches')
    const payload = await response.json()

    if (!response.ok) {
      console.error('Error loading matches:', payload)
      return
    }

    setMatches(payload.matches || [])
  }

  const loadScoringRules = async () => {
    const response = await fetch('/api/admin/scoring-rules')
    const payload = await response.json()

    if (!response.ok) {
      console.error('Error loading scoring rules:', payload)
      return
    }

    const rules = payload.rules || []
    setScoringRules(rules)
    setOriginalScoringRules(rules)
  }

  const toDateInput = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  const startMatchEdit = (match: Match) => {
    setSelectedMatch(match)
    setMatchFormData({
      player_id: match.player_id,
      tournament_id: match.tournament_id || '',
      tournament_name: match.tournament_name,
      round: match.round || 'R1',
      opponent_name: match.opponent_name,
      match_result: match.match_result,
      match_date: toDateInput(match.match_date),
      aces: match.aces || 0,
      double_faults: match.double_faults || 0,
      first_serve_percentage: match.first_serve_percentage || 0,
      break_points_won: match.break_points_won || 0,
      break_points_faced: match.break_points_faced || 0,
      net_points_won: match.net_points_won || 0,
      breaks_conceded: match.breaks_conceded || 0,
      total_points_won: match.total_points_won || 0,
      winners: match.winners || 0,
      unforced_errors: match.unforced_errors || 0,
      sets_won: match.sets_won || 0,
    })
  }

  const cancelMatchEdit = () => {
    setSelectedMatch(null)
    setMatchFormData(emptyMatchFormData)
  }

  const createMatch = async () => {
    if (!matchFormData.player_id || !matchFormData.tournament_name || !matchFormData.opponent_name || !matchFormData.match_date) {
      alert('Bitte fülle alle Pflichtfelder aus')
      return
    }

    const isEdit = Boolean(selectedMatch)
    const endpoint = isEdit ? `/api/admin/matches/${selectedMatch?.id}` : '/api/admin/matches'
    const method = isEdit ? 'PATCH' : 'POST'

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchFormData),
    })

    const payload = await response.json()

    if (!response.ok) {
      alert(`Fehler: ${payload.error}`)
      return
    }

    await loadMatches()

    const tournamentIds = new Set<string>()
    if (matchFormData.tournament_id) tournamentIds.add(matchFormData.tournament_id)
    if (selectedMatch?.tournament_id) tournamentIds.add(selectedMatch.tournament_id)

    for (const tournamentId of tournamentIds) {
      await updateTournamentPoints(tournamentId)
    }

    setSelectedMatch(null)
    setMatchFormData(emptyMatchFormData)

    alert(isEdit ? 'Match erfolgreich aktualisiert!' : 'Match erfolgreich erstellt!')
  }

  const updateTournamentPoints = async (tournamentId: string) => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/update-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId }),
      })
      
      if (!response.ok) {
        console.error('Failed to update tournament points')
      }
    } catch (error) {
      console.error('Error updating tournament points:', error)
    }
  }

  const deleteMatch = async (matchId: string) => {
    if (!confirm('Match wirklich löschen?')) return

    // Get the match to find its tournament_id before deleting
    const matchToDelete = matches.find(m => m.id === matchId)
    const tournamentId = matchToDelete?.tournament_id

    const response = await fetch(`/api/admin/matches/${matchId}`, { method: 'DELETE' })

    if (!response.ok) {
      const payload = await response.json()
      alert(`Fehler: ${payload.error}`)
      return
    }

    await loadMatches()
    
    // Update points if the match had a tournament
    if (tournamentId) {
      await updateTournamentPoints(tournamentId)
    }
  }

  const updateScoringRule = async (ruleId: string, points: number) => {
    const response = await fetch(`/api/admin/scoring-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points_per_unit: points }),
    })

    if (!response.ok) {
      const payload = await response.json()
      alert(`Fehler: ${payload.error}`)
      return
    }

    await loadScoringRules()
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 flex items-center justify-center">Loading...</div>
  }

  const currentSelectedTournament = selectedTournament
    ? tournaments.find((t) => t.id === selectedTournament.id) || selectedTournament
    : null

  const normalizedPlayerSearch = playerSearchQuery.trim().toLowerCase()
  const availablePlayers = players
    .filter((p) => !tournamentPlayers.some((tp) => tp.player_id === p.id))
    .filter((player) => {
      if (!normalizedPlayerSearch) return true
      const fullName = `${player.first_name} ${player.last_name}`.toLowerCase()
      return fullName.includes(normalizedPlayerSearch)
    })

  const sortedTournamentPlayers = [...tournamentPlayers].sort((a, b) => {
    const aMainSeed = a.tournament_seed_position ?? null
    const bMainSeed = b.tournament_seed_position ?? null
    const aQualiSeed = a.qualification_seed_position ?? null
    const bQualiSeed = b.qualification_seed_position ?? null

    const aIsMain = aMainSeed !== null
    const bIsMain = bMainSeed !== null

    if (aIsMain !== bIsMain) return aIsMain ? -1 : 1

    if (aIsMain && bIsMain) {
      return aMainSeed - bMainSeed
    }

    const aIsQuali = aQualiSeed !== null
    const bIsQuali = bQualiSeed !== null

    if (aIsQuali !== bIsQuali) return aIsQuali ? -1 : 1

    if (aIsQuali && bIsQuali) {
      return aQualiSeed - bQualiSeed
    }

    const aRanking = Number(a.player?.ranking ?? Number.MAX_SAFE_INTEGER)
    const bRanking = Number(b.player?.ranking ?? Number.MAX_SAFE_INTEGER)
    if (aRanking !== bRanking) return aRanking - bRanking

    const aName = `${a.player?.first_name || ''} ${a.player?.last_name || ''}`.toLowerCase()
    const bName = `${b.player?.first_name || ''} ${b.player?.last_name || ''}`.toLowerCase()
    return aName.localeCompare(bName)
  })

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/dashboard" className="mr-4 text-zinc-500 hover:text-zinc-900 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center">
              <Calendar className="h-8 w-8 mr-3 text-emerald-600" />
              Turnier Administration
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="text-sm text-amber-700 bg-amber-100 px-3 py-1 rounded-lg">Ungespeicherte Änderungen</span>
            )}
            <button
              onClick={discardChanges}
              disabled={!hasUnsavedChanges || saving}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Verwerfen
            </button>
            <button
              onClick={saveChanges}
              disabled={!hasUnsavedChanges || saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-zinc-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('tournaments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'tournaments'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <Calendar className="h-5 w-5 inline mr-2" />
              Turniere
            </button>
            <button
              onClick={() => setActiveTab('matches')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'matches'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <Trophy className="h-5 w-5 inline mr-2" />
              Matches
            </button>
            <button
              onClick={() => setActiveTab('scoring')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'scoring'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <Target className="h-5 w-5 inline mr-2" />
              Punkteverteilung
            </button>
            <button
              onClick={() => setActiveTab('transfermarkt')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'transfermarkt'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <RotateCcw className="h-5 w-5 inline mr-2" />
              Transfermarkt
            </button>
          </nav>
        </div>

        {/* Tournaments Tab */}
        {activeTab === 'tournaments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Neues Turnier</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Turniername"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <input
                  type="date"
                  value={newTournamentDate}
                  onChange={(e) => setNewTournamentDate(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={newTournamentStartBudget}
                  onChange={(e) => setNewTournamentStartBudget(e.target.value === '' ? 0 : parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Startkapital pro Manager"
                />
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={newTournamentStarterTeamTargetValue}
                  onChange={(e) => setNewTournamentStarterTeamTargetValue(e.target.value === '' ? 0 : parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Zielwert Starterteam"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newTournamentStarterTeamPlayerCount}
                  onChange={(e) => setNewTournamentStarterTeamPlayerCount(e.target.value === '' ? 1 : parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Anzahl Spieler im Starterteam"
                />
                <input
                  type="text"
                  maxLength={2}
                  value={newTournamentCountryCode}
                  onChange={(e) => setNewTournamentCountryCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Land (ISO-2, z.B. DE)"
                />
                <select
                  value={newTournamentPreviousWinnerPlayerId}
                  onChange={(e) => setNewTournamentPreviousWinnerPlayerId(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Kein Vorjahressieger</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.first_name} {player.last_name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTournamentType}
                  onChange={(e) => setNewTournamentType(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Turnierart wählen</option>
                  {TOURNAMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-2 cursor-pointer hover:bg-zinc-50">
                  <span className="text-sm font-medium text-zinc-700">Newcomer aktivieren</span>
                  <input
                    type="checkbox"
                    checked={newTournamentNewcomerEnabled}
                    onChange={(e) => setNewTournamentNewcomerEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
                <button
                  onClick={createTournament}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  Turnier hinzufügen (Entwurf)
                </button>
                <button
                  onClick={async () => {
                    const activeTournament = tournaments.find(t => t.is_active)
                    if (!activeTournament) {
                      alert('Kein aktives Turnier gefunden')
                      return
                    }
                    const response = await fetch(`/api/admin/tournaments/${activeTournament.id}/update-points`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tournamentId: activeTournament.id }),
                    })
                    if (response.ok) {
                      const result = await response.json()
                      alert(`Punkte neu berechnet!\n\n${result.matchesRecalculated} Matches aktualisiert\n${result.teamsUpdated} Teams aktualisiert`)
                    } else {
                      alert('Fehler beim Neuberechnen der Punkte')
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Target className="h-5 w-5" />
                  Punkte neu berechnen
                </button>
              </div>
            </div>

            <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Turniere</h2>
              <div className="space-y-2">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedTournament?.id === tournament.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                    onClick={() => setSelectedTournament(tournament)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-zinc-900">{tournament.name}</h3>
                        <p className="text-sm text-zinc-500">{new Date(tournament.start_date).toLocaleDateString('de-DE')}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Startkapital: {tournament.start_budget.toLocaleString('de-DE')}€ · Starterteam-Ziel: {tournament.starter_team_target_value.toLocaleString('de-DE')}€ · Starterteam-Spieler: {tournament.starter_team_player_count}
                        </p>
                        {tournament.tournament_type ? (
                          <p className="text-xs text-zinc-500 mt-1">
                            Typ: {findTournamentTypeOption(tournament.tournament_type)?.label || tournament.tournament_type}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={tournament.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation()
                            updateTournamentStatus(tournament.id, e.target.value as 'upcoming' | 'on-going' | 'completed')
                          }}
                          className="px-3 py-1 rounded-lg text-sm font-medium border-2 transition-colors focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="upcoming">Upcoming</option>
                          <option value="on-going">On-Going</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleTournamentActive(tournament)
                          }}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                            tournament.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                          }`}
                        >
                          {tournament.is_active ? 'Aktiv' : 'Inaktiv'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteTournament(tournament.id)
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {tournaments.length === 0 && <p className="text-center text-zinc-500 py-4">Keine Turniere vorhanden</p>}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {currentSelectedTournament ? (
              <>
                <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4">Turnier-Einstellungen</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Startkapital je Manager (€)</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={currentSelectedTournament.start_budget}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { start_budget: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Zielwert Starterteam (€)</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={currentSelectedTournament.starter_team_target_value}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { starter_team_target_value: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Spieler im Starterteam</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={currentSelectedTournament.starter_team_player_count}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { starter_team_player_count: e.target.value === '' ? 1 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Land (ISO-2)</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={currentSelectedTournament.country_code || ''}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { country_code: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase() || null })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="DE"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Turnierart</label>
                      <select
                        value={currentSelectedTournament.tournament_type || ''}
                        onChange={(e) => {
                          const selectedType = e.target.value
                          const option = findTournamentTypeOption(selectedType)
                          updateTournamentSettings(currentSelectedTournament.id, {
                            tournament_type: selectedType || null,
                            tournament_category: option?.category ?? null,
                            singles_player_count: option?.singlesPlayerCount ?? null,
                          })
                        }}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        <option value="">Keine Turnierart ausgewählt</option>
                        {TOURNAMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Vorjahressieger</label>
                      <select
                        value={currentSelectedTournament.previous_winner_player_id || ''}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { previous_winner_player_id: e.target.value || null })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        <option value="">Kein Vorjahressieger</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.first_name} {player.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-3 cursor-pointer hover:bg-zinc-50">
                      <div>
                        <span className="text-sm font-medium text-zinc-700">Newcomer aktivieren</span>
                        <p className="text-xs text-zinc-500 mt-0.5">Reserve-Slots im Lineup sind sichtbar und bespielbar</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentSelectedTournament.newcomer_enabled}
                        onChange={(e) => updateTournamentSettings(currentSelectedTournament.id, { newcomer_enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-zinc-500 mt-3">
                    Beim Aktivieren werden nur Transfermarkt-Rotation und laufende Marktangebote zurückgesetzt.
                  </p>
                </div>

                <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4">Spieler hinzufügen</h2>
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 mb-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Spieler suchen..."
                  />
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {availablePlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-3 hover:bg-zinc-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <img src={player.image_url} alt={`${player.first_name} ${player.last_name}`} className="h-8 w-8 rounded-full object-cover" />
                            <div>
                              <p className="text-sm font-medium text-zinc-900">{player.first_name} {player.last_name}</p>
                              <p className="text-xs text-zinc-500">Rang #{player.ranking}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => addPlayerToTournament(player.id)}
                            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                          >
                            Hinzufügen
                          </button>
                        </div>
                      ))}
                    {availablePlayers.length === 0 && (
                      <p className="text-sm text-zinc-500 py-2">Keine passenden Spieler gefunden</p>
                    )}
                  </div>
                </div>

                <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600" />
                    Zugeordnete Spieler ({tournamentPlayers.length})
                  </h2>
                  <div className="space-y-3">
                    {sortedTournamentPlayers.map((tp) => (
                      <div key={tp.id} className="p-4 border border-zinc-200 rounded-xl hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <img src={tp.player?.image_url} alt={`${tp.player?.first_name} ${tp.player?.last_name}`} className="h-10 w-10 rounded-full object-cover" />
                            <div>
                              <p className="font-semibold text-zinc-900">{tp.player?.first_name} {tp.player?.last_name}</p>
                              <p className="text-xs text-zinc-500">Rang #{tp.player?.ranking}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => removePlayerFromTournament(tp.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div>
                          <div className="mb-3">
                            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(tp.is_wildcard)}
                                onChange={(e) => updatePlayerWildcard(tp.id, e.target.checked)}
                                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              Wildcard (erzwingt Garantiert)
                            </label>
                          </div>
                          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 mb-1">Seeding</label>
                              <select
                                value={tp.seeding_status || 'Main-Draw'}
                                onChange={(e) => updatePlayerSeedingStatus(tp.id, e.target.value as typeof seedingStatusOptions[number])}
                                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                              >
                                {seedingStatusOptions.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end gap-2">
                              {tp.tournament_seed_position ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                  Hauptfeld Setzung #{tp.tournament_seed_position}
                                </span>
                              ) : null}
                              {tp.qualification_seed_position ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                                  Quali Setzung #{tp.qualification_seed_position}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <label className="block text-xs font-medium text-zinc-600 mb-2">Auftrittswahrscheinlichkeit</label>
                          <div className="grid grid-cols-2 gap-2">
                            {probabilityOptions.map((option) => (
                              <button
                                key={option}
                                onClick={() => updatePlayerProbability(tp.id, option)}
                                disabled={Boolean(tp.is_wildcard)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                                  tp.appearance_probability === option
                                    ? probabilityColors[option]
                                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                } ${Boolean(tp.is_wildcard) ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4">
                          <label className="block text-xs font-medium text-zinc-600 mb-2">Marktwert (€)</label>
                          <input
                            type="number"
                            value={tp.market_value || ''}
                            onChange={(e) => updatePlayerMarketValue(tp.id, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            min="0"
                            step="100"
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            placeholder="z.B. 5000"
                          />
                        </div>
                      </div>
                    ))}
                    {tournamentPlayers.length === 0 && <p className="text-center text-zinc-500 py-8">Keine Spieler zugeordnet</p>}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-12 text-center">
                <Calendar className="h-16 w-16 text-zinc-300 mx-auto mb-4" />
                <p className="text-zinc-500">Wähle ein Turnier aus, um Spieler zu verwalten</p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Matches Tab */}
        {activeTab === 'matches' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Match Form */}
            <div className="space-y-6">
              <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">{selectedMatch ? 'Match bearbeiten' : 'Neues Match'}</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Spieler</label>
                    <select
                      value={matchFormData.player_id}
                      onChange={(e) => setMatchFormData({ ...matchFormData, player_id: e.target.value })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      <option value="">Spieler auswählen...</option>
                      {players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.first_name} {player.last_name} (#{player.ranking})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Turnier</label>
                    <select
                      value={matchFormData.tournament_id}
                      onChange={(e) => {
                        const selectedTournament = tournaments.find(t => t.id === e.target.value)
                        setMatchFormData({ 
                          ...matchFormData, 
                          tournament_id: e.target.value,
                          tournament_name: selectedTournament?.name || ''
                        })
                      }}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      <option value="">Turnier auswählen...</option>
                      {tournaments.map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>
                          {tournament.name} ({tournament.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Gegner</label>
                    <input
                      type="text"
                      value={matchFormData.opponent_name}
                      onChange={(e) => setMatchFormData({ ...matchFormData, opponent_name: e.target.value })}
                      placeholder="Gegnername"
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Ergebnis</label>
                    <select
                      value={matchFormData.match_result}
                      onChange={(e) => setMatchFormData({ ...matchFormData, match_result: e.target.value })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      <option value="won">Sieg</option>
                      <option value="lost">Niederlage</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Runde</label>
                    <select
                      value={matchFormData.round}
                      onChange={(e) => setMatchFormData({ ...matchFormData, round: e.target.value as typeof roundOptions[number] })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      {roundOptions.map((round) => (
                        <option key={round} value={round}>{round}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Match-Datum</label>
                    <input
                      type="date"
                      value={matchFormData.match_date}
                      onChange={(e) => setMatchFormData({ ...matchFormData, match_date: e.target.value })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Asse</label>
                      <input
                        type="number"
                        value={matchFormData.aces === 0 ? '' : matchFormData.aces}
                        onChange={(e) => setMatchFormData({ ...matchFormData, aces: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Doppelfehler</label>
                      <input
                        type="number"
                        value={matchFormData.double_faults === 0 ? '' : matchFormData.double_faults}
                        onChange={(e) => setMatchFormData({ ...matchFormData, double_faults: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Break Points gewonnen</label>
                      <input
                        type="number"
                        value={matchFormData.break_points_won === 0 ? '' : matchFormData.break_points_won}
                        onChange={(e) => setMatchFormData({ ...matchFormData, break_points_won: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Net-Points Won</label>
                      <input
                        type="number"
                        value={matchFormData.net_points_won === 0 ? '' : matchFormData.net_points_won}
                        onChange={(e) => setMatchFormData({ ...matchFormData, net_points_won: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Break kassiert</label>
                      <input
                        type="number"
                        value={matchFormData.breaks_conceded === 0 ? '' : matchFormData.breaks_conceded}
                        onChange={(e) => setMatchFormData({ ...matchFormData, breaks_conceded: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Winners</label>
                      <input
                        type="number"
                        value={matchFormData.winners === 0 ? '' : matchFormData.winners}
                        onChange={(e) => setMatchFormData({ ...matchFormData, winners: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Unforced Errors</label>
                    <input
                      type="number"
                      value={matchFormData.unforced_errors === 0 ? '' : matchFormData.unforced_errors}
                      onChange={(e) => setMatchFormData({ ...matchFormData, unforced_errors: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Sätze gewonnen</label>
                    <input
                      type="number"
                      value={matchFormData.sets_won === 0 ? '' : matchFormData.sets_won}
                      onChange={(e) => setMatchFormData({ ...matchFormData, sets_won: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg"
                    />
                  </div>

                  <button
                    onClick={createMatch}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                    {selectedMatch ? 'Match speichern' : 'Match hinzufügen'}
                  </button>
                  {selectedMatch && (
                    <button
                      onClick={cancelMatchEdit}
                      className="w-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Bearbeitung abbrechen
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Matches List */}
            <div className="space-y-6">
              <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Match Historie ({matches.length})</h2>
                <div className="space-y-3 max-h-[800px] overflow-y-auto">
                  {matches.map((match) => (
                    <div key={match.id} className="p-4 border border-zinc-200 rounded-xl hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {match.player?.image_url && (
                            <img src={match.player.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                          )}
                          <div>
                            <p className="font-semibold text-zinc-900">
                              {match.player?.first_name} {match.player?.last_name}
                            </p>
                            <p className="text-xs text-zinc-500">{match.tournament_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startMatchEdit(match)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteMatch(match.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-500">Gegner:</span> {match.opponent_name}
                        </div>
                        <div>
                          <span className="text-zinc-500">Ergebnis:</span>{' '}
                          <span className={match.match_result === 'won' ? 'text-green-600 font-medium' : 'text-red-600'}>
                            {match.match_result === 'won' ? 'Sieg' : 'Niederlage'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Datum:</span> {new Date(match.match_date).toLocaleDateString('de-DE')}
                        </div>
                        <div>
                          <span className="text-zinc-500">Runde:</span> {match.round || '-'}
                        </div>
                        <div>
                          <span className="text-zinc-500">Fantasy Punkte:</span>{' '}
                          <span className="font-semibold text-emerald-600">{match.fantasy_points}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-3 gap-2 text-xs text-zinc-600">
                        <div>Asse: {match.aces}</div>
                        <div>DF: {match.double_faults}</div>
                        <div>BP: {match.break_points_won}</div>
                        <div>NPW: {match.net_points_won || 0}</div>
                        <div>Break kassiert: {match.breaks_conceded || 0}</div>
                        <div>Winners: {match.winners}</div>
                        <div>UE: {match.unforced_errors}</div>
                        <div>Sätze gew.: {match.sets_won || 0}</div>
                      </div>
                    </div>
                  ))}
                  {matches.length === 0 && (
                    <p className="text-center text-zinc-500 py-8">Keine Matches vorhanden</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scoring Rules Tab */}
        {activeTab === 'transfermarkt' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 mb-1">Transfermarkt konfigurieren</h2>
                <p className="text-sm text-zinc-500">Einstellungen für die automatische Marktbefüllung. Die Konfiguration gilt nur für den nächsten manuellen Aufruf.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Anzahl aktiver PC-Angebote pro Liga</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={tmTargetOffers}
                    onChange={(e) => setTmTargetOffers(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Mindestdauer neuer Angebote (Stunden)</label>
                    <input
                      type="number"
                      min={1}
                      value={tmMinHours}
                      onChange={(e) => setTmMinHours(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Maximaldauer neuer Angebote (Stunden)</label>
                    <input
                      type="number"
                      min={tmMinHours}
                      value={tmMaxHours}
                      onChange={(e) => setTmMaxHours(Math.max(tmMinHours, parseInt(e.target.value) || tmMinHours))}
                      className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={async () => {
                  setTmRunning(true)
                  setTmResult(null)
                  try {
                    const res = await fetch('/api/admin/maintenance/transfer-market', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        targetActivePcOffers: tmTargetOffers,
                        auctionDurationMinHours: tmMinHours,
                        auctionDurationMaxHours: tmMaxHours,
                      }),
                    })
                    const payload = await res.json()
                    setTmResult(res.ok ? { success: true, summary: payload.summary } : { error: payload.error || 'Fehler' })
                  } catch (err: any) {
                    setTmResult({ error: err?.message || 'Netzwerkfehler' })
                  } finally {
                    setTmRunning(false)
                  }
                }}
                disabled={tmRunning}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`h-5 w-5 ${tmRunning ? 'animate-spin' : ''}`} />
                {tmRunning ? 'Läuft...' : 'Transfermarkt jetzt aktualisieren'}
              </button>
              {tmResult && (
                <div className={`rounded-xl p-4 text-sm ${tmResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                  {tmResult.error ? (
                    <p><span className="font-semibold">Fehler:</span> {tmResult.error}</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold">Erfolgreich abgeschlossen</p>
                      <p>Ligen verarbeitet: {tmResult.summary?.leaguesProcessed ?? '–'}</p>
                      <p>Neue Angebote erstellt: {tmResult.summary?.offersCreated ?? '–'}</p>
                      <p>Aktive Turnierspieler: {tmResult.summary?.activeTournamentPlayers ?? '–'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* News-Feed leeren */}
            <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6 space-y-4 mt-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 mb-1">News-Feed leeren</h2>
                <p className="text-sm text-zinc-500">Löscht alle Meldungen aus dem News-Feed aller Ligen.</p>
              </div>
              <button
                onClick={async () => {
                  setClearNewsRunning(true)
                  setClearNewsResult(null)
                  try {
                    const res = await fetch('/api/admin/maintenance/clear-news', { method: 'POST' })
                    const payload = await res.json()
                    setClearNewsResult(res.ok ? { success: true } : { error: payload.error || 'Fehler' })
                  } catch (err: any) {
                    setClearNewsResult({ error: err?.message || 'Netzwerkfehler' })
                  } finally {
                    setClearNewsRunning(false)
                  }
                }}
                disabled={clearNewsRunning}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className={`h-5 w-5 ${clearNewsRunning ? 'animate-pulse' : ''}`} />
                {clearNewsRunning ? 'Wird gelöscht...' : 'News-Feed jetzt leeren'}
              </button>
              {clearNewsResult && (
                <div className={`rounded-xl p-4 text-sm ${clearNewsResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                  {clearNewsResult.error ? (
                    <p><span className="font-semibold">Fehler:</span> {clearNewsResult.error}</p>
                  ) : (
                    <p className="font-semibold">News-Feed erfolgreich geleert.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scoring' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Punkteverteilung konfigurieren</h2>
              <p className="text-sm text-zinc-600 mb-6">
                Legen Sie fest, wie viele Punkte für verschiedene Match-Statistiken vergeben werden.
                Negative Werte werden als Punktabzug gewertet.
              </p>
              <div className="space-y-4">
                {scoringRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-4 border border-zinc-200 rounded-xl">
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-900 capitalize">{rule.stat_name.replaceAll('_', ' ')}</h3>
                      <p className="text-sm text-zinc-500">{rule.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.5"
                        value={isNaN(rule.points_per_unit) ? '' : rule.points_per_unit}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          setScoringRules((prev) =>
                            prev.map((r) => (r.id === rule.id ? { ...r, points_per_unit: isNaN(newValue) ? 0 : newValue } : r))
                          )
                          setHasUnsavedChanges(true)
                        }}
                        className="w-24 px-3 py-2 border border-zinc-300 rounded-lg text-right font-medium"
                      />
                      <span className="text-sm text-zinc-500 w-16">Punkte</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
