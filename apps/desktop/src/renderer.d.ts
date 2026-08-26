/**
 * Ambient typing for the renderer.
 *
 * `apps/web` can reference this file to type `window.draftpredict`:
 *
 * ```ts
 * /// <reference types="@draftpredict/desktop/renderer" />
 * if (window.draftpredict) { … }   // undefined in a plain browser
 * ```
 *
 * The bridge is **optional**: the web UI runs in a normal browser too and must
 * feature-detect instead of assuming Electron.
 */
import type { DraftPredictBridge } from "./bridge.js";

declare global {
    interface Window {
        draftpredict?: DraftPredictBridge;
    }
}

export {};
