-- Allow new appearance probability value 'Ausgeschlossen' for existing databases
ALTER TABLE tournament_players
DROP CONSTRAINT IF EXISTS tournament_players_appearance_probability_check;

ALTER TABLE tournament_players
ADD CONSTRAINT tournament_players_appearance_probability_check
CHECK (
  appearance_probability IN (
    'Garantiert',
    'Sehr Wahrscheinlich',
    'Wahrscheinlich',
    'Riskant',
    'Sehr Riskant',
    'Ausgeschlossen'
  )
);
