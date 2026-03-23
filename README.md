# Tennis Fantasy Manager - Technische Dokumentation

Diese README beschreibt die aktuelle technische Struktur der App, inklusive Architektur, Routing, APIs, Datenmodell, Authentifizierung und Betriebsablauf.

## 1. Projektueberblick

Tennis Fantasy Manager ist eine Next.js-App fuer ein Fantasy-Tennis-Spiel mit:

- Turnier- und Spielerverwaltung
- Fantasy-Teams und Liga-Management
- Transfermarkt (Auktionen und Direktverkaeufe)
- Scoring-Regeln und Punkteberechnung auf Matchdaten
- Admin-Bereich fuer operative Verwaltung

## 2. Tech Stack

### Core

- Next.js 15 (App Router)
- React 19
- TypeScript 5

### Styling und UI

- Tailwind CSS 4
- PostCSS
- motion
- lucide-react
- clsx + tailwind-merge

### Backend und Daten

- Supabase (PostgreSQL, Auth, Storage, RLS)
- @supabase/supabase-js
- @supabase/ssr

### Externe Integrationen

- RapidAPI (ATP Ranking Sync)

## 3. Laufzeitarchitektur

Die App folgt einer klassischen Next.js App-Router-Architektur mit Server- und Client-Komponenten.

1. UI-Ebene in app/*
2. API-Ebene in app/api/* (Route Handler)
3. Datenebene in Supabase (Tabellen, RLS, Storage)
4. Domainenlogik in lib/*
5. Supabase-Client-Helfer in utils/supabase/*

Zusatzprozess:

- instrumentation.ts startet eine periodische Marktwartung (alle 60 Sekunden), um abgelaufene Auktionen zu verarbeiten und den Transfermarkt nachzufuellen.

## 4. Verzeichnisstruktur

```text
app/
   admin/
      page.tsx
      upload-players/page.tsx
   api/
      active-tournament-players/route.ts
      admin/
         maintenance/transfer-market/route.ts
         matches/route.ts
         matches/[id]/route.ts
         players/route.ts
         scoring-rules/route.ts
         scoring-rules/[id]/route.ts
         tournament-players/[id]/route.ts
         tournaments/route.ts
         tournaments/[id]/route.ts
         tournaments/[id]/players/route.ts
         tournaments/[id]/update-points/route.ts
      league/
         auctions/bid/route.ts
         auctions/sync/route.ts
         player-sales/accept/route.ts
         player-sales/bids/route.ts
         player-sales/cancel/route.ts
         player-sales/offer/route.ts
         player-sales/sell-to-market/route.ts
      sync-tennis/route.ts
      upload-player-image/route.ts
      upload-team-image/route.ts
   auth/
      callback/route.ts
      signout/route.ts
   dashboard/
      page.tsx
      league/[id]/page.tsx
   login/page.tsx
   players/page.tsx

lib/
   auth.ts
   transfer-market.ts
   utils.ts

utils/supabase/
   client.ts
   middleware.ts
   server.ts

scripts/
   generate-test-data.ts
   generate-test-matches.ts
   test-constraint.ts

supabase/
   schema.sql
   migration_*.sql
```

## 5. Frontend-Routing

- / -> Landing Page
- /login -> Login mit Supabase Auth UI
- /dashboard -> Nutzeruebersicht
- /dashboard/league/[id] -> Ligaansicht mit Team, Markt und Aktionen
- /players -> Spielerkatalog
- /admin -> Admin-Panel
- /admin/upload-players -> Admin Bulk-Upload

Auth-Routen:

- /auth/callback -> OAuth-Callback / Session-Austausch
- /auth/signout -> Logout

## 6. API-Struktur

### 6.1 Allgemein

- GET /api/active-tournament-players
- GET /api/sync-tennis
- POST /api/upload-player-image
- POST /api/upload-team-image

### 6.2 Admin APIs

Turniere:

- GET /api/admin/tournaments
- POST /api/admin/tournaments
- PATCH /api/admin/tournaments/[id]
- DELETE /api/admin/tournaments/[id]
- GET /api/admin/tournaments/[id]/players
- POST /api/admin/tournaments/[id]/players
- POST /api/admin/tournaments/[id]/update-points

Turnier-Spieler:

- PATCH /api/admin/tournament-players/[id]
- DELETE /api/admin/tournament-players/[id]

Matches:

- GET /api/admin/matches
- POST /api/admin/matches
- PATCH /api/admin/matches/[id]
- DELETE /api/admin/matches/[id]

Spieler:

- GET /api/admin/players
- POST /api/admin/players

Scoring Rules:

- GET /api/admin/scoring-rules
- POST /api/admin/scoring-rules
- PATCH /api/admin/scoring-rules/[id]
- DELETE /api/admin/scoring-rules/[id]

Maintenance:

- POST /api/admin/maintenance/transfer-market

### 6.3 Liga APIs

Auktionen:

- POST /api/league/auctions/bid
- DELETE /api/league/auctions/bid
- POST /api/league/auctions/sync

Player Sales:

- POST /api/league/player-sales/offer
- POST /api/league/player-sales/bids
- POST /api/league/player-sales/accept
- DELETE /api/league/player-sales/cancel
- POST /api/league/player-sales/sell-to-market

## 7. Authentifizierung und Autorisierung

Die App verwendet Supabase Auth (Cookie-basiert via @supabase/ssr).

### Relevante Bausteine

- middleware.ts -> globales Request-Middleware-Matching
- utils/supabase/middleware.ts -> updateSession(request)
- utils/supabase/server.ts -> Server-Supabase-Client
- utils/supabase/client.ts -> Browser-Supabase-Client
- lib/auth.ts -> isAdminUser(user)

### Zugriffskontrolle

- /dashboard* und /admin* erfordern authentifizierte User
- /admin* und /api/admin/* erfordern zusaetzlich Rolle admin
- Nicht autorisierte API-Aufrufe erhalten 401/403

## 8. Datenmodell (Supabase)

Die Kernstruktur liegt in supabase/schema.sql, Erweiterungen in supabase/migration_*.sql.

### Wichtige Tabellen nach Domaene

Spieler und Performance:

- players
- player_matches
- scoring_rules

Turniere:

- tournaments
- tournament_players
- tournament_lineups

Ligen und Teams:

- leagues
- user_leagues
- fantasy_teams
- team_players

Transfermarkt:

- market_auctions
- market_bids
- market_player_rotation
- player_sales_history

Kommunikation:

- league_news

### Migrationsthemen

- Marktwert und Transfermarkt-Erweiterungen
- Gebots- und News-Tracking
- Matchstatistik und Scoring-Erweiterungen
- Wildcard-Status und Appearance Probability
- Finanz- und Reserve-Slot-Regeln fuer Turniere

## 9. Punkteberechnung

Die Neuberechnung erfolgt ueber:

- POST /api/admin/tournaments/[id]/update-points

Vereinfacht:

1. Scoring-Regeln laden (scoring_rules)
2. player_matches eines Turniers laden
3. fantasy_points je Match aus Statistiken neu berechnen
4. Punkte je Spieler aggregieren
5. Punkte ueber tournament_lineups auf Teams verteilen
6. total_points_scored in fantasy_teams aktualisieren

## 10. Transfermarkt-Logik

Kernlogik in lib/transfer-market.ts:

- Admin-Client mit SUPABASE_SERVICE_ROLE_KEY
- Initiale Teamzuweisung auf Basis Marktwert/Target
- Rotation von Marktspielern je Liga
- Verarbeitung abgelaufener Auktionen
- Rueckgabe unverkaeufter Spieler an Verkaeuferteam
- News-Eintraege bei Markt-Events

Automatisierung:

- instrumentation.ts startet periodische Marktwartung (60s Intervall)

## 11. Umgebungsvariablen (.env.local)

Mindestens erforderlich:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RAPIDAPI_KEY=
SYNC_SECRET=
DISABLE_HMR=
```

Hinweise:

- NEXT_PUBLIC_* ist im Browser verfuegbar.
- SUPABASE_SERVICE_ROLE_KEY darf niemals im Client genutzt oder geleakt werden.
- /api/sync-tennis erwartet Authorization: Bearer <SYNC_SECRET>.

## 12. Entwicklungs- und Build-Kommandos

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
```

Zusatzskripte:

```bash
npm run test-data:generate -- <USER_ID_1> <USER_ID_2>
npm run test:constraint
```

Es existiert zusaetzlich:

- scripts/generate-test-matches.ts (manuell ausfuehrbar via tsx)

## 13. Zusaetzliche Projektdokumentation

Im Repository liegen weitere fachliche Deep-Dive-Dokumente:

- MATCH_HISTORY_README.md
- MATCH_MANAGEMENT_README.md
- TOURNAMENT_MANAGEMENT_README.md

## 14. Technische Hinweise

- next.config.ts nutzt output: standalone (containerfreundlicher Build).
- ESLint ist waehrend next build deaktiviert (ignoreDuringBuilds: true).
- TypeScript-Buildfehler bleiben aktiv (ignoreBuildErrors: false).
- Remote-Bilder sind aktuell fuer picsum.photos freigeschaltet.

## 15. Empfohlener Betriebsfluss

1. Supabase Schema + Migrationen anwenden.
2. .env.local konfigurieren.
3. Dev-Server starten.
4. Login und Liga anlegen.
5. Optional Testdaten generieren.
6. Spieler synchronisieren (geschuetzter Sync-Endpoint).
7. Turnierdaten pflegen, Matches erfassen, Punkte aktualisieren.
