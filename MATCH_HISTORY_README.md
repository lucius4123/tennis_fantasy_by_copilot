# Match History Feature - Implementierungsanleitung

## Übersicht

Die Spieler haben jetzt eine vollständige Matchhistorie mit folgenden Features:
- Vergangene Matches mit Gegner, Ergebnis, Turnier und Fantasy-Punkten
- Durchschnittliche Fantasy-Punkte (berechnet aus den letzten 10 Matches)
- Visuelle Balken für Fantasy-Punkte (grün > 100, orange 50-100, rot < 50)
- Modal-Dialog zum Anzeigen der kompletten Matchhistorie

## Datenbankänderungen

### 1. Schema aktualisieren

Führe folgende SQL-Befehle in deiner Supabase-Datenbank aus:

```sql
-- Füge fantasy_avg Spalte zur players Tabelle hinzu
ALTER TABLE players ADD COLUMN fantasy_avg DECIMAL(5,2) DEFAULT 0;

-- Erstelle player_matches Tabelle
CREATE TABLE player_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    tournament_name TEXT NOT NULL,
    opponent_name TEXT NOT NULL,
    match_result TEXT NOT NULL,
    fantasy_points INT DEFAULT 0,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS für player_matches aktivieren
ALTER TABLE player_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player matches are viewable by everyone" ON player_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage player matches" ON player_matches FOR ALL USING (auth.role() = 'service_role');

-- Funktion zum automatischen Berechnen des Fantasy-Durchschnitts
CREATE OR REPLACE FUNCTION update_player_fantasy_avg()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE players
    SET fantasy_avg = (
        SELECT COALESCE(AVG(fantasy_points), 0)
        FROM (
            SELECT fantasy_points
            FROM player_matches
            WHERE player_id = NEW.player_id
            ORDER BY match_date DESC
            LIMIT 10
        ) recent_matches
    )
    WHERE id = NEW.player_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger erstellen
CREATE TRIGGER update_fantasy_avg_on_match_insert
    AFTER INSERT ON player_matches
    FOR EACH ROW EXECUTE FUNCTION update_player_fantasy_avg();

CREATE TRIGGER update_fantasy_avg_on_match_update
    AFTER UPDATE ON player_matches
    FOR EACH ROW EXECUTE FUNCTION update_player_fantasy_avg();
```

### 2. Testdaten generieren

Um die neue Funktion zu testen, generiere Testdaten:

```bash
npx tsx scripts/generate-test-matches.ts
```

Dieses Skript:
- Lädt alle Spieler aus der Datenbank
- Erstellt 5-15 zufällige Matches pro Spieler
- Weist realistische Fantasy-Punkte zu (mit Verteilung: 60% niedrig, 30% mittel, 10% hoch)
- Setzt zufällige Turniere und Gegner
- Der `fantasy_avg` wird automatisch durch den Datenbank-Trigger berechnet

## Verwendung

### Frontend (Players Page)

1. **Spielerliste anzeigen**: Die Tabelle zeigt jetzt eine zusätzliche Spalte "Avg Fantasy" mit dem durchschnittlichen Fantasy-Punkte-Wert

2. **Matchhistorie öffnen**: Klicke auf den Namen eines Spielers, um ein Modal mit seiner kompletten Matchhistorie zu öffnen

3. **Modal-Inhalte**:
   - Spielerinfo (Bild, Name, Rang, Land)
   - Statistiken: Durchschnittliche Fantasy-Punkte, Anzahl Matches, ATP-Punkte
   - Liste aller Matches mit:
     - Turniername und Datum
     - Gegner und Ergebnis (Grün = Sieg, Rot = Niederlage)
     - Fantasy-Punkte mit farbigem Balken:
       - **Grün**: ≥ 100 Punkte (herausragende Leistung)
       - **Orange**: 50-99 Punkte (gute Leistung)
       - **Rot**: < 50 Punkte (durchschnittliche/schwache Leistung)

### API / Backend

Neue Matches können über die Supabase-API hinzugefügt werden:

```typescript
const { data, error } = await supabase
  .from('player_matches')
  .insert({
    player_id: 'uuid-here',
    tournament_name: 'Australian Open 2026',
    opponent_name: 'Rafael Nadal',
    match_result: 'Won 6-4, 6-3',
    fantasy_points: 125,
    match_date: new Date().toISOString()
  })
```

Der `fantasy_avg` Wert wird automatisch aktualisiert.

## Anpassungen

### Fantasy-Punkte-Berechnung

Die Balkenfarben können in [page.tsx](c:\Users\lucve\dev\tennis_fantasy_copilot\tennis-fantasy-manager(1)\app\players\page.tsx) angepasst werden:

```typescript
const getFantasyPointsBarColor = (points: number) => {
  if (points >= 100) return 'bg-green-500'  // Ändern für andere Grenzwerte
  if (points >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}
```

### Balkenbreite

Die maximale Balkenbreite ist für 150 Punkte kalibriert. Anpassen in:

```typescript
const getFantasyPointsBarWidth = (points: number) => {
  const percentage = Math.min((points / 150) * 100, 100)  // 150 ändern für andere Skala
  return `${percentage}%`
}
```

## Nächste Schritte

1. SQL-Schema-Änderungen in Supabase ausführen
2. Testdaten mit `npx tsx scripts/generate-test-matches.ts` generieren
3. Anwendung testen: `npm run dev`
4. Auf `/players` navigieren und auf Spielernamen klicken

## Troubleshooting

- **Keine Matches werden angezeigt**: Prüfe, ob die `player_matches` Tabelle Daten enthält
- **fantasy_avg ist immer 0**: Stelle sicher, dass der Trigger korrekt erstellt wurde
- **Modal öffnet nicht**: Prüfe die Browser-Konsole auf JavaScript-Fehler
