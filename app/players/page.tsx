'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Users, X, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Player {
  id: string
  first_name: string
  last_name: string
  ranking: number
  points: number
  country: string
  image_url: string
  fantasy_avg: number
}

interface Match {
  id: string
  tournament_name: string
  opponent_name: string
  match_result: string
  fantasy_points: number
  match_date: string
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  useEffect(() => {
    async function fetchPlayers() {
      const supabase = createClient() // Note: This is browser client for client component
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('ranking', { ascending: true, nullsFirst: false })

      if (error) {
        console.error('Error fetching players:', error)
        setPlayers([])
      } else {
        // map default image for missing urls
        const defaultUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`
        const playersWithImages = (data || []).map(p => ({
          ...p,
          image_url: p.image_url || defaultUrl,
        }))
        setPlayers(playersWithImages)
      }
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  const openPlayerDetails = async (player: Player) => {
    setSelectedPlayer(player)
    setLoadingMatches(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('player_matches')
      .select('*')
      .eq('player_id', player.id)
      .order('match_date', { ascending: false })
    
    if (error) {
      console.error('Error fetching matches:', error)
      setMatches([])
    } else {
      setMatches(data || [])
    }
    setLoadingMatches(false)
  }

  const closePlayerDetails = () => {
    setSelectedPlayer(null)
    setMatches([])
  }

  const getFantasyPointsBarColor = (points: number) => {
    if (points >= 100) return 'bg-green-500'
    if (points >= 50) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getFantasyPointsBarWidth = (points: number) => {
    // Scale to max 100% width at 150 points
    const percentage = Math.min((points / 150) * 100, 100)
    return `${percentage}%`
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, playerId: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('playerId', playerId)

    try {
      const response = await fetch('/api/upload-player-image', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const { imageUrl } = await response.json()
        // Update the player in state
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, image_url: imageUrl } : p))
        alert('Image uploaded successfully!')
      } else {
        const error = await response.json()
        alert(`Upload failed: ${error.error}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed')
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-6 lg:px-8 flex items-center justify-center">Loading...</div>
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
              <Users className="h-6 w-6 mr-3 text-emerald-600" />
              Available Players
            </h1>
          </div>
          <p className="text-sm text-zinc-500">
            {players?.length || 0} players listed
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Image
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Country
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Points
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Avg Fantasy
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-200">
                {players && players.length > 0 ? (
                  players.map((player) => (
                    <tr key={player.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                        {player.ranking || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {player.image_url ? (
                          <img src={player.image_url} alt={`${player.first_name} ${player.last_name}`} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-zinc-200 flex items-center justify-center">
                            <span className="text-xs text-zinc-500">No Image</span>
                          </div>
                        )}
                      </td>
                      <td 
                        className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 font-semibold cursor-pointer hover:text-emerald-600 transition-colors"
                        onClick={() => openPlayerDetails(player)}
                      >
                        {player.first_name} {player.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {player.country || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 font-mono">
                        {player.points}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 font-semibold">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                          {player.fantasy_avg?.toFixed(1) || '0.0'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-emerald-600 hover:text-emerald-900 font-medium mr-4">
                          Add to Team
                        </button>
                        <label className="text-blue-600 hover:text-blue-900 font-medium cursor-pointer">
                          Upload Image
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, player.id)} />
                        </label>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-zinc-500">
                      No players found. Run the sync API to populate the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal for Player Match History */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src={selectedPlayer.image_url} 
                  alt={`${selectedPlayer.first_name} ${selectedPlayer.last_name}`}
                  className="h-16 w-16 rounded-full object-cover border-4 border-white"
                />
                <div>
                  <h2 className="text-2xl font-bold">
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </h2>
                  <p className="text-emerald-100 text-sm">
                    Rank #{selectedPlayer.ranking} • {selectedPlayer.country}
                  </p>
                </div>
              </div>
              <button 
                onClick={closePlayerDetails}
                className="text-white hover:bg-emerald-800 rounded-full p-2 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-emerald-600 uppercase font-semibold mb-1">Avg Fantasy Points</p>
                  <p className="text-3xl font-bold text-emerald-900">
                    {selectedPlayer.fantasy_avg?.toFixed(1) || '0.0'}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-600 uppercase font-semibold mb-1">Total Matches</p>
                  <p className="text-3xl font-bold text-blue-900">{matches.length}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-purple-600 uppercase font-semibold mb-1">ATP Points</p>
                  <p className="text-3xl font-bold text-purple-900">{selectedPlayer.points}</p>
                </div>
              </div>

              {/* Match History */}
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  Match History
                </h3>

                {loadingMatches ? (
                  <div className="text-center py-10 text-zinc-500">Loading matches...</div>
                ) : matches.length > 0 ? (
                  <div className="space-y-3">
                    {matches.map((match) => (
                      <div 
                        key={match.id} 
                        className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-zinc-900">
                              {match.tournament_name}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {new Date(match.match_date).toLocaleDateString('de-DE', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-zinc-500 mb-1">vs {match.opponent_name}</p>
                            <p className={`text-sm font-bold ${
                              match.match_result.toLowerCase().includes('w') || 
                              match.match_result.toLowerCase().includes('won')
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}>
                              {match.match_result}
                            </p>
                          </div>
                        </div>

                        {/* Fantasy Points Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-600">Fantasy Points</span>
                            <span className="text-sm font-bold text-zinc-900">{match.fantasy_points}</span>
                          </div>
                          <div className="w-full bg-zinc-200 rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${getFantasyPointsBarColor(match.fantasy_points)}`}
                              style={{ width: getFantasyPointsBarWidth(match.fantasy_points) }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-200">
                    No match history available for this player yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
