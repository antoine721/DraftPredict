import { formatCombo } from "../lib/keyboard";
import { Dialog } from "../ui";
import { SHORTCUT_HELP } from "./shortcuts";

/** The `?` help sheet. Kept in sync with `SHORTCUT_HELP`. */
export function ShortcutsDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Raccourcis clavier"
            description="Les raccourcis sont ignorés pendant la saisie dans un champ de texte."
            size="sm"
        >
            <ul className="flex flex-col divide-y divide-line">
                {SHORTCUT_HELP.map((shortcut) => (
                    <li
                        key={shortcut.combo}
                        className="flex items-center justify-between gap-4 py-2"
                    >
                        <span className="text-sm text-ink-muted">
                            {shortcut.description}
                        </span>
                        <kbd className="rounded border border-line-strong bg-surface-3 px-2 py-0.5 font-mono text-xs text-ink">
                            {formatCombo(shortcut.combo)}
                        </kbd>
                    </li>
                ))}
            </ul>
        </Dialog>
    );
}
