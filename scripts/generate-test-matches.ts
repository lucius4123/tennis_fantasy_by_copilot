import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Script to generate test match data for players
// Run with: npx tsx scripts/generate-test-matches.ts

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const tournaments = [
  'Australian Open 2026',
  'French Open 2026',
  'Wimbledon 2026',
  'US Open 2026',
  'ATP Masters Madrid',
  'ATP Masters Rome',
  'ATP Masters Indian Wells',
  'ATP Finals',
  'Dubai Tennis Championships',
  'Miami Open'
]

const opponents = [
  'Rafael Nadal',
  'Roger Federer',
  'Novak Djokovic',
  'Andy Murray',
  'Daniil Medvedev',
  'Stefanos Tsitsipas',
  'Alexander Zverev',
  'Carlos Alcaraz',
  'Jannik Sinner',
  'Andrey Rublev',
  'Casper Ruud',
  'Taylor Fritz',
  'Frances Tiafoe',
  'Holger Rune'
]

const results = [
  '6-4, 6-3',
  '7-6, 6-4',
  '6-2, 3-6, 6-4',
  '4-6, 6-4, 6-3',
  '6-3, 6-2',
  '7-5, 6-4',
  '3-6, 4-6',
  '6-7, 4-6',
  '6-4, 4-6, 7-6'
]

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getRandomFantasyPoints(): number {
  // Generate fantasy points with realistic distribution
  const rand = Math.random()
  if (rand < 0.1) return Math.floor(Math.random() * 150) + 100 // 10% chance of 100-250 points (exceptional)
  if (rand < 0.4) return Math.floor(Math.random() * 50) + 50 // 30% chance of 50-100 points (good)
  return Math.floor(Math.random() * 50) // 60% chance of 0-50 points (average/poor)
}

function getRandomDate(daysBack: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date
}

async function generateTestMatches() {
  console.log('Fetching players...')
  
  // Get all players
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, first_name, last_name')
  
  if (playersError || !players || players.length === 0) {
    console.error('Error fetching players:', playersError)
    return
  }

  console.log(`Found ${players.length} players. Generating matches...`)

  for (const player of players) {
    // Generate 5-15 matches per player
    const matchCount = Math.floor(Math.random() * 11) + 5
    const matches = []

    for (let i = 0; i < matchCount; i++) {
      const fantasyPoints = getRandomFantasyPoints()
      const isWin = Math.random() > 0.5
      
      matches.push({
        player_id: player.id,
        tournament_name: getRandomElement(tournaments),
        opponent_name: getRandomElement(opponents),
        match_result: isWin ? `Won ${getRandomElement(results)}` : `Lost ${getRandomElement(results)}`,
        fantasy_points: fantasyPoints,
        match_date: getRandomDate(Math.floor(Math.random() * 180)).toISOString()
      })
    }

    // Insert matches for this player
    const { error: insertError } = await supabase
      .from('player_matches')
      .insert(matches)

    if (insertError) {
      console.error(`Error inserting matches for ${player.first_name} ${player.last_name}:`, insertError)
    } else {
      console.log(`✓ Generated ${matchCount} matches for ${player.first_name} ${player.last_name}`)
    }
  }

  console.log('✓ All matches generated successfully!')
  console.log('Note: Player fantasy_avg will be automatically calculated by database trigger.')
}

generateTestMatches()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
