import { describe, expect, it } from "vitest";
import { generateFixtureDataset } from "../fixtures/dataset.js";
import { loadStaticData } from "../static/load.js";
import { DatasetError } from "./types.js";
import { validateDataset } from "./validate.js";

const champions = loadStaticData().championList.slice(0, 4);
const valid = generateFixtureDataset({ champions, seed: 1 });

const roundTrip = () => JSON.parse(JSON.stringify(valid)) as unknown;

describe("validateDataset", () => {
    it("accepts a real dataset", () => {
        expect(validateDataset(roundTrip())).toMatchObject({ version: valid.version });
    });

    it("fills in optional catalogues", () => {
        const payload = roundTrip() as Record<string, unknown>;
        delete payload.itemData;
        delete payload.version;

        const dataset = validateDataset(payload);
        expect(dataset.itemData).toEqual({});
        expect(dataset.version).toBe("5");
    });

    it.each([
        ["not an object", 42],
        ["an array", []],
        ["null", null],
        ["missing championData", { version: "5" }],
        ["empty championData", { championData: {} }],
    ])("rejects %s", (_label, payload) => {
        expect(() => validateDataset(payload)).toThrow(DatasetError);
    });

    it("rejects a champion entry without stats for every role", () => {
        const payload = roundTrip() as { championData: Record<string, unknown> };
        const key = Object.keys(payload.championData)[0];
        const champion = payload.championData[key] as {
            statsByRole: Record<string, unknown>;
        };
        delete champion.statsByRole["3"];

        expect(() => validateDataset(payload)).toThrow(/statsByRole\[3\]/);
    });

    it("names the source in the error", () => {
        expect(() => validateDataset(null, { source: "bucket.example" })).toThrow(
            /^bucket\.example:/,
        );
    });

    it("can accept an empty dataset when asked to", () => {
        expect(
            validateDataset({ championData: {} }, { requireChampions: false }),
        ).toMatchObject({ championData: {} });
    });
});
