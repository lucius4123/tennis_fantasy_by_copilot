# Match-Verwaltung und Punkteverteilung

Diese Erweiterung fügt dem Admin-Panel zwei neue Funktionen hinzu:

## 1. Match-Daten Verwaltung

Ermöglicht das Erfassen detaillierter Match-Statistiken für Spieler, die automatisch zur Matchhistorie hinzugefügt werden.

### Erfasste Statistiken:
- **Basis-Informationen**: Spieler, Turnier, Gegner, Ergebnis (Sieg/Niederlage), Datum
- **Detaillierte Statistiken**:
  - Asse
  - Doppelfehler
  - Erste Aufschlag-Prozentsatz
  - Break Points gewonnen
  - Break Points faced
  - Total Points gewonnen
  - Winners
  - Unforced Errors

### Fantasy-Punkte Berechnung
Die Fantasy-Punkte werden **automatisch** basierend auf den Statistiken und der konfigurierten Punkteverteilung berechnet.

## 2. Punkteverteilung

Konfigurieren Sie, wie viele Punkte für verschiedene Match-Ereignisse vergeben werden.

### Standard-Punkteverteilung:
- **Match-Sieg**: 50 Punkte
- **Match-Niederlage**: 0 Punkte
- **Ass**: 10 Punkte
- **Doppelfehler**: -5 Punkte
- **Break Point gewonnen**: 15 Punkte
- **Winner**: 5 Punkte
- **Unforced Error**: -3 Punkte

Diese Werte können jederzeit im Admin-Panel angepasst werden.

## Installation

### 1. Datenbank Migration ausführen

Öffnen Sie den Supabase SQL Editor und führen Sie das Skript `supabase/migration_match_statistics.sql` aus.

Dies wird:
- Neue Spalten zur `player_matches` Tabelle hinzufügen
- Die `scoring_rules` Tabelle erstellen
- Standard-Punkteverteilungsregeln einfügen
- Automatische Berechnungsfunktionen und Trigger einrichten

### 2. Server neu starten

```bash
npm run dev
```

## Verwendung

### Match hinzufügen

1. Navigieren Sie zum Admin-Panel
2. Wechseln Sie zum Tab "Matches"
3. Wählen Sie einen Spieler aus
4. Geben Sie Turnier, Gegner und Datum ein
5. Wählen Sie das Ergebnis (Sieg/Niederlage)
6. Geben Sie die detaillierten Statistiken ein
7. Klicken Sie auf "Match hinzufügen"

Die Fantasy-Punkte werden automatisch berechnet und in der Match-Historie angezeigt.

### Punkteverteilung anpassen

1. Navigieren Sie zum Admin-Panel
2. Wechseln Sie zum Tab "Punkteverteilung"
3. Passen Sie die Punktwerte an
4. Änderungen werden automatisch gespeichert beim Verlassen des Eingabefeldes

**Hinweis**: Änderungen an der Punkteverteilung wirken sich sofort auf neu erstellte Matches aus. Bereits existierende Matches behalten ihre ursprünglichen Punktzahlen.

## Features

✅ **Automatische Punkteberechnung**: Fantasy-Punkte werden automatisch basierend auf Statistiken berechnet
✅ **Flexible Punkteverteilung**: Passen Sie die Punktevergabe an Ihre Bedürfnisse an
✅ **Detaillierte Statistiken**: Erfassen Sie umfassende Match-Daten
✅ **Match-Historie**: Alle Matches werden automatisch in der Spieler-Historie gespeichert
✅ **Fantasy Average Update**: Der Fantasy-Durchschnitt eines Spielers wird automatisch aktualisiert

## API-Endpunkte

### Matches

- `GET /api/admin/matches` - Alle Matches abrufen
- `POST /api/admin/matches` - Neues Match erstellen
- `PATCH /api/admin/matches/[id]` - Match aktualisieren
- `DELETE /api/admin/matches/[id]` - Match löschen

### Punkteverteilung

- `GET /api/admin/scoring-rules` - Alle Regeln abrufen
- `POST /api/admin/scoring-rules` - Neue Regel erstellen
- `PATCH /api/admin/scoring-rules/[id]` - Regel aktualisieren
- `DELETE /api/admin/scoring-rules/[id]` - Regel löschen
