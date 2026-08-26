# Datasets — collecting, building, verifying

DraftPredict's prediction engine reads a **DraftGap dataset v5** payload: per
champion, per role, how often it was played, how often it won, against whom and
alongside whom. Public datasets exist (DraftGap publishes theirs), but an app
that can only run on somebody else's bucket is one S3 bill away from being
dead. `apps/pipeline` builds the same thing from raw Riot match data.

```
Riot match-v5 ──collect──▶ JSONL shards ──build──▶ dataset.json.gz ──verify──▶ ✅
                                              └──▶ builds.json.gz
                            (offline)  fixture ──▶ dataset.json.gz
```

Everything after `collect` is offline: `build`, `verify` and `fixture` never
touch the network, which is also why the whole pipeline is testable in a
container with `api.riotgames.com`, `ddragon.leagueoflegends.com` and
`bucket.draftgap.com` blocked.

## TL;DR

```bash
# 0. No Riot key? Generate the deterministic offline dataset and stop here.
npm start -w @draftpredict/pipeline -- fixture --out ~/.draftpredict/datasets

# 1. Collect raw matches (resumable — re-run the same command to continue).
export RIOT_API_KEY=RGAPI-…
npm start -w @draftpredict/pipeline -- collect \
    --out ./data/euw-2026-08 \
    --region euw1 \
    --seed-apex challenger,grandmaster \
    --queue 420,440 \
    --since 2026-08-01 \
    --timelines

# 2. Aggregate the shards into a dataset (streams; RAM stays flat).
npm start -w @draftpredict/pipeline -- build \
    --shards ./data/euw-2026-08 \
    --out ~/.draftpredict/datasets \
    --window full --patch 16.17 \
    --rank DIAMOND_PLUS --region EUW \
    --min-games 20

# 3. Check it before anything trusts it. Non-zero exit means "do not ship".
npm start -w @draftpredict/pipeline -- verify \
    ~/.draftpredict/datasets/full/16.17/EUW/DIAMOND_PLUS.json.gz
```

All three forms work, from the repo root:

```bash
npm start -w @draftpredict/pipeline -- <args>   # tsx, no build step needed
npx tsx apps/pipeline/src/main.ts <args>        # the same thing, shorter
node apps/pipeline/dist/main.js <args>          # after `npm run build`
```

The workspace also has per-command shortcuts — `npm run collect -w
@draftpredict/pipeline -- --out …`, plus `dataset`, `verify` and `fixture`.
(`npm run pipeline` at the repo root starts the CLI but does not forward
arguments to it.)

## The API key

The key is read from **`RIOT_API_KEY` only** — there is deliberately no
`--api-key` flag, because command lines land in shell history, `ps` output and
CI logs. It is sent as `X-Riot-Token`, never as a query parameter, and both the
Riot client and the pipeline logger redact anything that looks like a key
(`RGAPI-…`) before it reaches a log line.

## 1. `collect`

Seeds a frontier of players, walks their match histories, and appends every new
match to a newline-delimited JSON shard.

| Flag | Meaning |
| --- | --- |
| `--out <dir>` | Run directory: `shards/`, `state.json`, `seen-matches.txt` |
| `--region <platform>` | `euw1`, `na1`, `kr`, … (platform routing value) |
| `--seed-apex <tiers>` | `challenger,grandmaster,master` — league-v4 ladders |
| `--apex-queue <q>` | `RANKED_SOLO_5x5` (default) or `RANKED_FLEX_SR` |
| `--seed-summoner "Name#TAG"` | Riot ID seed (repeatable) |
| `--seed-puuid <puuid>` | PUUID seed (repeatable) |
| `--queue <ids>` | Default `420,440` (solo queue, flex) |
| `--since` / `--until` | `YYYY-MM-DD`, an ISO timestamp or an epoch |
| `--max-matches <n>` | Stop after n matches **in this run** |
| `--max-per-player <n>` | Match ids per player and queue (default 100) |
| `--no-expand` | Do not queue the players of collected matches |
| `--timelines` | Also fetch timelines — doubles the request cost |
| `--shard-size <n>` / `--no-gzip` | Shard rotation and compression |
| `--fresh` | Ignore an existing state file and start over |

**How the frontier grows.** Each collected match contributes its ten
participants to the queue, so a couple of hundred apex accounts snowball into a
region-wide sample within a few hours. `--no-expand` restricts a run to the
seeds themselves (useful for "collect my own games").

**What is written.** One JSON object per line:

```json
{"match": { …match-v5 MatchDto… }, "timeline": { … }, "collectedAt": "2026-08-26T…", "platform": "EUW1"}
```

The raw payload is kept on purpose: aggregation rules change (a new build
bucket, a different time bucketing) far more often than the data does, and
re-aggregating a shard directory costs minutes while re-collecting it costs
days.

**Matches are filtered on the way in** — only the requested queues, only
Summoner's Rift, ten participants, at least five minutes, no early surrender.

### Resumability

Interrupting a run (`Ctrl-C`, a crash, a full disk, a dead laptop) is expected,
not exceptional:

- **`seen-matches.txt`** is an append-only list of every match id the run has
  dealt with. It is written *before* the match is fetched, so a duplicate can
  never be written twice, and reloading it rebuilds the set exactly.
- **`state.json`** holds the player queue, the per-player cursor (which queue,
  which `start` offset) and the shard position. It is rewritten atomically
  every 25 matches and again on shutdown.
- **Shards are appended to**, never rewritten. A truncated last line costs one
  match; the reader skips it and says so.

Re-running the exact same command resumes. Changing the platform, the queue
list or the date range starts a fresh run instead (the pipeline says why),
because mixing two samples into one shard directory would silently corrupt the
resulting dataset.

`Ctrl-C` once asks the run to stop at the next match and save; twice quits
immediately.

## 2. `build`

Streams the shards into a dataset. Nothing but the growing dataset is held in
memory — shards are read line by line, and each match is reduced to a compact
record and dropped again, so a 100 GB shard directory builds in a process whose
peak RSS is the size of the output.

| Flag | Meaning |
| --- | --- |
| `--shards <dir>` | A shard directory, or a collect run directory |
| `--out <dir>` | Dataset root (see the layout below) |
| `--out-file <path>` | Write exactly this file instead |
| `--window patch\|full` | `patch` filters to `--patch`; `full` keeps everything |
| `--patch 16.17` | Patch label; **required** for `--window patch` |
| `--rank` / `--region` | Labels used in the output path and the meta sidecar |
| `--min-games <n>` | Prune matchup/synergy entries below n games |
| `--min-build-games <n>` | Prune build entries below n games |
| `--remove-rank-bias` | Shift winrates so the average champion sits at 50% |
| `--no-builds` | Skip the item/rune/spell/skill dataset |
| `--no-verify` | Do not verify before writing (verification is on by default) |
| `--no-gzip` / `--pretty` | For eyeballing a small dataset |

Output layout — exactly what `LocalFileProvider` in `@draftpredict/data` reads:

```
<out>/<window>/<patch>/<region>/<RANK>.json.gz         the dataset
<out>/<window>/<patch>/<region>/<RANK>.meta.json       provenance sidecar
<out>/<window>/<patch>/<region>/<RANK>.builds.json.gz  the build dataset
```

Point the server at `<out>` and it serves them:

```ts
new LocalFileProvider({ root: "~/.draftpredict/datasets" });
```

The engine wants **two** datasets: the current patch (`--window patch`) for
champion winrates and the 30-day window (`--window full`) for the much larger
matchup/synergy samples. Build both from the same shards:

```bash
npm start -w @draftpredict/pipeline -- build --shards ./data/euw-2026-08 --out ./ds \
    --window full  --patch 16.17 --rank DIAMOND_PLUS --region EUW --min-games 20
npm start -w @draftpredict/pipeline -- build --shards ./data/euw-2026-08 --out ./ds \
    --window patch --patch 16.17 --rank DIAMOND_PLUS --region EUW
```

### What one match contributes

| Bucket | Per match | Notes |
| --- | --- | --- |
| champion/role `games`,`wins` | 10 | roles resolved from `teamPosition`, then `individualPosition`, then `lane`+`role`, then positionally |
| `matchup[enemyRole][enemyKey]` | 50 | every ally against every enemy, recorded from **both** sides — `analyzeMatchups` averages the two directions |
| `synergy[otherRole][otherKey]` | 40 | every ordered pair of team mates, on both teams |
| `statsByTime[bucket]` | 10 | seven 5-minute buckets from 20 minutes; shorter games are not bucketed |
| `damageProfile` | 10 | magic/physical/true damage to champions, normalised per champion to fractions summing to 1 |
| build data | 10 | runes, summoner spells, boots, full item set (+ item order, starting set and skill order when a timeline was collected) |

Every champion in the bundled Data Dragon snapshot gets an entry, even one
nobody played: `analyzeChampion` indexes `championData[key].statsByRole[role]`
without a guard, so a missing champion is a crash rather than a gap.

### Builds and timelines

Rune pages, summoner spells, boots and the finished item set come from the
match itself. The **item order**, the **starting set** and the **skill order**
only exist in the match timeline, so they are filled in only for matches
collected with `--timelines`; without it those buckets stay empty and
`analyzeBuild` simply has less to say. Timelines double both the request cost
and the shard size — collect them for one rank/region rather than everywhere.

## 3. `verify`

```bash
npm start -w @draftpredict/pipeline -- verify ./ds/full/16.17/EUW/DIAMOND_PLUS.json.gz --strict
```

A dataset is the one artefact the whole app trusts blindly, and a single `NaN`
propagates into every winrate on screen. `verify` walks the payload in full and
checks:

- **structure** — every champion has five roles with numeric `wins`/`games`;
- **finite-numbers** — no `NaN`, no `Infinity`, anywhere;
- **stat-bounds** — `0 ≤ wins ≤ games`, leaves included;
- **stats-by-time** — seven buckets, and they never total more games than the role;
- **matchup-/synergy-symmetry** — the two directions of a pair agree (a small
  rounding drift is reported as a separate warning: datasets scraped per
  champion, and the synthetic fixture, are routinely off by one);
- **plausible-winrates** and **global-winrate** — the average champion sits at 50%;
- **champion-coverage** — nothing the engine could be asked about is missing;
- **catalogues** — items, runes and summoner spells are present;
- **json-round-trip** — the payload survives a trip through a file unchanged.

Exit code `0` means every check passed, `1` means at least one failed (or, with
`--strict`, warned). `build` runs the same checks before writing, so a bad
dataset never reaches the output path in the first place.

## 4. `fixture`

```bash
npm start -w @draftpredict/pipeline -- fixture --out ~/.draftpredict/datasets --builds
```

Regenerates the deterministic offline dataset from `@draftpredict/data`: a
complete, realistic-looking sample over the real champion list, built from the
bundled Data Dragon snapshot with no network at all. Same seed, same bytes.
This is what makes the app usable with no API key, in CI, and in the dev
container. It is emphatically **not** real data.

## Rate limits: how long a real dataset actually takes

Collection is entirely bounded by the Riot API budget, which is per **key**,
not per region. The pipeline goes through `@draftpredict/riot`'s token-bucket
limiter, so it self-paces and honours `Retry-After` — you cannot make this
faster by running two processes, you can only get 429s.

| Key | Limits | Requests/day | Matches/day (no timelines) |
| --- | --- | --- | --- |
| Personal / development | 20 req/s **and** 100 req/2 min | ~72,000 | ~65,000 |
| Production (approved app) | typically 500 req/10 s and 30,000 req/10 min | ~4,300,000 | ~4,000,000 |

The 2-minute bucket is what binds a personal key: 100 requests per 2 minutes is
**50 requests per minute**, no matter how fast the burst limit lets you go.

Roughly one request per match (plus one per 100 match ids per player, plus one
more per match with `--timelines`). So:

- **Personal key** — about 65k matches a day. A dataset with usable *champion*
  winrates (≥1,000 games for a popular champion in its main role) is one to two
  days. Usable *matchup* numbers are the expensive part: 170 champions × 5 roles
  means a specific lane matchup only shows up in a small fraction of games, so a
  few hundred games per common matchup needs **on the order of a million
  matches — one to two weeks of continuous collection**. Leave it running; that
  is exactly what the resumable state file is for.
- **Production key** — the same million matches in **four to six hours**, and a
  daily rebuild is comfortable.
- **Both** — collect once, aggregate many times. Re-running `build` over an
  existing shard directory costs minutes.

Practical advice for a personal key: seed from apex ladders (their histories are
dense and recent), keep `--max-per-player 100`, skip `--timelines` for the first
pass, and use `--min-games 20` at build time so the long tail of one-off
matchups does not bloat the payload.

## Using the pipeline from the server

The CLI is a thin wrapper; every stage is an ordinary function, so a rebuild can
run in-process (a settings toggle, a cron job inside the app) without shelling
out:

```ts
import {
    buildDatasetFromShards,
    collectMatches,
    riotCollectSource,
    verifyDataset,
    writeDatasetOutput,
} from "@draftpredict/pipeline";

const result = await buildDatasetFromShards({ shardDir, staticData, minGames: 20 });
const report = verifyDataset(result.dataset, { expectedChampionKeys });
if (report.ok) {
    await writeDatasetOutput({ ...result, root, window: "full", patch, rank, region });
}
```

`collectMatches` takes a `CollectSource` — the Riot-backed one comes from
`riotCollectSource(client)`, and tests pass a fake, which is how the collector
is covered end to end without a network.

## Files a run leaves behind

```
data/euw-2026-08/
  shards/matches-000000.jsonl.gz   raw matches, ~1–2 KB/match compressed
  seen-matches.txt                 append-only id set (~15 bytes/match)
  state.json                       player queue, cursor, shard position, counters
```

Shards are the expensive artefact; keep them. The dataset can always be rebuilt
from them, and a changed aggregation rule then costs a `build`, not a week.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `no players to walk` | No seeds — pass `--seed-apex`, `--seed-summoner` or `--seed-puuid` |
| `starting a fresh run: state file was written for different parameters` | The platform, queues or date range changed; use a new `--out` directory |
| `no usable matches in …` | Shards hold a different queue than `--queue`, or `--window patch` filtered everything (check `--patch`) |
| `champion-coverage: N champions are missing` | The dataset was built without static data — the engine will throw on those champions |
| Ladder entries skipped for having no `puuid` | league-v4 replaced `summonerId` with `puuid`; very old cached responses have neither |
| `--seed-apex` ignored | The source has no ladder access (a fake source in tests) |

## Note for `@draftpredict/riot`

Apex-ladder reads (`/lol/league/v4/{challenger,grandmaster,master}leagues/by-queue/…`)
are issued through `client.http`, since `RiotApiClient.league` has no typed
wrapper for them — nothing but the pipeline needs a ladder. They still go
through the shared rate limiter, retries and redaction. Adding
`client.league.apexByQueue(tier, queue)` (plus its `RiotMethod` entry and cache
TTL) would let `apps/pipeline/src/collect/sources.ts` drop one cast.
