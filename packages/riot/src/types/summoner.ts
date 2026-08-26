/**
 * summoner-v4 — `SummonerDTO`.
 *
 * `id`, `accountId` and `name` were removed from the public payload in 2024;
 * they stay optional so older cached payloads still type-check.
 */
export type SummonerDto = {
    puuid: string;
    profileIconId: number;
    revisionDate: number;
    summonerLevel: number;
    id?: string;
    accountId?: string;
    name?: string;
};
