'use client'

import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Calendar, Users, Save, RotateCcw, Target, Trophy, Pencil } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Tournament {
  id: string
  name: string
  start_date: string
  is_active: boolean
  status: 'upcoming' | 'on-going' | 'completed'
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
  market_value?: number
  player?: Player
}

interface Match {
  id: string
  player_id: string
  tournament_id?: string
  tournament_name: string
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

const probabilityColors: Record<string, string> = {
  Garantiert: 'bg-green-100 text-green-800 border-green-300',
  'Sehr Wahrscheinlich': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Wahrscheinlich: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Riskant: 'bg-orange-100 text-orange-800 border-orange-300',
  'Sehr Riskant': 'bg-red-100 text-red-800 border-red-300',
  Ausgeschlossen: 'bg-zinc-200 text-zinc-800 border-zinc-400',
}

const emptyMatchFormData = {
  player_id: '',
  tournament_id: '',
  tournament_name: '',
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
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'tournaments' | 'matches' | 'scoring'>('tournaments')
  
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Match management state
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [matchFormData, setMatchFormData] = useState(emptyMatchFormData)

  // Scoring rules state
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([])
  const [originalScoringRules, setOriginalScoringRules] = useState<ScoringRule[]>([])

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

    const normalized = payload.tournamentPlayers || []
    setTournamentPlayers(normalized)
    setOriginalTournamentPlayers(normalized)
    setHasUnsavedChanges(false)
  }

  const createTournament = async () => {
    if (!newTournamentName || !newTournamentDate) {
      alert('Bitte fülle alle Felder aus')
      return
    }

    const tempTournament: Tournament = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newTournamentName,
      start_date: new Date(newTournamentDate).toISOString(),
      is_active: false,
      status: 'upcoming',
    }

    setTournaments((prev) => [...prev, tempTournament])
    setNewTournamentName('')
    setNewTournamentDate('')
    setHasUnsavedChanges(true)
  }

  const toggleTournamentActive = (tournament: Tournament) => {
    const nextActive = !tournament.is_active

    setTournaments((prev) =>
      prev.map((t) => {
        if (t.id === tournament.id) return { ...t, is_active: nextActive }
        if (nextActive) return { ...t, is_active: false }
        return t
      })
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
        appearance_probability: 'Wahrscheinlich',
        market_value: 0,
        player: selectedPlayer,
      },
    ])

    setHasUnsavedChanges(true)
  }

  const updatePlayerProbability = (tournamentPlayerId: string, probability: string) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) => (tp.id === tournamentPlayerId ? { ...tp, appearance_probability: probability } : tp))
    )
    setHasUnsavedChanges(true)
  }

  const updatePlayerMarketValue = (tournamentPlayerId: string, marketValue: number) => {
    setTournamentPlayers((prev) =>
      prev.map((tp) => (tp.id === tournamentPlayerId ? { ...tp, market_value: marketValue } : tp))
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
          body: JSON.stringify({ name: tournament.name, startDate: tournament.start_date }),
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
        return original && (original.is_active !== t.is_active || original.status !== t.status)
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
          return original && (original.appearance_probability !== tp.appearance_probability || original.market_value !== tp.market_value)
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

  const toDateTimeLocal = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const startMatchEdit = (match: Match) => {
    setSelectedMatch(match)
    setMatchFormData({
      player_id: match.player_id,
      tournament_id: match.tournament_id || '',
      tournament_name: match.tournament_name,
      opponent_name: match.opponent_name,
      match_result: match.match_result,
      match_date: toDateTimeLocal(match.match_date),
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
            {selectedTournament ? (
              <>
                <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4">Spieler hinzufügen</h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {players
                      .filter((p) => !tournamentPlayers.some((tp) => tp.player_id === p.id))
                      .map((player) => (
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
                  </div>
                </div>

                <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 p-6">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600" />
                    Zugeordnete Spieler ({tournamentPlayers.length})
                  </h2>
                  <div className="space-y-3">
                    {tournamentPlayers.map((tp) => (
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
                          <label className="block text-xs font-medium text-zinc-600 mb-2">Auftrittswahrscheinlichkeit</label>
                          <div className="grid grid-cols-2 gap-2">
                            {probabilityOptions.map((option) => (
                              <button
                                key={option}
                                onClick={() => updatePlayerProbability(tp.id, option)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                                  tp.appearance_probability === option
                                    ? probabilityColors[option]
                                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                }`}
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
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Match-Datum</label>
                    <input
                      type="datetime-local"
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
