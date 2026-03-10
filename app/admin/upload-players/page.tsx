'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, CheckCircle2, XCircle } from 'lucide-react'

interface UploadResult {
  success: boolean
  inserted: number
  skipped: number
  skippedPlayers: string[]
  message: string
  error?: string
}

export default function UploadPlayersPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/players', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
        setFile(null)
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement
        if (fileInput) fileInput.value = ''
      } else {
        setResult({
          success: false,
          inserted: 0,
          skipped: 0,
          skippedPlayers: [],
          message: data.error || 'Upload fehlgeschlagen',
          error: data.details,
        })
      }
    } catch (error) {
      setResult({
        success: false,
        inserted: 0,
        skipped: 0,
        skippedPlayers: [],
        message: 'Fehler beim Upload',
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={16} />
            Zurück zur Admin-Übersicht
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Spieler Excel-Upload</h1>
          <p className="text-gray-600 mt-2">
            Lade eine Excel-Datei mit Spielern hoch. Bereits existierende Spieler werden übersprungen.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Excel-Format</h2>
            <p className="text-sm text-gray-600 mb-3">
              Die Excel-Datei muss folgende Spalten enthalten:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 px-3 font-semibold">Rank</th>
                    <th className="text-left py-2 px-3 font-semibold">Player name</th>
                    <th className="text-left py-2 px-3 font-semibold">Country</th>
                    <th className="text-left py-2 px-3 font-semibold">Points</th>
                    <th className="text-left py-2 px-3 font-semibold">atp_id</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 text-gray-600">1</td>
                    <td className="py-2 px-3 text-gray-600">Alcaraz Carlos</td>
                    <td className="py-2 px-3 text-gray-600">Spain</td>
                    <td className="py-2 px-3 text-gray-600">13550</td>
                    <td className="py-2 px-3 text-gray-600">1</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-gray-700 mb-2">
                Excel-Datei auswählen
              </label>
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded p-3">
                <Upload size={16} />
                <span>Ausgewählte Datei: {file.name}</span>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {uploading ? 'Upload läuft...' : 'Spieler hochladen'}
            </button>
          </div>

          {result && (
            <div className={`mt-6 p-4 rounded-lg border ${
              result.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                ) : (
                  <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                )}
                <div className="flex-1">
                  <h3 className={`font-semibold mb-2 ${
                    result.success ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {result.message}
                  </h3>
                  
                  {result.success && (
                    <div className="text-sm space-y-1">
                      <p className="text-green-800">✓ {result.inserted} neue Spieler hinzugefügt</p>
                      <p className="text-green-800">↷ {result.skipped} Spieler übersprungen (bereits vorhanden)</p>
                      
                      {result.skippedPlayers.length > 0 && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-green-700 hover:text-green-900 font-medium">
                            Übersprungene Spieler anzeigen
                          </summary>
                          <ul className="mt-2 ml-4 space-y-1 text-green-700">
                            {result.skippedPlayers.map((name, idx) => (
                              <li key={idx} className="list-disc">
                                {name}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {!result.success && result.error && (
                    <p className="text-sm text-red-800 mt-2">
                      Details: {result.error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
