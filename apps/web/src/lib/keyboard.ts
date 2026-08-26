/**
 * Keyboard shortcut plumbing.
 *
 * Combos are written the way they are documented: `"mod+k"`, `"shift+?"`,
 * `"ctrl+shift+z"`, `"1"`, `"Escape"`. `mod` is ⌘ on macOS and Ctrl
 * everywhere else, so one binding covers both.
 */

export type ShortcutCombo = string;

export type KeyLikeEvent = {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    target?: unknown;
};

export function isMacPlatform(
    platform: string = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
    return /mac|iphone|ipad|ipod/i.test(platform);
}

/** `true` when the event targets a text field — most shortcuts must stand down. */
export function isEditableTarget(target: unknown): boolean {
    if (typeof target !== "object" || target === null) return false;
    const element = target as {
        tagName?: string;
        isContentEditable?: boolean;
        getAttribute?: (name: string) => string | null;
    };
    if (element.isContentEditable) return true;
    const tag = element.tagName?.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return element.getAttribute?.("role") === "textbox";
}

/** Splits `"mod+shift+k"` into its parts, lowercased and deduped. */
export function parseCombo(combo: ShortcutCombo): {
    key: string;
    mod: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    alt: boolean;
} {
    const parts = combo
        .split("+")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    const key = parts[parts.length - 1] ?? "";
    const modifiers = new Set(parts.slice(0, -1));
    return {
        key,
        mod: modifiers.has("mod"),
        ctrl: modifiers.has("ctrl") || modifiers.has("control"),
        meta: modifiers.has("meta") || modifiers.has("cmd"),
        shift: modifiers.has("shift"),
        alt: modifiers.has("alt") || modifiers.has("option"),
    };
}

/** Does this keyboard event match the combo? */
export function matchesCombo(
    event: KeyLikeEvent,
    combo: ShortcutCombo,
    mac: boolean = isMacPlatform(),
): boolean {
    const parsed = parseCombo(combo);
    if (parsed.key.length === 0) return false;

    const eventKey = event.key.toLowerCase();
    const expected = parsed.key === "space" ? " " : parsed.key;
    if (eventKey !== expected) return false;

    const wantCtrl = parsed.ctrl || (parsed.mod && !mac);
    const wantMeta = parsed.meta || (parsed.mod && mac);
    if (event.ctrlKey !== wantCtrl) return false;
    if (event.metaKey !== wantMeta) return false;
    if (event.altKey !== parsed.alt) return false;

    // `?` and other shifted characters carry shift implicitly.
    const shiftIsImplicit = expected.length === 1 && /[^a-z0-9]/.test(expected);
    if (!shiftIsImplicit && event.shiftKey !== parsed.shift) return false;

    return true;
}

/** `"mod+k"` -> `"⌘K"` on macOS, `"Ctrl+K"` elsewhere. For the help dialog. */
export function formatCombo(
    combo: ShortcutCombo,
    mac: boolean = isMacPlatform(),
): string {
    const parsed = parseCombo(combo);
    const pieces: string[] = [];
    if (parsed.mod) pieces.push(mac ? "⌘" : "Ctrl");
    if (parsed.ctrl && !parsed.mod) pieces.push("Ctrl");
    if (parsed.meta && !parsed.mod) pieces.push(mac ? "⌘" : "Meta");
    if (parsed.alt) pieces.push(mac ? "⌥" : "Alt");
    if (parsed.shift) pieces.push(mac ? "⇧" : "Maj");
    const key = parsed.key;
    const label =
        key === "arrowleft"
            ? "←"
            : key === "arrowright"
              ? "→"
              : key === "arrowup"
                ? "↑"
                : key === "arrowdown"
                  ? "↓"
                  : key === "escape"
                    ? "Échap"
                    : key === "space"
                      ? "Espace"
                      : key.length === 1
                        ? key.toUpperCase()
                        : key.charAt(0).toUpperCase() + key.slice(1);
    pieces.push(label);
    return mac ? pieces.join("") : pieces.join("+");
}
