-- Add status column to existing schedules table
-- This migration updates the shows_data JSONB field to include status for existing records

-- Update existing shows to have 'show' status by default
UPDATE schedules 
SET shows_data = (
  SELECT jsonb_agg(
    jsonb_set(show_item, '{status}', '"show"')
  )
  FROM jsonb_array_elements(shows_data) AS show_item
)
WHERE shows_data IS NOT NULL;
