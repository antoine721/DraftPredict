import type { MatchDto, MatchTimelineDto, RiotApiClient } from "@draftpredict/riot";
import { buildUrl, encodeSegment, platformBaseUrl, regionalBaseUrl } from "@draftpredict/riot";

import type { PipelineLogger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import type { ApexQueue, ApexTier, CollectSource, MatchIdQuery } from "./types.js";

/** league-v4 `LeagueItemDTO` — `puuid` replaced `summonerId` in 2025. */
export type LeagueItemDto = {
    puuid?: string;
    summonerId?: string;
    leaguePoints?: number;
    wins?: number;
    losses?: number;
    rank?: string;
};

/** league-v4 `LeagueListDTO`. */
export type LeagueListDto = {
    tier?: string;
    queue?: string;
    leagueId?: string;
    entries: LeagueItemDto[];
};

const APEX_PATHS: Record<ApexTier, string> = {
    challenger: "/lol/league/v4/challengerleagues/by-queue",
    grandmaster: "/lol/league/v4/grandmasterleagues/by-queue",
    master: "/lol/league/v4/masterleagues/by-queue",
};

/**
 * The apex-league endpoints are not part of `RiotApiClient`'s typed surface
 * (nothing in the app needs a ladder, only the pipeline does), so they are
 * issued through the client's own HTTP layer. That keeps the shared rate
 * limiter, retries, backoff and key redaction — only the typed wrapper is
 * missing. See docs/DATASET.md: adding `client.league.apexByQueue()` to
 * `@draftpredict/riot` would let this drop the cast.
 */
const APEX_METHOD = "league-v4.apexByQueue" as unknown as Parameters<
    RiotApiClient["http"]["request"]
>[0]["method"];

export async function fetchApexPuuids(
    client: RiotApiClient,
    tier: ApexTier,
    queue: ApexQueue,
    logger: PipelineLogger = silentLogger,
): Promise<string[]> {
    const url = buildUrl(
        platformBaseUrl(client.platform),
        `${APEX_PATHS[tier]}/${queue}`,
    );
    const league = await client.http.request<LeagueListDto>({
        method: APEX_METHOD,
        url,
        ttlMs: 5 * 60_000,
    });

    const puuids: string[] = [];
    let missing = 0;
    for (const entry of league?.entries ?? []) {
        if (entry.puuid) puuids.push(entry.puuid);
        else missing += 1;
    }
    if (missing > 0) {
        logger.warn(
            `${tier} ${queue}: ${missing} ladder entries carried no puuid and were skipped`,
        );
    }
    logger.info(`${tier} ${queue}: ${puuids.length} players`);
    return puuids;
}

export type RiotCollectSourceOptions = {
    logger?: PipelineLogger;
    /** Count requests, so the caller can report them. */
    onRequest?: (method: string) => void;
};

/** Binds a {@link CollectSource} to a real Riot API client. */
export function riotCollectSource(
    client: RiotApiClient,
    options: RiotCollectSourceOptions = {},
): CollectSource {
    const logger = options.logger ?? silentLogger;
    const count = (method: string): void => options.onRequest?.(method);

    return {
        async matchIds(puuid: string, query: MatchIdQuery): Promise<string[]> {
            count("match-v5.idsByPuuid");
            return client.match.idsByPuuid(puuid, query);
        },

        async match(matchId: string): Promise<MatchDto | null> {
            count("match-v5.byId");
            return client.http.requestOrNull<MatchDto>({
                method: "match-v5.byId",
                url: matchUrl(client, matchId),
            });
        },

        async timeline(matchId: string): Promise<MatchTimelineDto | null> {
            count("match-v5.timelineById");
            return client.http.requestOrNull<MatchTimelineDto>({
                method: "match-v5.timelineById",
                url: `${matchUrl(client, matchId)}/timeline`,
            });
        },

        async apexPuuids(tier: ApexTier, queue: ApexQueue): Promise<string[]> {
            count("league-v4.apexByQueue");
            return fetchApexPuuids(client, tier, queue, logger);
        },

        async puuidByRiotId(gameName: string, tagLine: string): Promise<string> {
            count("account-v1.byRiotId");
            const account = await client.account.byRiotId(gameName, tagLine);
            return account.puuid;
        },
    };
}

function matchUrl(client: RiotApiClient, matchId: string): string {
    return buildUrl(
        regionalBaseUrl(client.regional),
        `/lol/match/v5/matches/${encodeSegment(matchId)}`,
    );
}
