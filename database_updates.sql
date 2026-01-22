-- Database updates for Déplacements PMR afternoon support
-- Execute these queries in Supabase SQL Editor

-- Add afternoon presence columns to daily_movements table
ALTER TABLE daily_movements
ADD COLUMN IF NOT EXISTS presence_mons_am JSONB DEFAULT '{"spi": 0, "opi": 0, "cpi": 0, "pa": 0, "shift_10_18": 0}',
ADD COLUMN IF NOT EXISTS presence_tournai_am JSONB DEFAULT '{"spi": 0, "opi": 0, "cpi": 0, "pa": 0, "shift_10_18": 0}';

-- Add period column to movement_interventions table to distinguish morning/afternoon
ALTER TABLE movement_interventions
ADD COLUMN IF NOT EXISTS period TEXT DEFAULT 'morning';

-- Add check constraint for period values
ALTER TABLE movement_interventions
DROP CONSTRAINT IF EXISTS period_check;

ALTER TABLE movement_interventions
ADD CONSTRAINT period_check CHECK (period IN ('morning', 'afternoon'));

-- Update existing records to have 'morning' period if NULL
UPDATE movement_interventions
SET period = 'morning'
WHERE period IS NULL;

-- Create index on period for faster queries
CREATE INDEX IF NOT EXISTS idx_movement_interventions_period
ON movement_interventions(period);
