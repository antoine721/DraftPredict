/**
 * Queue id -> display name. Only the queues a DraftPredict user can plausibly
 * play are listed; anything else falls back to `Queue <id>`.
 */
export const queueNameById: Record<number, string> = {
    0: "Custom",
    400: "Normal Draft",
    420: "Ranked Solo/Duo",
    430: "Normal Blind",
    440: "Ranked Flex",
    450: "ARAM",
    480: "Swiftplay",
    490: "Quickplay",
    700: "Clash",
    720: "ARAM Clash",
    820: "Co-op vs AI (Beginner)",
    830: "Co-op vs AI (Intro)",
    840: "Co-op vs AI (Beginner)",
    850: "Co-op vs AI (Intermediate)",
    900: "ARURF",
    1020: "One for All",
    1090: "Teamfight Tactics",
    1100: "Ranked Teamfight Tactics",
    1300: "Nexus Blitz",
    1400: "Ultimate Spellbook",
    1700: "Arena",
    1710: "Arena",
    1900: "URF",
};

export function getQueueName(queueId: number): string {
    return queueNameById[queueId] ?? `Queue ${queueId}`;
}

/** Queues played on Summoner's Rift with a real 5v5 draft. */
export const SUMMONERS_RIFT_QUEUE_IDS: readonly number[] = [
    400, 420, 430, 440, 480, 490, 700, 1300, 1400,
];

export const RANKED_QUEUE_IDS: readonly number[] = [420, 440];

export function isRankedQueue(queueId: number): boolean {
    return RANKED_QUEUE_IDS.includes(queueId);
}

/**
 * True for queues whose draft can be replayed through the prediction engine
 * (5v5 Summoner's Rift with roles).
 */
export function isDraftQueue(queueId: number): boolean {
    return SUMMONERS_RIFT_QUEUE_IDS.includes(queueId);
}
