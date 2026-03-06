'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 font-semibold">
                        {player.first_name} {player.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {player.country || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 font-mono">
                        {player.points}
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
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-zinc-500">
                      No players found. Run the sync API to populate the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
