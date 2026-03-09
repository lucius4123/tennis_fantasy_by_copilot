# Tournament Management System - Implementierungsanleitung

## Übersicht

Das System ermöglicht die Verwaltung von Turnieren mit folgenden Features:
- Turniere können aktiv/inaktiv geschaltet werden
- Nur aktive Turniere werden in Fantasy-Ligen angezeigt
- Spieler können Turnieren zugeordnet werden
- Auftrittswahrscheinlichkeit pro Spieler und Turnier
- Nur Spieler aus aktiven Turnieren sind auf dem Transfermarkt verfügbar

## Datenbankänderungen

### 1. Schema aktualisieren

Führe folgende SQL-Befehle in deiner Supabase-Datenbank aus:

```sql
-- Füge is_active Feld zur tournaments Tabelle hinzu
ALTER TABLE tournaments ADD COLUMN is_active BOOLEAN DEFAULT false;

-- Erstelle tournament_players Tabelle (Many-to-Many Beziehung)
CREATE TABLE tournament_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    appearance_probability TEXT NOT NULL CHECK (appearance_probability IN ('Garantiert', 'Sehr Wahrscheinlich', 'Wahrscheinlich', 'Riskant', 'Sehr Riskant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tournament_id, player_id)
);

-- RLS für tournament_players aktivieren
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view tournament players" ON tournament_players FOR SELECT USING (true);
CREATE POLICY "Service role can manage tournament players" ON tournament_players FOR ALL USING (auth.role() = 'service_role');
```

## Admin-Interface

### Zugriff
Navigiere zu `/admin` um das Admin-Panel zu öffnen. Ein Link ist im Dashboard verfügbar.

### Funktionen

#### 1. Turnier erstellen
- Gib Turniername und Startdatum ein
- Klicke auf "Turnier erstellen"
- Das Turnier wird standardmäßig als inaktiv erstellt

#### 2. Turnier aktivieren/deaktivieren
- Klicke auf den "Aktiv/Inaktiv" Button bei einem Turnier
- **Aktive** Turniere haben einen grünen Button
- **Inaktive** Turniere haben einen grauen Button

#### 3. Spieler zu Turnier zuordnen
- Wähle ein Turnier aus der linken Liste
- Im rechten Bereich erscheint die Liste verfügbarer Spieler
- Klicke auf "Hinzufügen" bei einem Spieler

#### 4. Auftrittswahrscheinlichkeit festlegen
- Bei zugeordneten Spielern werden 5 Optionen angezeigt:
  - **Garantiert** (Grün): Spieler tritt definitiv an
  - **Sehr Wahrscheinlich** (Hellgrün): Sehr hohe Wahrscheinlichkeit
  - **Wahrscheinlich** (Gelb): Normale Wahrscheinlichkeit
  - **Riskant** (Orange): Unsicher
  - **Sehr Riskant** (Rot): Sehr unsicher
- Klicke auf die gewünschte Option

#### 5. Spieler entfernen
- Klicke auf das rote Papierkorb-Symbol bei einem zugeordneten Spieler

## Integration in Fantasy-Ligen

### Automatische Filterung

1. **Turniere in Ligen**: Nur aktive Turniere werden in der Liga-Ansicht angezeigt
   ```typescript
   .eq('is_active', true)
   ```

2. **Transfermarkt**: Die API-Route `/api/active-tournament-players` liefert nur Spieler aus aktiven Turnieren

### API-Nutzung

```typescript
// Abrufen von Spielern aus aktiven Turnieren
const response = await fetch('/api/active-tournament-players')
const { players } = await response.json()
```

## Auftrittswahrscheinlichkeit

### Bedeutung für Fantasy-Manager

Die Auftrittswahrscheinlichkeit hilft Spielern bei der Entscheidung:
- **Garantiert**: Sichere Investition
- **Sehr Wahrscheinlich**: Gute Investition mit minimalem Risiko
- **Wahrscheinlich**: Standard-Risiko
- **Riskant**: Höheres Risiko, aber potenziell günstiger
- **Sehr Riskant**: Hohe Chance, dass der Spieler nicht antritt

### Visuelle Darstellung

Im Admin-Panel sind die Wahrscheinlichkeiten farbcodiert:
- Grün-Töne für hohe Wahrscheinlichkeit
- Gelb für mittlere Wahrscheinlichkeit
- Orange/Rot für niedrige Wahrscheinlichkeit

## Workflow für einen neuen Turnier-Zyklus

1. **Admin-Panel öffnen** (`/admin`)
2. **Neues Turnier erstellen** mit Namen und Datum
3. **Spieler zuordnen** aus der verfügbaren Spielerliste
4. **Auftrittswahrscheinlichkeit** für jeden Spieler festlegen
5. **Turnier aktivieren** mit dem Aktiv-Button
6. Das Turnier ist jetzt in allen Ligen sichtbar
7. Spieler können auf dem Transfermarkt geboten werden
8. Nach Turnierstart: **Turnier deaktivieren**

## Beispiel-Flow

```
1. Admin erstellt "Australian Open 2026" für 15.01.2026
2. Admin fügt 64 Spieler hinzu mit verschiedenen Wahrscheinlichkeiten
3. Admin aktiviert das Turnier
4. ✓ In Ligen wird "Australian Open 2026" angezeigt
5. ✓ Transfermarkt zeigt nur die 64 zugeordneten Spieler
6. Teams können bieten und Aufstellungen planen
```

## Troubleshooting

### Turnier wird nicht in Liga angezeigt
- Prüfe, ob das Turnier **aktiv** geschaltet ist
- Prüfe, ob das Startdatum in der Zukunft liegt

### Spieler erscheinen nicht auf Transfermarkt
- Prüfe, ob die Spieler einem **aktiven** Turnier zugeordnet sind
- Nutze die API `/api/active-tournament-players` zum Debuggen

### Kann keine Spieler zuordnen
- Stelle sicher, dass das Turnier ausgewählt ist
- Prüfe, ob der Spieler bereits zugeordnet ist

## Nächste Schritte

1. SQL-Schema in Supabase ausführen
2. Admin-Panel unter `/admin` aufrufen
3. Erste Turniere erstellen und Spieler zuordnen
4. Testen in Fantasy-Liga-Ansicht
