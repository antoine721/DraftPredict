import type { Region } from "@draftpredict/core";

/**
 * Riot "platform" routing values (the shard a summoner account lives on).
 * These are the values used as the host prefix of `<platform>.api.riotgames.com`.
 */
export const PLATFORM_IDS = [
    "br1",
    "eun1",
    "euw1",
    "jp1",
    "kr",
    "la1",
    "la2",
    "na1",
    "oc1",
    "ru",
    "tr1",
    "ph2",
    "sg2",
    "th2",
    "tw2",
    "vn2",
    "me1",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

/**
 * Riot "regional" routing values. Used by account-v1 and match-v5, which are
 * served per continent rather than per shard.
 */
export const REGIONAL_ROUTES = ["americas", "europe", "asia", "sea"] as const;

export type RegionalRoute = (typeof REGIONAL_ROUTES)[number];

/** Maps every platform to the regional route that serves its match history. */
export const platformToRegional: Record<PlatformId, RegionalRoute> = {
    br1: "americas",
    la1: "americas",
    la2: "americas",
    na1: "americas",
    eun1: "europe",
    euw1: "europe",
    me1: "europe",
    ru: "europe",
    tr1: "europe",
    jp1: "asia",
    kr: "asia",
    oc1: "sea",
    ph2: "sea",
    sg2: "sea",
    th2: "sea",
    tw2: "sea",
    vn2: "sea",
};

export type PlatformInfo = {
    /** Routing value, e.g. `euw1`. */
    id: PlatformId;
    /** Short code shown in the UI and used by the dataset `Region` union. */
    code: Region;
    /** Human readable name for a dropdown. */
    name: string;
    /** Regional route serving account-v1 / match-v5 for this platform. */
    regional: RegionalRoute;
};

/**
 * Every platform with a display name, in the order a UI dropdown should list
 * them. `code` is the `Region` value used by `@draftpredict/core` datasets.
 */
export const PLATFORMS: readonly PlatformInfo[] = [
    { id: "euw1", code: "EUW", name: "EU West", regional: "europe" },
    { id: "eun1", code: "EUNE", name: "EU Nordic & East", regional: "europe" },
    { id: "na1", code: "NA", name: "North America", regional: "americas" },
    { id: "kr", code: "KR", name: "Korea", regional: "asia" },
    { id: "br1", code: "BR", name: "Brazil", regional: "americas" },
    { id: "jp1", code: "JP", name: "Japan", regional: "asia" },
    { id: "la1", code: "LAN", name: "Latin America North", regional: "americas" },
    { id: "la2", code: "LAS", name: "Latin America South", regional: "americas" },
    { id: "oc1", code: "OCE", name: "Oceania", regional: "sea" },
    { id: "ru", code: "RU", name: "Russia", regional: "europe" },
    { id: "tr1", code: "TR", name: "Türkiye", regional: "europe" },
    { id: "ph2", code: "PH", name: "Philippines", regional: "sea" },
    { id: "sg2", code: "SG", name: "Singapore", regional: "sea" },
    { id: "th2", code: "TH", name: "Thailand", regional: "sea" },
    { id: "tw2", code: "TW", name: "Taiwan", regional: "sea" },
    { id: "vn2", code: "VN", name: "Vietnam", regional: "sea" },
    { id: "me1", code: "ME", name: "Middle East", regional: "europe" },
];

const platformById = new Map<PlatformId, PlatformInfo>(
    PLATFORMS.map((platform) => [platform.id, platform]),
);

const platformByCode = new Map<string, PlatformInfo>(
    PLATFORMS.map((platform) => [platform.code, platform]),
);

export function isPlatformId(value: unknown): value is PlatformId {
    return (
        typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value)
    );
}

export function isRegionalRoute(value: unknown): value is RegionalRoute {
    return (
        typeof value === "string" &&
        (REGIONAL_ROUTES as readonly string[]).includes(value)
    );
}

/**
 * Accepts a platform routing value (`euw1`, `EUW1`) or a dataset region code
 * (`EUW`, `euw`) and returns the platform id, or `undefined` when unknown.
 */
export function parsePlatform(value: string): PlatformId | undefined {
    const normalized = value.trim().toLowerCase();
    if (isPlatformId(normalized)) return normalized;
    return platformByCode.get(normalized.toUpperCase())?.id;
}

export function getPlatformInfo(platform: PlatformId): PlatformInfo {
    const info = platformById.get(platform);
    if (!info) throw new Error(`Unknown platform: ${platform}`);
    return info;
}

/** The dataset `Region` code matching a platform (`euw1` -> `EUW`). */
export function regionForPlatform(platform: PlatformId): Region {
    return getPlatformInfo(platform).code;
}

/** The platform serving a dataset `Region` code (`EUW` -> `euw1`). */
export function platformForRegion(region: Region): PlatformId | undefined {
    return platformByCode.get(region)?.id;
}

export function regionalForPlatform(platform: PlatformId): RegionalRoute {
    return platformToRegional[platform];
}

export function platformHost(platform: PlatformId): string {
    return `${platform}.api.riotgames.com`;
}

export function regionalHost(route: RegionalRoute): string {
    return `${route}.api.riotgames.com`;
}

export function platformBaseUrl(platform: PlatformId): string {
    return `https://${platformHost(platform)}`;
}

export function regionalBaseUrl(route: RegionalRoute): string {
    return `https://${regionalHost(route)}`;
}
