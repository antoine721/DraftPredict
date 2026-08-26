export const REGIONS = [
    "ALL",
    "BR",
    "EUNE",
    "EUW",
    "JP",
    "KR",
    "LAN",
    "LAS",
    "NA",
    "OCE",
    "RU",
    "TR",
    "PH",
    "SG",
    "TH",
    "TW",
    "VN",
    "ME",
] as const;

export type Region = (typeof REGIONS)[number];

export const displayNameByRegion: Record<Region, string> = {
    ALL: "All regions",
    BR: "Brazil",
    EUNE: "EU Nordic & East",
    EUW: "EU West",
    JP: "Japan",
    KR: "Korea",
    LAN: "Latin America North",
    LAS: "Latin America South",
    NA: "North America",
    OCE: "Oceania",
    RU: "Russia",
    TR: "Türkiye",
    PH: "Philippines",
    SG: "Singapore",
    TH: "Thailand",
    TW: "Taiwan",
    VN: "Vietnam",
    ME: "Middle East",
};

/** Regions in the order they should be listed in a UI. */
export const REGIONS_IN_DISPLAY_ORDER: readonly Region[] = REGIONS;

export const DEFAULT_REGION: Region = "ALL";

export function isRegion(value: unknown): value is Region {
    return (
        typeof value === "string" && (REGIONS as readonly string[]).includes(value)
    );
}

/** Parses a region from a case-insensitive string, `undefined` when unknown. */
export function parseRegion(value: string): Region | undefined {
    const normalized = value.trim().toUpperCase();
    return isRegion(normalized) ? normalized : undefined;
}
