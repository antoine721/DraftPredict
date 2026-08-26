# DraftPredict — Architecture & Contracts

DraftPredict is a League of Legends draft companion: real-time champ-select win
prediction, pick/ban suggestions, optimal builds (items/runes/spells/skills),
account connection and playstyle profiling.

The statistical engine is a port of [DraftGap](https://github.com/vigovlugt/draftgap)
(MIT, © Vigo Vlugt) — see `NOTICE`. Dataset shapes are kept **binary compatible**
with DraftGap dataset v5 so public datasets can be consumed directly at runtime.

## Monorepo layout (npm workspaces, TypeScript ESM, strict)

```
packages/core     @draftpredict/core     prediction engine (pure, no I/O)
packages/data     @draftpredict/data     static data (Data Dragon) + dataset providers/cache
packages/riot     @draftpredict/riot     Riot Games API client + playstyle profiling
packages/lcu      @draftpredict/lcu      League Client (LCU) connector
apps/server       @draftpredict/server   Fastify REST + WebSocket backend
apps/web          @draftpredict/web      React + Vite + Tailwind UI
apps/desktop      @draftpredict/desktop  Electron shell
apps/pipeline     @draftpredict/pipeline dataset builder (Riot match ingestion)
tests/reference   vendored DraftGap core, used ONLY by parity tests
```

Node >= 20. Module = ESNext, moduleResolution = Bundler, `"type": "module"`.
Every package builds with `tsc -b` into `dist/`, exports from `src/index.ts`.
Imports between workspace packages use the package name (`@draftpredict/core`).

## Domain model (must match exactly — cross-package contract)

```ts
enum Role { TOP = 0, JUNGLE = 1, MIDDLE = 2, BOTTOM = 3, UTILITY = 4 }
type Team = "ally" | "opponent";

interface Stats { wins: number; games: number }

interface ChampionMatchupData { championKey: string; role: Role; enemyChampionKey: string; enemyRole: Role; wins: number; games: number }
interface ChampionSynergyData { championKey: string; role: Role; otherChampionKey: string; otherRole: Role; wins: number; games: number }
interface ChampionDamageProfile { magic: number; physical: number; true: number }

interface ChampionRoleData {
  games: number; wins: number;
  matchup: Record<Role, Record<string, ChampionMatchupData>>;
  synergy: Record<Role, Record<string, ChampionSynergyData>>;
  damageProfile: ChampionDamageProfile;
  statsByTime: Stats[];              // 7 duration buckets, 5 min wide from 20min
}

interface ChampionData { id: string; key: string; name: string; i18n: Record<string,{name:string}>; statsByRole: Record<Role, ChampionRoleData> }

interface Dataset {
  version: string; date: string;
  championData: Record<string, ChampionData>;   // keyed by numeric champion key as string
  itemData: Record<number, ItemData>;
  runeData: Record<number, RuneData>;
  runePathData: Record<number, RunePathData>;
  statShardData: Record<number, StatShardData>;
  summonerSpellData: Record<number, SummonerSpellData>;
}
```

`Rank` = `ALL | IRON | BRONZE | SILVER | GOLD | PLATINUM | EMERALD | DIAMOND | MASTER | GRANDMASTER | CHALLENGER | PLATINUM_PLUS | DIAMOND_PLUS`.
`Region` = `ALL | BR | EUNE | EUW | JP | KR | LAN | LAS | NA | OCE | RU | TR | PH | SG | TH | TW | VN | ME`.
`RiskLevel` = `very-low | low | medium | high | very-high` → prior games
`{very-low:3000, low:2000, medium:1000, high:500, very-high:250}` (DraftGap's canonical
values; build analysis uses `{3000,2000,1000,750,500}`). `parseRiskLevel()` accepts
camelCase/underscore/space spellings, so wire formats may send `veryHigh` or `VERY_HIGH`;
call it at every API boundary.

## packages/core — public API (pure functions, no fetch/fs)

```ts
// rating
ratingToWinrate(d: number): number            // 1 / (1 + 10^(-d/400))
winrateToRating(w: number): number            // -400 * log10(1/w - 1)
getMatchupWinrate(w1, w2), getDuoWinrate(w1, w2)

// stats
addStats(...s: Stats[]): Stats
averageStats(...s: Stats[]): Stats
getStats(dataset, championKey, role, type?: "duo"|"matchup", role2?, championKey2?): Stats

// draft analysis
analyzeDraft(dataset, fullDataset, team: Map<Role,string>, enemy: Map<Role,string>, config: AnalyzeDraftConfig): DraftResult
  // DraftResult { allyChampionRating, enemyChampionRating, allyDuoRating, enemyDuoRating, matchupRating, totalRating, winrate }
analyzeChampion / analyzeChampions / analyzeDuos / analyzeMatchups
getDraftResultWinrateByTime(dataset, draftResult, team, enemy, config): {duration:number, winrate:number}[]

// suggestions
getSuggestions(dataset, fullDataset, team, enemy, config): Suggestion[]   // per open role, sorted by rating desc
getBanSuggestions(...): BanSuggestion[]
// Suggestion { championKey, role, rating, winrate, draftResult }

// role prediction
predictRoles(dataset, championKeys: string[]): Map<Role, string>

// builds
analyzeBuilds(buildDataset, ...): BuildAnalysisResult  // items/runes/spells/skills with winrate deltas
getDamageDistribution(dataset, team): ChampionDamageProfile
```

Behaviour is defined by `tests/reference/draftgap-core` — parity tests compare
outputs on randomized drafts and must agree to 1e-9.

## packages/data

- `loadStaticData()` — champions/items/runes/summoner spells from the bundled
  Data Dragon snapshot (`assets/ddragon/<version>/`), with an optional runtime
  updater that pulls a newer patch from `ddragon.leagueoflegends.com`
  (works on the end-user machine; the dev container blocks it — must degrade
  gracefully to the snapshot).
- `DatasetProvider` interface with implementations:
  `BundledFixtureProvider` (deterministic synthetic dataset, offline/dev/tests),
  `DraftGapRemoteProvider` (`https://bucket.draftgap.com/datasets/v5/...`, gzip),
  `LocalFileProvider` (datasets produced by apps/pipeline).
  Providers are tried in order and cached on disk + in memory with TTL.
- `generateFixtureDataset(seed)` — reproducible, realistic-looking dataset over
  the real champion list; used by every test and by the offline demo mode.

## packages/riot

Typed client, no secrets in code. Key comes from config/env `RIOT_API_KEY`.
- routing: platform host (euw1…) + regional host (europe/americas/asia/sea)
- endpoints: account-v1 (riotId↔puuid), summoner-v4, league-v4, match-v5
  (ids + match + timeline), champion-mastery-v4, spectator-v5 (live game)
- token-bucket rate limiter honouring 20/s + 100/2min dev limits and
  `Retry-After`; exponential backoff on 429/5xx; typed errors.
- `profilePlaystyle(matches, puuid): PlaystyleProfile` with normalized 0-100
  axes: aggression, farming, vision, objectives, survivability, teamplay,
  consistency, scaling — plus derived archetype, strengths, weaknesses,
  champion pool, role distribution, and per-role/per-champion breakdowns.

## packages/lcu

- `discoverCredentials()` — lockfile (`%LOCALAPPDATA%`/macOS/Linux paths) and
  process-command-line fallback (`LeagueClientUx --remoting-auth-token=… --app-port=…`).
- `LcuClient` — HTTPS to `127.0.0.1:<port>` with `riot:<token>` basic auth,
  self-signed cert accepted **only** for that host.
- `LcuWatcher` — polls for the client, opens the LCU WebSocket (wamp
  `[5,"OnJsonApiEvent"]`), emits typed events: `connected`, `disconnected`,
  `champ-select`, `gameflow-phase`, `current-summoner`.
- `mapChampSelectSession(session, staticData)` — converts an LCU session into
  the engine's `{ team: Map<Role,string>, enemy: Map<Role,string>, bans, hovered,
  localPlayer, timer, phase }`, inferring missing roles with `predictRoles`.

## apps/server (Fastify 5, port 4700)

REST (all JSON, zod-validated, typed error envelope `{error:{code,message}}`):
```
GET  /api/health
GET  /api/static/summary | /champions | /items | /runes | /summoner-spells
GET  /api/dataset?rank&region                     -> Dataset meta + payload
POST /api/draft/analyze     {team,enemy,config}   -> DraftResult (+winrate by time)
POST /api/draft/suggestions {team,enemy,config}   -> Suggestion[]
POST /api/draft/bans        {team,enemy,config}   -> BanSuggestion[]
GET  /api/builds/:championKey?role&vs             -> BuildAnalysis
GET  /api/account/lookup?riotId&region            -> {puuid,gameName,tagLine}
GET  /api/account/:puuid/profile?region           -> summoner + ranks + mastery
GET  /api/account/:puuid/matches?region&count     -> match summaries
GET  /api/account/:puuid/playstyle?region&count   -> PlaystyleProfile
GET  /api/account/:puuid/live?region              -> live game + draft analysis
GET  /api/lcu/status | /summoner | /champ-select
GET  /api/config  POST /api/config                -> settings (api key write-only)
```
WebSocket `/ws` — server→client events:
`{type:"lcu:status"} {type:"champselect:update"} {type:"draft:analysis"} {type:"config:update"}`.
Client→server: `{type:"subscribe"}`, `{type:"draft:set"}`.

Config lives in `~/.draftpredict/config.json` (0600). `RIOT_API_KEY` never
leaves the server; it is redacted in every response and log.

## apps/web (React 19 + Vite + Tailwind v4 + TanStack Query + Zustand)

Views:
1. **Draft** — 5v5 board with role slots, champion picker (search/filter/role),
   ban rows, live win-probability gauge, contribution breakdown (champion /
   duo / matchup bars), suggestion list per open role, ban suggestions,
   winrate-over-time curve, team damage distribution, LCU live badge.
2. **Champion / Build** — best items (starter, core, boots, situational, full
   order), runes (primary/secondary/shards), summoner spells, skill order,
   each with winrate + delta + sample size; matchup-aware.
3. **Account** — connect via Riot ID or auto-detect from the running client,
   rank cards, mastery, recent matches, playstyle radar + archetype,
   strengths/weaknesses, per-role breakdown.
4. **Live game** — spectator data, both teams, live draft analysis.
5. **Settings** — Riot API key, region, rank, risk level, data source, theme.

Dark-first design, keyboard-friendly, responsive, no external asset hosts
besides Data Dragon CDN images (with local fallback).

## Quality gates (must all pass before commit)

```
npm run typecheck   # tsc -b across the monorepo
npm run lint        # eslint 9 flat config
npm run test        # vitest: unit + parity vs vendored DraftGap core
npm run build       # all packages + web bundle
```

## Conventions learned while building (binding for every package)

- **Relative imports carry an explicit `.js` extension.** With
  `moduleResolution: "Bundler"`, `tsc` emits extensionless specifiers that Node's
  ESM loader cannot resolve, so `dist/` would not run. Every relative import in
  `packages/*` and `apps/server|pipeline` must end in `.js`.
- **Tests are excluded from `dist`** via `"exclude": ["**/*.test.ts", "src/testing/**", "dist"]`
  in each package tsconfig, but are still typechecked by vitest and the root config.
- `Role` exports both DraftGap names (`Top|Jungle|Middle|Bottom|Support`) and Riot
  names (`TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY`) as aliases of the same numeric values,
  plus `riotPositionByRole` for LCU/Riot API mapping.
- Matchup/synergy leaves keep DraftGap v5's minimal `{championKey, wins, games}`;
  the positional fields are optional, so a raw v5 payload type-checks unchanged.
- `@draftpredict/core` has **zero dependencies and zero I/O**. Anything that fetches,
  reads a file or touches the network belongs in `data`, `riot`, `lcu` or an app.
