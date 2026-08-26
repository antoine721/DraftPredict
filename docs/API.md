# DraftPredict — HTTP & WebSocket API

`apps/server` (Fastify 5) is the only backend `apps/web` talks to. This document
is the contract between them: every route, every payload, every error code.

- Base URL in development: `http://127.0.0.1:4700` (`PORT`, default `4700`).
- In production the same process also serves `apps/web/dist`, so the UI is
  same-origin and can use relative URLs (`/api/...`).
- Everything is JSON (`application/json; charset=utf-8`). Request bodies are
  validated with zod.
- CORS allows the Vite dev origins (`localhost` / `127.0.0.1` / `[::1]` on ports
  5173, 5174, 4173, 4700) with credentials. Requests without an `Origin` header
  (curl, the desktop shell) are always allowed.

---

## 1. Conventions

### 1.1 Error envelope

Every failure — validation, upstream, or internal — has the same shape:

```json
{
    "error": {
        "code": "UNKNOWN_CHAMPION",
        "message": "Unknown champion key(s): 999999",
        "details": { "championKeys": ["999999"] }
    }
}
```

`details` is optional. Match on `code`, never on `message` (messages are
human-facing and may be reworded or translated).

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | zod rejected the body or query. `details` is `[{path, message}]`. |
| `UNKNOWN_CHAMPION` | 400 / 404 | A champion key is absent from the dataset (400 in a draft body, 404 for `/api/builds/:championKey`). |
| `CHAMPION_ON_BOTH_TEAMS` | 400 | The same champion appears on `team` and `enemy`. |
| `DUPLICATE_ROLE` | 400 | A role is filled twice on one team. |
| `INVALID_RIOT_ID` | 400 | A Riot ID was not `Name#TAG`. |
| `RIOT_KEY_INVALID` | 400 | The submitted key is not shaped like a Riot key. |
| `RIOT_KEY_REJECTED` | 400 | Riot answered 401/403 for the submitted key. |
| `UNKNOWN_PLATFORM` | 400 | `platform`/`region` is not a Riot routing value. |
| `NOT_FOUND` | 404 | No such route, or Riot returned 404. |
| `LCU_NO_SUMMONER` | 404 | No League Client connected / nobody logged in. |
| `RIOT_KEY_MISSING` | **428** | No Riot API key is configured. The UI turns this into the "connecter mon compte" call to action. |
| `RATE_LIMITED` | 429 | Riot rate-limited the server. |
| `DATASET_UNAVAILABLE` | 503 | No dataset provider could serve the request. |
| `DATASET_NETWORK`, `DATASET_TIMEOUT`, … | 503 | Specific dataset failures (`DATASET_` + the provider error code). |
| `INTERNAL_ERROR` | 500 | Unexpected server fault. Details are logged, never returned. |

Riot errors keep Riot's own code (`NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`,
…) and carry a redacted `details` object
(`{name, code, status, endpoint, retryable, message}`).

> **The Riot API key never appears in a response or a log line.** It is redacted
> from URLs, error messages and stack traces before anything is written.

### 1.2 Roles

`Role` is an integer, always: `0` top, `1` jungle, `2` middle, `3` bottom,
`4` support (Riot's `UTILITY`). Query parameters additionally accept names
(`top`, `jgl`, `mid`, `adc`, `support`, `UTILITY`, …).

### 1.3 Draft wire format

`Map<Role, championKey>` is not JSON-serialisable, so teams travel as
`[role, championKey][]` — the `SerializedDraftState` shape of
`@draftpredict/core`. Champion keys are the **numeric champion key as a
string** (`"266"` = Aatrox), the same key the dataset uses.

```json
{
    "team": [[0, "266"], [1, "64"]],
    "enemy": [[0, "122"], [2, "157"]],
    "bans": { "ally": ["1"], "opponent": [] }
}
```

### 1.4 Analysis config

Every draft route accepts an optional `config`:

| Field | Type | Default |
| --- | --- | --- |
| `riskLevel` | `very-low \| low \| medium \| high \| very-high` | server setting (`medium`) |
| `minGames` | integer ≥ 0 | server setting (`1000`) |
| `ignoreChampionWinrates` | boolean | server setting (`false`) |

`riskLevel` is parsed leniently: `veryHigh`, `VERY_HIGH` and `very high` all
resolve to `very-high`. The **resolved** config is echoed in every response.

### 1.5 Dataset provenance (read this before rendering numbers)

The provider chain is *local pipeline file → DraftGap bucket → bundled offline
fixture*. The fixture is synthetic. Every dataset-backed response therefore
carries a `dataset` block, and the UI must label `offline: true` data honestly
("données de démonstration hors-ligne") instead of presenting it as live stats.

```json
{
    "rank": "PLATINUM_PLUS",
    "region": "ALL",
    "provider": "bundled-fixture",
    "date": "2026-08-26",
    "offline": true,
    "patch": {
        "rank": "PLATINUM_PLUS", "region": "ALL", "window": "patch", "patch": null,
        "provider": "bundled-fixture", "source": "provider", "version": "5",
        "date": "2026-08-26", "championCount": 173,
        "loadedAt": 1787745627651, "offline": true
    },
    "full": { "…": "same shape, window: \"full\"" }
}
```

- `provider` — `local-file`, `draftgap-remote` or `bundled-fixture`.
- `source` — which tier answered: `memory`, `disk`, `provider` or `stale`.
- `window` — `patch` (current-patch winrates) or `full` (30-day matchup/synergy
  sample). Analysis always uses both.
- `offline` — `true` only for `bundled-fixture`.

### 1.6 Caching

`/api/static/*` responses carry a strong `ETag` and
`Cache-Control: public, max-age=3600, must-revalidate`; send `If-None-Match` to
get a `304`. Dataset, draft and build responses are not HTTP-cached (they depend
on live settings), but the dataset itself is cached in memory and on disk by the
server, and Riot account data is cached per puuid (see §7).

---

## 2. `GET /api/health`

Boot probe: dataset provider, static data patch, LCU status, Riot key.

```json
{
    "status": "ok",
    "version": "0.1.0",
    "uptimeMs": 5445,
    "staticData": { "version": "16.17.1", "language": "en_US", "source": "bundled", "champions": 173 },
    "dataset": {
        "available": true,
        "rank": "PLATINUM_PLUS", "region": "ALL", "window": "patch", "patch": null,
        "provider": "bundled-fixture", "source": "provider", "version": "5",
        "date": "2026-08-26", "championCount": 173, "loadedAt": 1787745589108,
        "offline": true,
        "providers": [
            "draftgap-remote: Public DraftGap datasets from https://bucket.draftgap.com",
            "bundled-fixture: Synthetic dataset generated offline from the bundled champion list (seed 20260826)"
        ]
    },
    "lcu": { "enabled": false, "running": false, "connected": false, "polling": false,
             "phase": null, "inChampSelect": false, "summoner": null,
             "lastError": null, "updatedAt": 1787745588839 },
    "riot": { "configured": false, "platform": "euw1" },
    "web": { "served": false, "root": null },
    "websocket": { "clients": 0, "heartbeatMs": 30000 }
}
```

`status` is `"ok"`, or `"degraded"` when no dataset could be loaded — in which
case `dataset` is `{ "available": false, "error": "…" }`. The server still
answers 200: health reports state, it does not fail.

---

## 3. Settings — `/api/config`

### `GET /api/config`

```json
{
    "config": {
        "platform": "euw1",
        "rank": "PLATINUM_PLUS",
        "region": "ALL",
        "riskLevel": "medium",
        "minGames": 1000,
        "ignoreChampionWinrates": false,
        "lcuEnabled": true,
        "allowRemoteDataset": true,
        "datasetLocalRoot": null,
        "language": "en_US",
        "theme": "dark",
        "hasRiotApiKey": true,
        "riotApiKeyPreview": "RGAPI-****4444",
        "riotApiKeySource": "file",
        "configPath": "/home/moi/.draftpredict/config.json"
    },
    "dataset": { "providers": ["…"], "last": { "…": "DatasetMeta or null" } },
    "staticData": { "version": "16.17.1", "source": "bundled", "language": "en_US" }
}
```

**The API key is never returned.** Only `hasRiotApiKey`, a
`RGAPI-****<last 4>` preview, and where the effective key comes from
(`riotApiKeySource`: `file`, `env` or `null`).

Precedence is *defaults < environment < `~/.draftpredict/config.json`*.
Environment variables read: `RIOT_API_KEY`, `DRAFTPREDICT_PLATFORM`, `PORT`,
plus the optional `DRAFTPREDICT_RANK`, `DRAFTPREDICT_REGION`,
`DRAFTPREDICT_RISK_LEVEL`, `DRAFTPREDICT_MIN_GAMES`, `DRAFTPREDICT_LCU=0`,
`DRAFTPREDICT_OFFLINE=1`, `DRAFTPREDICT_DATASET_DIR`, `DRAFTPREDICT_WEB_ROOT`,
`HOST`, `LOG_LEVEL`.

### `POST /api/config`

Body — every field optional, only what you send is changed:

```json
{
    "riotApiKey": "RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "platform": "euw1",
    "rank": "diamond_plus",
    "region": "EUW",
    "riskLevel": "VERY_LOW",
    "minGames": 250,
    "ignoreChampionWinrates": false,
    "lcuEnabled": true,
    "allowRemoteDataset": true,
    "datasetLocalRoot": null,
    "language": "fr_FR",
    "theme": "dark",
    "validateKey": true
}
```

- `riotApiKey: null` (or `""`) clears the stored key.
- `validateKey: false` skips the live probe.

Response:

```json
{
    "config": { "…": "same as GET, key still redacted" },
    "probe": { "attempted": true, "ok": false, "status": "unreachable",
               "message": "Riot could not be reached, so the key was not verified." }
}
```

Key handling, in order:

1. **Shape check** — must look like `RGAPI-…`. Otherwise 400 `RIOT_KEY_INVALID`,
   nothing is written.
2. **Best-effort live probe** — one `spectator-v5/featured-games` call, 4 s
   timeout, no retries. It is *allowed to fail*: an unreachable Riot (offline
   machine, corporate proxy, this dev container) still saves the key, with
   `probe.status: "unreachable"`.
3. **Explicit rejection only** — if Riot answers 401/403 the write is refused
   with 400 `RIOT_KEY_REJECTED`.

The file is written to `~/.draftpredict/config.json` with mode `0600` in a
directory created `0700`. A successful write also broadcasts
`{"type":"config:update"}` on the WebSocket.

---

## 4. Static game data — `/api/static/*`

All five routes are `GET`, ETag'd and cacheable.

### `GET /api/static/summary`

The compact list the champion picker uses. Nothing but what a tile needs.

```json
{
    "version": "16.17.1",
    "language": "en_US",
    "source": "bundled",
    "counts": { "champions": 173, "items": 248, "runes": 62, "summonerSpells": 9 },
    "champions": [
        {
            "key": "266",
            "id": "Aatrox",
            "name": "Aatrox",
            "title": "the Darkin Blade",
            "tags": ["Fighter"],
            "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Aatrox.png"
        }
    ]
}
```

`source` is `bundled` (the snapshot shipped with the app) or `cache` (a newer
patch downloaded at runtime). Icon URLs point at the Data Dragon CDN; the UI is
expected to fall back gracefully when the CDN is unreachable.

### `GET /api/static/champions`

Everything in `/summary`, plus `partype`, `info`, `stats`, `splash`, `loading`,
`passive` and `spells`:

```json
{
    "version": "16.17.1", "language": "en_US", "source": "bundled",
    "champions": [{
        "key": "266", "id": "Aatrox", "name": "Aatrox", "title": "the Darkin Blade",
        "tags": ["Fighter"],
        "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Aatrox.png",
        "partype": "Blood Well",
        "info": { "attack": 8, "defense": 4, "magic": 3, "difficulty": 4 },
        "stats": { "hp": 650, "hpperlevel": 114, "…": "full Data Dragon stat block" },
        "splash": "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg",
        "loading": "https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Aatrox_0.jpg",
        "passive": { "name": "Deathbringer Stance", "description": "…", "icon": "…/passive/Aatrox_Passive.png" },
        "spells": [{
            "id": "AatroxQ", "slot": "Q", "name": "The Darkin Blade", "description": "…",
            "cooldown": "14/12/10/8/6", "cost": "0", "costType": "No Cost", "range": "25000",
            "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/spell/AatroxQ.png"
        }]
    }]
}
```

### `GET /api/static/items`

Summoner's Rift purchasable items only.

```json
{
    "version": "16.17.1",
    "items": [{
        "id": 1001, "name": "Boots", "plaintext": "Slightly increases Move Speed",
        "description": "<mainText>…</mainText>",
        "gold": { "base": 300, "total": 300, "sell": 210, "purchasable": true },
        "tags": ["Boots"], "from": [], "into": [3005, 3047], "depth": 1,
        "stats": { "FlatMovementSpeedMod": 25 },
        "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/item/1001.png"
    }]
}
```

### `GET /api/static/runes`

```json
{
    "version": "16.17.1",
    "paths": [{
        "id": 8100, "key": "Domination", "name": "Domination",
        "icon": "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7200_Domination.png",
        "slots": [[{
            "id": 8112, "key": "Electrocute", "name": "Electrocute",
            "shortDesc": "…", "longDesc": "…", "slot": 0, "index": 0,
            "icon": "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/Electrocute/Electrocute.png"
        }]]
    }],
    "shardRows": [[{ "id": 5008, "key": "AdaptiveForce", "name": "Adaptive Force",
                     "icon": "…/StatMods/StatModsAdaptiveForceIcon.png",
                     "positions": [{ "slot": "offense", "slotIndex": 0, "index": 0 }] }]]
}
```

`slots[0]` is the keystone row. `shardRows` is always three rows, offense first.

### `GET /api/static/summoner-spells`

```json
{
    "version": "16.17.1",
    "summonerSpells": [{
        "key": 21, "id": "SummonerBarrier", "name": "Barrier",
        "description": "Gain a brief Shield.", "cooldown": 180, "summonerLevel": 4,
        "modes": ["ARAM", "CLASSIC"],
        "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/spell/SummonerBarrier.png"
    }]
}
```

### `GET /api/static/search?q=&limit=`

Forgiving champion search (`mf`, `MissF`, `fortune` all find Miss Fortune).
`limit` defaults to 10 (max 50). An empty `q` returns the first `limit` champions in name order.

```json
{ "query": "mf", "results": [{ "key": "21", "id": "MissFortune", "name": "Miss Fortune",
                               "title": "the Bounty Hunter", "tags": ["Marksman"], "icon": "…" }] }
```

---

## 5. Datasets — `/api/dataset*`

### `GET /api/dataset?rank=&region=&patch=&window=&include=`

| Query | Values | Default |
| --- | --- | --- |
| `rank` | `ALL`, `IRON` … `CHALLENGER`, `PLATINUM_PLUS`, `DIAMOND_PLUS` (case-insensitive, `-`/space → `_`) | configured rank |
| `region` | `ALL`, `BR`, `EUNE`, `EUW`, `JP`, `KR`, … | configured region |
| `patch` | e.g. `16.17` | provider's newest |
| `window` | `patch` \| `full` | `patch` |
| `include` | `meta` \| `full` | `meta` |

`include=meta` (default) — metadata only:

```json
{
    "meta": { "rank": "PLATINUM_PLUS", "region": "ALL", "window": "patch", "patch": null,
              "provider": "bundled-fixture", "source": "memory", "version": "5",
              "date": "2026-08-26", "championCount": 173,
              "loadedAt": 1787745643449, "offline": true },
    "providers": ["bundled-fixture: Synthetic dataset generated offline from the bundled champion list (seed 20260826)"]
}
```

`include=full` adds `"dataset"`: the whole DraftGap-v5-compatible `Dataset`
(`version`, `date`, `championData`, `itemData`, `runeData`, `runePathData`,
`statShardData`, `summonerSpellData`). This can be tens of megabytes — only ask
for it when analysing client-side.

Errors: 400 `VALIDATION_ERROR` for an unknown rank/region, 503
`DATASET_UNAVAILABLE` when every provider fails.

### `GET /api/dataset/providers`

```json
{ "providers": ["draftgap-remote: …", "bundled-fixture: …"], "last": { "…": "DatasetMeta or null" } }
```

### `POST /api/dataset/refresh`

Body: the same `rank` / `region` / `patch` fields (all optional). Bypasses both
cache tiers, reloads both windows, and broadcasts `{"type":"dataset:update"}`.

```json
{ "dataset": { "…": "DatasetPairMeta (§1.5)" } }
```

---

## 6. Draft — `/api/draft/*`

All three take the §1.3 body plus an optional `config`, `rank`, `region`,
`patch`. Validation, in order: zod shape → duplicate role → duplicate champion →
champion on both teams → champion keys present in the dataset.

### `POST /api/draft/analyze`

Request:

```json
{
    "team": [[0, "266"], [1, "64"]],
    "enemy": [[0, "122"], [2, "157"]],
    "bans": { "ally": ["1"], "opponent": [] },
    "config": { "riskLevel": "medium", "minGames": 1000, "ignoreChampionWinrates": false }
}
```

Response:

```json
{
    "dataset": { "…": "DatasetPairMeta (§1.5)" },
    "config": { "riskLevel": "medium", "minGames": 1000, "ignoreChampionWinrates": false },
    "state": { "ally": [[0, "266"], [1, "64"]],
               "opponent": [[0, "122"], [2, "157"]],
               "bans": { "ally": ["1"], "opponent": [] } },

    "result": {
        "allyChampionRating": {
            "championResults": [
                { "role": 0, "championKey": "266", "rating": -21.934, "wins": 846, "games": 1806 }
            ],
            "totalRating": -32.698
        },
        "enemyChampionRating": { "championResults": ["…"], "totalRating": -3.969 },
        "allyDuoRating": {
            "duoResults": [
                { "roleA": 0, "championKeyA": "266", "roleB": 1, "championKeyB": "64",
                  "rating": 0.0208, "wins": 342.05, "games": 684 }
            ],
            "totalRating": 0.0208
        },
        "enemyDuoRating": { "duoResults": ["…"], "totalRating": 3.339 },
        "matchupRating": {
            "matchupResults": [
                { "roleA": 0, "championKeyA": "266", "roleB": 0, "championKeyB": "122",
                  "rating": -1.104, "wins": 405.61, "games": 817 }
            ],
            "totalRating": -2.019
        },
        "totalRating": -34.066,
        "winrate": 0.4511
    },

    "breakdown": {
        "allyChampions": {
            "totalRating": -32.698,
            "entries": [{
                "champions": [{ "key": "266", "id": "Aatrox", "name": "Aatrox",
                                "icon": "…/champion/Aatrox.png", "role": 0 }],
                "rating": -21.934,
                "winrateDelta": -0.0315,
                "wins": 846,
                "games": 1806
            }]
        },
        "enemyChampions": { "…": "same shape" },
        "allyDuos":   { "…": "entries[].champions has two entries" },
        "enemyDuos":  { "…": "same" },
        "matchups":   { "…": "champions[0] is the ally, champions[1] the enemy" }
    },

    "winrateByTime": [
        { "duration": 20, "winrate": 0.4686 },
        { "duration": 25, "winrate": 0.4676 },
        { "duration": 30, "winrate": 0.4665 },
        { "duration": 35, "winrate": 0.4654 },
        { "duration": 40, "winrate": 0.4643 }
    ],

    "damageDistribution": {
        "ally":     { "magic": 0.456, "physical": 1.352, "true": 0.191, "total": 2.0 },
        "opponent": { "magic": 0.677, "physical": 1.180, "true": 0.143, "total": 2.0 }
    }
}
```

Notes for the UI:

- `result.winrate` is the ally win probability, 0-1.
- `result` is the raw engine output (`DraftResult`); `breakdown` is the same
  numbers with champion names/icons resolved and each contribution converted to
  a win-probability delta (`ratingToWinrate(rating) - 0.5`) — that is what the
  contribution bars should render.
- `wins` can be fractional: the engine blends samples with a Bayesian prior.
- `winrateByTime` is always 5 buckets, 20 to 40 minutes.
- `damageDistribution` values are summed champion damage profiles; use the
  shares (`magic/total`, …), not the absolute numbers.

### `POST /api/draft/suggestions`

Extra body fields: `limit` (per role, 1-100, default 10) and `roles`
(restrict to these roles; default is **every open ally role**).

```json
{
    "dataset": { "…": "DatasetPairMeta" },
    "config": { "riskLevel": "medium", "minGames": 1000, "ignoreChampionWinrates": false },
    "state": { "ally": [[0, "266"]], "opponent": [], "bans": { "ally": [], "opponent": [] } },
    "baseline": { "totalRating": -21.934, "winrate": 0.4684 },
    "roles": [
        {
            "role": 1,
            "open": true,
            "suggestions": [{
                "key": "360", "id": "Samira", "name": "Samira",
                "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Samira.png",
                "role": 1,
                "rating": 6.197,
                "winrate": 0.5089,
                "winrateDelta": 0.0404,
                "games": 8612
            }]
        },
        { "role": 2, "open": true, "suggestions": ["…"] },
        { "role": 3, "open": true, "suggestions": ["…"] },
        { "role": 4, "open": true, "suggestions": ["…"] }
    ],
    "best": ["…up to `limit` suggestions across every open role, best first"]
}
```

- `winrate` is the ally win probability **if this champion is picked**;
  `winrateDelta` is that minus `baseline.winrate`.
- `games` is the champion's sample in that role, from the 30-day window.
- Champions already picked (either team) are never suggested; champions below
  `config.minGames` (scaled from 30 days to a 7-day patch, like DraftGap) are
  filtered out.

### `POST /api/draft/bans`

Extra body field: `limit` (1-200, default 20).

```json
{
    "dataset": { "…": "DatasetPairMeta" },
    "config": { "…": "resolved config" },
    "state": { "…": "SerializedDraftState" },
    "baseline": { "totalRating": -21.934, "winrate": 0.4684 },
    "bans": [{
        "key": "50", "id": "Swain", "name": "Swain",
        "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Swain.png",
        "role": 4,
        "rating": 28.868,
        "winrate": 0.4274,
        "winrateLoss": 0.0410,
        "games": 14451
    }]
}
```

Sorted most threatening first. `rating` is what the champion would add to the
**enemy** draft; `winrate` is the ally win probability if the enemy got it, and
`winrateLoss` is `baseline.winrate - winrate` (positive = banning it helps).
Champions already picked or already in `bans` are excluded.

---

## 7. Builds — `GET /api/builds/:championKey`

`:championKey` is the numeric key (`266`) or the Data Dragon id (`Aatrox`).

| Query | Meaning | Default |
| --- | --- | --- |
| `role` | `0`-`4` or a name (`top`, `mid`, `adc`, `UTILITY`…) | the champion's most-played role in the dataset |
| `vs` | comma-separated enemies, each `key` or `key:role` — e.g. `64:1,157:2` | none |
| `riskLevel`, `minGames`, `ignoreChampionWinrates` | override the analysis config | server settings |
| `rank`, `region`, `patch` | dataset selection | server settings |

```json
{
    "dataset": { "…": "DatasetPairMeta" },
    "champion": { "key": "266", "id": "Aatrox", "name": "Aatrox", "icon": "…/champion/Aatrox.png" },
    "role": 0,
    "config": { "riskLevel": "medium", "minGames": 1000, "ignoreChampionWinrates": false },
    "source": {
        "provider": "bundled-fixture",
        "description": "Deterministic offline build sample generated from the bundled Data Dragon snapshot",
        "offline": true,
        "games": 24000,
        "wins": 12013
    },
    "matchups": [{ "championKey": "64", "name": "Lee Sin", "role": 1 }],

    "items": {
        "boots": [{
            "id": 3009,
            "name": "Boots of Swiftness",
            "icon": "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/item/3009.png",
            "rating": 10.134,
            "winrate": 0.5009,
            "winrateDelta": 0.0145,
            "wins": 1571,
            "games": 3136,
            "matchups": [{ "championKey": "64", "name": "Lee Sin", "role": 1,
                           "rating": -2.239, "wins": 493.55, "games": 1000 }]
        }],
        "startingSets": [{
            "id": "1101_2003_2003",
            "name": "Scorchclaw Pup + Health Potion + Health Potion",
            "icon": "…/item/1101.png",
            "components": [
                { "id": 1101, "name": "Scorchclaw Pup", "icon": "…/item/1101.png" },
                { "id": 2003, "name": "Health Potion", "icon": "…/item/2003.png" }
            ],
            "rating": -4.256, "winrate": 0.4590, "winrateDelta": -0.0061,
            "wins": 1624, "games": 3538, "matchups": ["…"]
        }],
        "sets": ["…same shape as startingSets (full builds); may be empty"],
        "byOrder": [["…entries for the 1st item"], ["…2nd"], ["…3rd"], ["…4th"], ["…5th"]]
    },

    "runes": {
        "primary":   ["…entries, id = rune id"],
        "secondary": ["…"],
        "shards": {
            "offense": [{ "id": 5008, "name": "Adaptive Force",
                          "icon": "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png",
                          "rating": 7.679, "winrate": 0.4549, "winrateDelta": 0.0110,
                          "wins": 3410, "games": 7496, "matchups": ["…"] }],
            "flex":    ["…"],
            "defense": ["…"]
        }
    },

    "summonerSpells": [{
        "id": "14_4",
        "name": "Ignite + Flash",
        "icon": "…/spell/SummonerDot.png",
        "components": [
            { "id": 14, "name": "Ignite", "icon": "…/spell/SummonerDot.png" },
            { "id": 4,  "name": "Flash",  "icon": "…/spell/SummonerFlash.png" }
        ],
        "rating": 15.148, "winrate": 0.4760, "winrateDelta": 0.0217,
        "wins": 4344, "games": 9126, "matchups": ["…"]
    }],

    "skills": {
        "order": [{ "id": "WEQ", "name": "WEQ", "icon": null,
                    "rating": 7.901, "winrate": 0.5028, "winrateDelta": 0.0113,
                    "wins": 699, "games": 1390, "matchups": ["…"] }],
        "levels": [["…entries with id \"Q\"|\"W\"|\"E\"|\"R\" for level 1"], "…18 levels"]
    }
}
```

Every bucket is **sorted by `rating`, best first**. `winrate` is the raw
`wins / games` of that choice in the current patch sample; `winrateDelta` is
`ratingToWinrate(rating) - 0.5`, i.e. how much the choice is worth once the
champion's own strength and the matchups are accounted for. `matchups` is
populated only when `vs` was given.

`source.offline` is `true` whenever the build sample is the bundled fixture,
which is the case for every offline install — label it as demo data. Note that
`items.sets` may legitimately be empty in the fixture.

Errors: 404 `UNKNOWN_CHAMPION` for the path parameter, 400 `UNKNOWN_CHAMPION`
for a `vs` entry, 400 `VALIDATION_ERROR` for an unparsable `role`/`vs`.

---

## 8. Riot account — `/api/account/*`

**All of these return 428 `RIOT_KEY_MISSING` when no Riot API key is
configured.** That is the signal for the "connecter mon compte" flow — it is
expected, not an error to log loudly.

`platform` (or its alias `region`) accepts a Riot routing value (`euw1`, `na1`,
`kr`) or a region code (`EUW`, `NA`); it defaults to the configured platform.

### `GET /api/account/lookup?riotId=Nom%23TAG&platform=euw1`

```json
{ "puuid": "puuid-1", "gameName": "Faker", "tagLine": "KR1", "platform": "kr" }
```

400 `INVALID_RIOT_ID` when `riotId` is not `Name#TAG` (remember to URL-encode
the `#` as `%23`). 404 `NOT_FOUND` when Riot does not know the account.

### `GET /api/account/:puuid/profile?platform=`

Summoner, solo/flex ranks and top-10 mastery. Cached 1 minute per puuid.

```json
{
    "platform": "euw1",
    "account": { "puuid": "…", "gameName": "Moi", "tagLine": "EUW" },
    "summoner": { "puuid": "…", "profileIconId": 5123, "summonerLevel": 340, "revisionDate": 1787000000000 },
    "ranks": {
        "solo": { "queueType": "RANKED_SOLO_5x5", "tier": "EMERALD", "rank": "II",
                  "leaguePoints": 46, "wins": 132, "losses": 118, "hotStreak": false },
        "flex": { "…": "same shape, RANKED_FLEX_SR" },
        "entries": ["…every LeagueEntryDto Riot returned"]
    },
    "mastery": [{
        "puuid": "…", "championId": 266, "championLevel": 7, "championPoints": 214301,
        "lastPlayTime": 1786000000000,
        "champion": { "key": "266", "id": "Aatrox", "name": "Aatrox", "icon": "…/champion/Aatrox.png" }
    }]
}
```

`ranks.solo` / `ranks.flex` are absent when the player is unranked in that queue.

### `GET /api/account/:puuid/matches?count=20&platform=&refresh=`

`count` 1-100 (default 20). Cached 2 minutes per `(platform, puuid, count)`;
`refresh=1` forces a reload. Progress is broadcast as `job:progress` with
`job: "matches"` (§10).

```json
{
    "puuid": "…",
    "platform": "euw1",
    "count": 20,
    "matches": [{
        "matchId": "EUW1_7412345678",
        "queueId": 420, "queue": "Ranked Solo/Duo", "gameMode": "CLASSIC",
        "gameVersion": "16.17.601.1234", "mapId": 11,
        "gameCreation": 1786900000000, "gameStart": 1786900030000, "gameEnd": 1786901800000,
        "durationSeconds": 1770, "durationMinutes": 29.5, "remake": false,
        "championId": 266, "championKey": "266", "championName": "Aatrox", "champLevel": 16,
        "role": 0, "teamPosition": "TOP", "lane": "TOP", "teamId": 100, "side": "blue", "win": true,
        "kills": 8, "deaths": 3, "assists": 6, "kda": 4.67,
        "killParticipation": 0.48, "deathShare": 0.15,
        "cs": 214, "csPerMinute": 7.25, "gold": 13400, "goldPerMinute": 454, "goldShare": 0.23,
        "damage": { "…": "MatchDamageSummary" }, "damageShare": 0.29, "damageTakenShare": 0.24,
        "healingAndShielding": 1200,
        "vision": { "…": "MatchVisionSummary" },
        "objectives": { "…": "MatchObjectiveSummary" },
        "draft": { "ally": [[0, "266"]], "opponent": [[0, "122"]], "bans": { "ally": [], "opponent": [] } }
    }],
    "skipped": ["EUW1_7400000000"],
    "fetchedAt": 1787745643449
}
```

`matches[].draft` is a `SerializedDraftState`, so a finished game can be replayed
straight through `POST /api/draft/analyze`. `skipped` lists match ids Riot
returned but whose detail could not be fetched (404 or the player is absent).

### `GET /api/account/:puuid/playstyle?count=50&platform=&refresh=`

The expensive one: it reads `count` matches (default 50, max 100) one by one
through the rate limiter. Cached **15 minutes** per `(platform, puuid, count)`;
`refresh=1` recomputes. Progress is broadcast as `job:progress` with
`job: "playstyle"` — stages `match-ids`, `matches`, then `profiling`.

```json
{
    "puuid": "…",
    "platform": "euw1",
    "sampleSize": 47,
    "cached": false,
    "fetchedAt": 1787745643449,
    "profile": {
        "axes": { "aggression": 71, "farming": 58, "vision": 34, "objectives": 62,
                  "survivability": 45, "teamplay": 55, "consistency": 61, "scaling": 49 },
        "archetype": { "…": "PlaystyleArchetype: key, name, description" },
        "strengths": ["…PlaystyleTrait[]"],
        "weaknesses": ["…PlaystyleTrait[]"],
        "championPool": ["…ChampionPoolEntry[]"],
        "roleDistribution": ["…RoleDistributionEntry[]"],
        "breakdown": { "…": "per-role and per-champion detail" },
        "totals": { "…": "PlaystyleTotals" },
        "form": { "…": "PlaystyleForm" }
    }
}
```

Axes are normalised 0-100. The exact `PlaystyleProfile` shape is defined by
`@draftpredict/riot` (`PlaystyleProfile`) and is re-exported verbatim.

### `GET /api/account/:puuid/live?platform=`

```json
{
    "puuid": "…",
    "platform": "euw1",
    "inGame": true,
    "game": { "gameId": 7412345678, "gameMode": "CLASSIC", "gameLength": 640,
              "participants": ["…SpectatorParticipant[]"], "bannedChampions": ["…"] },
    "draft": { "ally": [[0, "266"]], "opponent": [[0, "122"]], "bans": { "ally": [], "opponent": [] } },
    "dataset": { "…": "DatasetPairMeta" },
    "analysis": { "…": "the same payload as POST /api/draft/analyze" }
}
```

When the player is not in a game the route still answers 200:

```json
{ "puuid": "…", "platform": "euw1", "inGame": false, "game": null, "draft": null,
  "analysis": null, "dataset": { "…": "DatasetPairMeta" } }
```

Roles in `draft` are inferred with `predictRoles` from the dataset, since
spectator data does not carry positions.

---

## 9. League Client — `/api/lcu/*`

These need no Riot API key: the LCU is a local, loopback-only API exposed by the
running game client.

### `GET /api/lcu/status`

```json
{
    "enabled": true,
    "running": true,
    "connected": true,
    "polling": false,
    "phase": "ChampSelect",
    "inChampSelect": true,
    "summoner": { "puuid": "…", "gameName": "Moi", "tagLine": "EUW",
                  "displayName": "Moi", "summonerLevel": 340, "profileIconId": 5123 },
    "lastError": null,
    "updatedAt": 1787745588839
}
```

- `enabled` — the integration is switched on (`lcuEnabled`) and a watcher exists.
- `running` — the watcher is looking for or following a client.
- `connected` — a client is answering right now.
- `polling` — `true` when the LCU WebSocket could not be opened and the watcher
  fell back to polling (slower, still correct).
- `lastError` — the last non-fatal failure, redacted. An LCU problem never takes
  the server down.

### `GET /api/lcu/summoner`

The logged-in summoner (`LcuSummoner`), or 404 `LCU_NO_SUMMONER`.

### `GET /api/lcu/champ-select`

The current champion select, already analysed — for clients that connect after
it started. Identical content to the `champselect:update` WebSocket message.

```json
{
    "inChampSelect": true,
    "status": { "…": "the /api/lcu/status payload" },
    "state": {
        "phase": "BAN_PICK",
        "timerMs": 27000,
        "localPlayer": { "cellId": 2, "puuid": "…", "assignedRole": 2,
                         "championKey": "157", "hoveredChampionKey": null,
                         "pickActionId": 7, "banActionId": null },
        "ally": [[0, "266"], [1, "64"]],
        "opponent": [[0, "122"]],
        "allyHovers": [[2, "157"]],
        "opponentHovers": [],
        "bans": { "ally": ["1"], "opponent": ["2"] },
        "pickOrder": [0, 5, 1, 6],
        "currentActorCellId": 2,
        "isLocalPlayerTurn": true,
        "benchChampionKeys": [],
        "isCustom": false,
        "isSpectating": false,
        "allyPlayers": ["…ChampSelectPlayerState[]"],
        "opponentPlayers": ["…"]
    },
    "analysis": { "…": "POST /api/draft/analyze payload" },
    "suggestions": { "…": "POST /api/draft/suggestions payload, 8 per open role" },
    "updatedAt": 1787745643449
}
```

Outside champion select:

```json
{ "inChampSelect": false, "status": { "…": "…" }, "state": null, "analysis": null, "suggestions": null }
```

`ally`/`opponent`/`allyHovers`/`opponentHovers` are `[role, championKey][]` — the
`Map`s of `@draftpredict/lcu` serialized. The analysis merges hovers into empty
slots, so the win probability reacts while a teammate is still hovering.

---

## 10. WebSocket — `GET /ws`

One socket carries everything live. Text frames, JSON, `{"type": "..."}` on
both directions.

### Connect

On connect the server sends `hello`, then replays the last known
`lcu:status`, `champselect:update`, `config:update` and `dataset:update` — so a
page reload during champion select repaints immediately.

```json
{ "type": "hello", "clientId": "3f2b…", "topics": ["lcu","champselect","draft","config","dataset","jobs"],
  "heartbeatMs": 30000, "staticDataVersion": "16.17.1" }
```

Clients start subscribed to every topic. The server pings every `heartbeatMs`
and terminates sockets that never pong.

### Server → client

| Message | Topic | When |
| --- | --- | --- |
| `hello` | — | on connect |
| `lcu:status` | `lcu` | the League Client connected, disconnected, changed phase, or errored |
| `champselect:update` | `champselect` | a new champ-select state was analysed (debounced) |
| `champselect:end` | `champselect` | champion select ended |
| `draft:analysis` | `draft` | answer to a `draft:set` |
| `config:update` | `config` | settings changed |
| `dataset:update` | `dataset` | a dataset was refreshed |
| `job:progress` | `jobs` | progress of a long Riot job |
| `pong` | `draft` | answer to `ping` |
| `error` | `draft` | a client message was rejected |

```json
{ "type": "lcu:status", "status": { "…": "GET /api/lcu/status payload" } }
```

```json
{
    "type": "champselect:update",
    "state": { "…": "serialized champ-select state (§9)" },
    "analysis": { "…": "POST /api/draft/analyze payload" },
    "suggestions": { "…": "POST /api/draft/suggestions payload" }
}
```

```json
{ "type": "champselect:end" }
```

```json
{ "type": "config:update", "config": { "…": "GET /api/config .config, key still redacted" } }
```

```json
{ "type": "dataset:update", "dataset": { "…": "DatasetPairMeta" } }
```

```json
{ "type": "job:progress", "job": "playstyle", "key": "<puuid>",
  "stage": "matches", "loaded": 23, "total": 50 }
```

```json
{ "type": "error", "requestId": "req-1", "error": { "code": "UNKNOWN_CHAMPION", "message": "…" } }
```

An `error` frame never closes the socket.

### Client → server

```json
{ "type": "ping" }
```

```json
{ "type": "subscribe",   "topics": ["champselect", "lcu"] }
{ "type": "unsubscribe", "topics": ["jobs"] }
```

Valid topics: `lcu`, `champselect`, `draft`, `config`, `dataset`, `jobs`.
Unknown names are ignored; omitting `topics` means "all of them".

```json
{
    "type": "draft:set",
    "requestId": "req-1",
    "team": [[0, "266"]],
    "enemy": [[0, "122"]],
    "bans": { "ally": [], "opponent": [] },
    "config": { "riskLevel": "medium", "minGames": 1000, "ignoreChampionWinrates": false },
    "suggestions": true,
    "limit": 8
}
```

The server answers **on the same socket**, to that client only:

```json
{
    "type": "draft:analysis",
    "requestId": "req-1",
    "analysis": { "…": "POST /api/draft/analyze payload" },
    "suggestions": { "…": "POST /api/draft/suggestions payload, or null" }
}
```

`suggestions: false` skips the (much more expensive) suggestion sweep and
returns `"suggestions": null`. `requestId` is echoed back — including on
`error` — so a client can match answers to requests; it is `null` when omitted.

---

## 11. Static file serving

When `apps/web/dist` exists (or `DRAFTPREDICT_WEB_ROOT` points at a build), the
server also serves it at `/`, and any unknown non-`/api`, non-`/ws` `GET` falls
back to `index.html` so client-side routes work on a hard refresh. Unknown
`/api/*` routes always return the JSON 404 envelope.
