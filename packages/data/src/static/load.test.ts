import { describe, expect, it } from "vitest";
import {
    clearStaticDataCache,
    compareVersions,
    isCompleteSnapshot,
    listSnapshots,
    loadStaticData,
    resolveSnapshot,
} from "./load.js";
import { getBundledDDragonRoot } from "../util/paths.js";
import { createImageUrls } from "./urls.js";

const staticData = loadStaticData();

describe("loadStaticData", () => {
    it("loads the bundled snapshot without needing a working directory", () => {
        expect(staticData.version).toBe("16.17.1");
        expect(staticData.source).toBe("bundled");
        expect(staticData.language).toBe("en_US");
        expect(staticData.directory).toContain("assets/ddragon/16.17.1");
    });

    it("indexes champions by key and by id", () => {
        const aatrox = staticData.championsById.get("Aatrox");
        expect(aatrox).toBeDefined();
        expect(aatrox!.key).toBe("266");
        expect(aatrox!.title).toBe("the Darkin Blade");
        expect(aatrox!.tags).toContain("Fighter");
        expect(staticData.championsByKey.get("266")).toBe(aatrox);

        const ahri = staticData.championsByKey.get("103");
        expect(ahri?.id).toBe("Ahri");
        expect(ahri?.tags).toContain("Mage");

        const zed = staticData.championsById.get("Zed");
        expect(zed?.key).toBe("238");
        expect(zed?.partype).toBe("Energy");
        expect(zed?.spells).toHaveLength(4);
        expect(zed?.spells.map((s) => s.slot)).toEqual(["Q", "W", "E", "R"]);
        expect(zed?.passive?.name.length).toBeGreaterThan(0);
        expect(zed?.stats.attackdamage).toBeGreaterThan(0);
    });

    it("sorts the champion list by name and covers the whole roster", () => {
        expect(staticData.championList.length).toBe(staticData.championsByKey.size);
        expect(staticData.championList.length).toBeGreaterThan(160);

        const names = staticData.championList.map((c) => c.name);
        expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    });

    it("indexes real items with their build tree and gold", () => {
        const boots = staticData.itemsById.get(1001);
        expect(boots?.name).toBe("Boots");
        expect(boots?.gold.total).toBe(300);
        expect(boots?.into).toContain(3006);

        const botrk = staticData.itemsById.get(3153);
        expect(botrk?.name).toBe("Blade of The Ruined King");
        expect(botrk?.from).toEqual(expect.arrayContaining([1053, 1043, 1037]));
        expect(botrk?.colloq).toContain("bork");
        expect(botrk?.maps[11]).toBe(true);
        expect(botrk?.stats.FlatPhysicalDamageMod).toBe(40);
    });

    it("only keeps items that can be bought on Summoner's Rift", () => {
        expect(staticData.purchasableItems.length).toBeGreaterThan(150);
        expect(staticData.purchasableItems.length).toBeLessThan(
            staticData.itemsById.size,
        );
        for (const item of staticData.purchasableItems) {
            expect(item.gold.purchasable).toBe(true);
            expect(item.maps[11]).toBe(true);
        }
    });

    it("indexes runes with their path, slot and index", () => {
        const electrocute = staticData.runesById.get(8112);
        expect(electrocute?.name).toBe("Electrocute");
        expect(electrocute?.path).toBe(8100);
        expect(electrocute?.slot).toBe(0);
        expect(electrocute?.tier).toBe(0);

        const domination = staticData.runePathsById.get(8100);
        expect(domination?.key).toBe("Domination");
        expect(domination?.slots[0]?.map((r) => r.id)).toContain(8112);
        expect(staticData.runePathList).toHaveLength(5);
    });

    it("indexes summoner spells by numeric key", () => {
        const flash = staticData.summonerSpellsById.get(4);
        expect(flash?.id).toBe("SummonerFlash");
        expect(flash?.cooldown).toBe(300);

        const ids = staticData.summonerSpellList.map((s) => s.id);
        expect(ids).toContain("SummonerFlash");
        expect(ids).toContain("SummonerSmite");
        // ARAM-only spells never show up in a draft.
        expect(ids).not.toContain("SummonerSnowball");
    });

    it("hard-codes the three stat shard rows", () => {
        expect(staticData.statShardRows.map((row) => row.map((s) => s.id))).toEqual([
            [5008, 5005, 5007],
            [5008, 5010, 5001],
            [5011, 5013, 5001],
        ]);

        const adaptive = staticData.statShardsById.get(5008);
        expect(adaptive?.name).toBe("Adaptive Force");
        expect(adaptive?.positions).toEqual([
            { slot: "offense", slotIndex: 0, index: 0 },
            { slot: "flex", slotIndex: 1, index: 0 },
        ]);
    });

    it("memoizes by directory but can be told not to", () => {
        expect(loadStaticData()).toBe(staticData);
        clearStaticDataCache();
        const reloaded = loadStaticData();
        expect(reloaded).not.toBe(staticData);
        expect(reloaded.championsByKey.size).toBe(staticData.championsByKey.size);
    });
});

describe("image urls", () => {
    const urls = createImageUrls("16.17.1");
    const zed = staticData.championsById.get("Zed")!;

    it("builds patch-scoped and version-less Data Dragon urls", () => {
        expect(urls.championSquare(zed)).toBe(
            "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Zed.png",
        );
        expect(urls.championSplash(zed, 1)).toBe(
            "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Zed_1.jpg",
        );
        expect(urls.championLoading("Ahri")).toBe(
            "https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Ahri_0.jpg",
        );
        expect(urls.item(3153)).toBe(
            "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/item/3153.png",
        );
        expect(urls.rune(staticData.runesById.get(8112)!)).toBe(
            "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/Electrocute/Electrocute.png",
        );
        expect(urls.summonerSpell(staticData.summonerSpellsById.get(4)!)).toBe(
            "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/spell/SummonerFlash.png",
        );
        expect(urls.championSpell(zed.spells[0])).toContain("/img/spell/ZedQ.png");
        expect(urls.championPassive(zed)).toContain("/img/passive/");
    });

    it("is bound to the loaded patch", () => {
        expect(staticData.imageUrl.version).toBe(staticData.version);
    });
});

describe("snapshot resolution", () => {
    it("compares patch versions numerically", () => {
        expect(compareVersions("16.9.1", "16.17.1")).toBeLessThan(0);
        expect(compareVersions("16.17.1", "16.17.1")).toBe(0);
        expect(compareVersions("17.1.1", "16.17.1")).toBeGreaterThan(0);
        expect(compareVersions("16.17", "16.17.1")).toBeLessThan(0);
    });

    it("finds complete snapshots in the bundle", () => {
        const root = getBundledDDragonRoot();
        expect(listSnapshots(root)).toEqual(["16.17.1"]);
        expect(isCompleteSnapshot(root)).toBe(false);
    });

    it("returns an empty list for a directory that does not exist", () => {
        expect(listSnapshots("/nope/does/not/exist")).toEqual([]);
    });

    it("falls back to the bundle when the requested patch is missing", () => {
        const resolved = resolveSnapshot({ version: "99.1.1" });
        expect(resolved.version).toBe("16.17.1");
        expect(resolved.source).toBe("bundled");
    });
});
