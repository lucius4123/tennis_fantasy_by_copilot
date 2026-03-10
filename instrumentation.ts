import { createAdminClient, refillTransferMarketForActiveTournament } from '@/lib/transfer-market'

declare global {
  var __transferMarketMaintenanceStarted__: boolean | undefined
}

export async function register() {
  // Start once per server process.
  if (globalThis.__transferMarketMaintenanceStarted__) return
  globalThis.__transferMarketMaintenanceStarted__ = true

  // Run once on startup to normalize the market.
  try {
    const supabase = createAdminClient()
    await refillTransferMarketForActiveTournament(supabase)
  } catch (error) {
    console.error('Transfer market maintenance startup run failed:', error)
  }

  // Every minute resolve ended auctions and keep active offers at target size.
  setInterval(async () => {
    try {
      const supabase = createAdminClient()
      await refillTransferMarketForActiveTournament(supabase)
    } catch (error) {
      console.error('Transfer market maintenance hourly run failed:', error)
    }
  }, 60 * 1000)
}
