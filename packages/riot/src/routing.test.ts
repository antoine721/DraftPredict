import { describe, expect, it } from "vitest";

import {
    PLATFORMS,
    PLATFORM_IDS,
    REGIONAL_ROUTES,
    getPlatformInfo,
    isPlatformId,
    parsePlatform,
    platformBaseUrl,
    platformForRegion,
    platformToRegional,
    regionForPlatform,
    regionalBaseUrl,
} from "./routing.js";

describe("routing", () => {
    it("maps every platform to a regional route", () => {
        for (const platform of PLATFORM_IDS) {
            expect(REGIONAL_ROUTES).toContain(platformToRegional[platform]);
        }
    });

    it("lists every platform with a display name", () => {
        expect(PLATFORMS).toHaveLength(PLATFORM_IDS.length);
        const ids = PLATFORMS.map((platform) => platform.id).sort();
        expect(ids).toEqual([...PLATFORM_IDS].sort());
        for (const platform of PLATFORMS) {
            expect(platform.name.length).toBeGreaterThan(0);
            expect(platform.regional).toBe(platformToRegional[platform.id]);
        }
    });

    it("routes the known continents correctly", () => {
        expect(platformToRegional.euw1).toBe("europe");
        expect(platformToRegional.ru).toBe("europe");
        expect(platformToRegional.me1).toBe("europe");
        expect(platformToRegional.na1).toBe("americas");
        expect(platformToRegional.la2).toBe("americas");
        expect(platformToRegional.kr).toBe("asia");
        expect(platformToRegional.jp1).toBe("asia");
        expect(platformToRegional.oc1).toBe("sea");
        expect(platformToRegional.vn2).toBe("sea");
    });

    it("parses platform ids and region codes", () => {
        expect(parsePlatform("euw1")).toBe("euw1");
        expect(parsePlatform("EUW1")).toBe("euw1");
        expect(parsePlatform(" EUW ")).toBe("euw1");
        expect(parsePlatform("kr")).toBe("kr");
        expect(parsePlatform("LAN")).toBe("la1");
        expect(parsePlatform("nope")).toBeUndefined();
    });

    it("round-trips region codes", () => {
        expect(regionForPlatform("euw1")).toBe("EUW");
        expect(platformForRegion("EUW")).toBe("euw1");
        expect(platformForRegion("ALL")).toBeUndefined();
    });

    it("builds hosts", () => {
        expect(platformBaseUrl("euw1")).toBe("https://euw1.api.riotgames.com");
        expect(regionalBaseUrl("europe")).toBe("https://europe.api.riotgames.com");
    });

    it("guards unknown platforms", () => {
        expect(isPlatformId("euw1")).toBe(true);
        expect(isPlatformId("euw")).toBe(false);
        expect(() => getPlatformInfo("nope" as never)).toThrow(/Unknown platform/);
    });
});
