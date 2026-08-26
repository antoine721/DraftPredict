/** account-v1 — `AccountDto`. */
export type RiotAccountDto = {
    puuid: string;
    /** Absent when the account has no Riot ID on this game shard. */
    gameName?: string;
    tagLine?: string;
};
