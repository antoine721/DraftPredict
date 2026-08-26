import { describe, expect, it } from "vitest";
import {
    formatCombo,
    isEditableTarget,
    matchesCombo,
    parseCombo,
    type KeyLikeEvent,
} from "./keyboard";

function event(partial: Partial<KeyLikeEvent> & { key: string }): KeyLikeEvent {
    return {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        ...partial,
    };
}

describe("parseCombo", () => {
    it("splits modifiers from the key", () => {
        expect(parseCombo("mod+shift+z")).toEqual({
            key: "z",
            mod: true,
            ctrl: false,
            meta: false,
            shift: true,
            alt: false,
        });
    });
});

describe("matchesCombo", () => {
    it("maps mod to Ctrl off macOS and to Cmd on macOS", () => {
        expect(matchesCombo(event({ key: "k", ctrlKey: true }), "mod+k", false)).toBe(
            true,
        );
        expect(matchesCombo(event({ key: "k", metaKey: true }), "mod+k", false)).toBe(
            false,
        );
        expect(matchesCombo(event({ key: "k", metaKey: true }), "mod+k", true)).toBe(
            true,
        );
    });

    it("is case-insensitive on the key", () => {
        expect(matchesCombo(event({ key: "K", ctrlKey: true }), "mod+k", false)).toBe(
            true,
        );
    });

    it("requires an exact modifier match", () => {
        expect(matchesCombo(event({ key: "z" }), "mod+z", false)).toBe(false);
        expect(
            matchesCombo(
                event({ key: "z", ctrlKey: true, shiftKey: true }),
                "mod+z",
                false,
            ),
        ).toBe(false);
        expect(
            matchesCombo(
                event({ key: "z", ctrlKey: true, shiftKey: true }),
                "mod+shift+z",
                false,
            ),
        ).toBe(true);
    });

    it("treats shift as implicit for punctuation keys", () => {
        expect(matchesCombo(event({ key: "?", shiftKey: true }), "?", false)).toBe(
            true,
        );
        expect(matchesCombo(event({ key: "?" }), "?", false)).toBe(true);
    });

    it("matches named keys", () => {
        expect(matchesCombo(event({ key: "Escape" }), "escape", false)).toBe(true);
        expect(matchesCombo(event({ key: " " }), "space", false)).toBe(true);
    });
});

describe("isEditableTarget", () => {
    it("detects fields where typing must win over shortcuts", () => {
        expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
        expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
        expect(isEditableTarget({ isContentEditable: true })).toBe(true);
        expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
        expect(isEditableTarget(null)).toBe(false);
    });
});

describe("formatCombo", () => {
    it("renders platform-appropriate labels", () => {
        expect(formatCombo("mod+k", false)).toBe("Ctrl+K");
        expect(formatCombo("mod+k", true)).toBe("⌘K");
        expect(formatCombo("mod+shift+z", false)).toBe("Ctrl+Maj+Z");
        expect(formatCombo("escape", false)).toBe("Échap");
    });
});
