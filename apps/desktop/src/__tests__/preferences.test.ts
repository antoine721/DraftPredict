import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../bridge.js";
import { PreferencesStore, preferencesPath } from "../preferences.js";

function store(): PreferencesStore {
    const dir = mkdtempSync(join(tmpdir(), "draftpredict-desktop-"));
    return new PreferencesStore(preferencesPath(dir));
}

describe("PreferencesStore", () => {
    it("starts from the defaults when there is no file", () => {
        expect(store().get()).toEqual(DEFAULT_PREFERENCES);
    });

    it("persists a change and reloads it", () => {
        const first = store();
        first.set({ startWithLeagueClient: true });
        expect(JSON.parse(readFileSync(first.path, "utf8"))).toMatchObject({
            startWithLeagueClient: true,
        });
        expect(new PreferencesStore(first.path).get().startWithLeagueClient).toBe(true);
    });

    it("drops unknown keys and non-boolean values", () => {
        const prefs = store();
        const result = prefs.set({
            startWithLeagueClient: "yes",
            somethingElse: 1,
        } as unknown as Partial<typeof DEFAULT_PREFERENCES>);
        expect(result).toEqual(DEFAULT_PREFERENCES);
        expect(Object.keys(result)).toEqual(Object.keys(DEFAULT_PREFERENCES));
    });

    it("notifies listeners only when something actually changed", () => {
        const prefs = store();
        const seen: boolean[] = [];
        const off = prefs.onChange((next) => seen.push(next.minimizeToTray));
        prefs.set({ minimizeToTray: false });
        prefs.set({ minimizeToTray: false });
        off();
        prefs.set({ minimizeToTray: true });
        expect(seen).toEqual([false]);
    });

    it("falls back to the defaults on a corrupt file", () => {
        const prefs = store();
        writeFileSync(prefs.path, "{ not json", "utf8");
        expect(new PreferencesStore(prefs.path).get()).toEqual(DEFAULT_PREFERENCES);
    });
});
