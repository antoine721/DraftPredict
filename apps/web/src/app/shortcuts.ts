import { useEffect, useRef } from "react";
import { isEditableTarget, matchesCombo, type ShortcutCombo } from "../lib/keyboard";

/**
 * Global keyboard shortcuts.
 *
 * Bindings are registered by whichever component owns the action, which keeps
 * the handler next to the thing it does. The listener is attached once per
 * hook call on `window`, in the capture phase, and stands down whenever the
 * event comes from a text field — typing "1" in the search box must never
 * navigate away.
 */

export type ShortcutDefinition = {
    combo: ShortcutCombo;
    handler: (event: KeyboardEvent) => void;
    /** Human description, shown in the shortcut help dialog. */
    description?: string;
    /** Run even while a text field has focus. Default `false`. */
    allowInInput?: boolean;
    /** Skip `preventDefault()`. Default `false`. */
    passive?: boolean;
    enabled?: boolean;
};

export function useShortcuts(definitions: ShortcutDefinition[]): void {
    const ref = useRef(definitions);
    ref.current = definitions;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const editable = isEditableTarget(event.target);
            for (const definition of ref.current) {
                if (definition.enabled === false) continue;
                if (editable && !definition.allowInInput) continue;
                if (!matchesCombo(event, definition.combo)) continue;
                if (!definition.passive) event.preventDefault();
                definition.handler(event);
                return;
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}

/** A single shortcut, for a component that only needs one. */
export function useShortcut(
    combo: ShortcutCombo,
    handler: (event: KeyboardEvent) => void,
    options: Omit<ShortcutDefinition, "combo" | "handler"> = {},
): void {
    useShortcuts([{ combo, handler, ...options }]);
}

/** The documented list, rendered by the help dialog. */
export const SHORTCUT_HELP: { combo: ShortcutCombo; description: string }[] = [
    { combo: "1", description: "Aller à la vue Draft" },
    { combo: "2", description: "Aller à Champions & builds" },
    { combo: "3", description: "Aller à Compte" },
    { combo: "4", description: "Aller à Live" },
    { combo: "5", description: "Aller à Paramètres" },
    { combo: "mod+k", description: "Rechercher un champion" },
    { combo: "mod+z", description: "Annuler la dernière modification du draft" },
    { combo: "mod+shift+z", description: "Rétablir" },
    { combo: "l", description: "Activer / désactiver « suivre le client »" },
    { combo: "escape", description: "Fermer la fenêtre ouverte" },
    { combo: "?", description: "Afficher cette aide" },
];

/**
 * The event a `mod+k` press dispatches. Any view can listen for it and focus
 * its own search field, without the shell knowing what a champion picker is.
 */
export const FOCUS_SEARCH_EVENT = "draftpredict:focus-search";

export function dispatchFocusSearch(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
}

/** Focuses `ref` when `mod+k` is pressed anywhere in the app. */
export function useFocusSearchTarget(ref: { current: HTMLInputElement | null }): void {
    useEffect(() => {
        const onFocus = () => {
            ref.current?.focus();
            ref.current?.select();
        };
        window.addEventListener(FOCUS_SEARCH_EVENT, onFocus);
        return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocus);
    }, [ref]);
}
