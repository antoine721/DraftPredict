import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lets a view render its own controls inside the application header.
 *
 * Without this every screen grows its own toolbar strip, and the page ends up
 * with a title bar, a status bar and a toolbar stacked on top of each other
 * before any content appears. One header, filled by whichever view is mounted.
 */
const ToolbarSlotContext = createContext<HTMLElement | null>(null);

export function ViewToolbarProvider({
    slot,
    children,
}: {
    slot: HTMLElement | null;
    children: ReactNode;
}) {
    return (
        <ToolbarSlotContext.Provider value={slot}>
            {children}
        </ToolbarSlotContext.Provider>
    );
}

/**
 * Renders `children` into the header slot.
 *
 * Falls back to rendering in place when no slot exists (server rendering, or a
 * view mounted outside the shell in a test), so nothing is ever lost.
 */
export function ViewToolbar({ children }: { children: ReactNode }) {
    const slot = useContext(ToolbarSlotContext);
    // The slot node is assigned during the shell's layout effect, so wait a
    // commit before portalling into it.
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);

    if (!slot || !ready) {
        return <div className="flex flex-wrap items-center gap-2">{children}</div>;
    }
    return createPortal(
        <div className="flex flex-wrap items-center gap-2">{children}</div>,
        slot,
    );
}
