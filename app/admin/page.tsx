'use client'

import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Calendar, Users, Save, RotateCcw } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Tournament {
  id: string
  name: string
  start_date: string
  is_active: boolean
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
  player?: Player
}

const probabilityOptions = [
  'Garantiert',
  'Sehr Wahrscheinlich',
  'Wahrscheinlich',
  'Riskant',
  'Sehr Riskant',
]

const probabilityColors: Record<string, string> = {
  Garantiert: 'bg-green-100 text-green-800 border-green-300',
  'Sehr Wahrscheinlich': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Wahrscheinlich: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Riskant: 'bg-orange-100 text-orange-800 border-orange-300',
  'Sehr Riskant': 'bg-red-100 text-red-800 border-red-300',
}

export default function AdminPage() {
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

  const formatSupabaseError = (error: SupabaseErrorLike | null) => {
    if (!error) return 'Unbekannter Fehler'
    return `${error.message || 'Fehler'}${error.code ? ` (Code: ${error.code})` : ''}`
  }

  useEffect(() => {
    loadTournaments()
    loadPlayers()
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

  const removePlayerFromTournament = (tournamentPlayerId: string) => {
    setTournamentPlayers((prev) => prev.filter((tp) => tp.id !== tournamentPlayerId))
    setHasUnsavedChanges(true)
  }

  const discardChanges = () => {
    setTournaments(originalTournaments)
    setTournamentPlayers(originalTournamentPlayers)
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
        return original && original.is_active !== t.is_active
      })

      for (const tournament of changedTournaments) {
        const response = await fetch(`/api/admin/tournaments/${tournament.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: tournament.is_active }),
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || 'Fehler beim Speichern der Turnier-Aktivierung')
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

        const changedProbability = tournamentPlayers.filter((tp) => {
          if (tp.id.startsWith('temp-')) return false
          const original = originalById.get(tp.id)
          return original && original.appearance_probability !== tp.appearance_probability
        })

        for (const item of changedProbability) {
          const response = await fetch(`/api/admin/tournament-players/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appearance_probability: item.appearance_probability }),
          })
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload?.error || 'Fehler beim Aktualisieren der Wahrscheinlichkeit')
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
            }),
          })
          const payload = await response.json()
          if (!response.ok) {
            throw new Error(payload?.error || 'Fehler beim Hinzufügen eines Spielers')
          }
        }
      }

      await loadTournaments()
      if (selectedTournament && !selectedTournament.id.startsWith('temp-')) {
        await loadTournamentPlayers(selectedTournament.id)
      }

      setHasUnsavedChanges(false)
      alert('Änderungen gespeichert')
    } catch (error: any) {
      console.error('Save failed:', error)
      alert(`Speichern fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}`)
    } finally {
      setSaving(false)
    }
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
      </div>
    </div>
  )
}
