-- Add newcomer_enabled flag to tournaments table.
-- When false, the two Newcomer/Reserve slots are hidden and disabled in the league UI.
-- Defaults to true to preserve existing behavior for all current tournaments.

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS newcomer_enabled BOOLEAN NOT NULL DEFAULT TRUE;
