-- Migration: add optional profile image for fantasy teams
ALTER TABLE fantasy_teams
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
