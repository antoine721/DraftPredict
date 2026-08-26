import { nativeImage } from "electron";
import type { NativeImage } from "electron";

/**
 * Icons are embedded as base64 PNGs rather than read from disk.
 *
 * A packaged Electron app reads its resources from inside the asar archive and
 * a tray icon that fails to load shows up as an invisible tray entry, which is
 * a miserable bug to diagnose. Inlining them removes the whole class of
 * problem. `build/icon.png` (512x512, same artwork) is the placeholder used by
 * electron-builder for the installer/app icons — replace it with the final
 * artwork before shipping.
 */

/** 32x32, for the system tray / menu bar. */
const TRAY_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABqElEQVR42sXWv07CUBiH4XMNKPQf" +
    "pUCrFhEFBZEwSEI0YSAMDg7GhDi4OpiY6GiiF2C8ABcHJ2fdHYw34TU4unym53DaQimlreVr8pto" +
    "eF4acoAQnysl6JASDFiiW4ElkW+VbllaG81kk01Iy6XR1iGtsGWUMlt2A0jQlcroQJcA7qwCgloB" +
    "VFxQN+lQcbrcFjgBCLhoByDhYq4KqPgoAA8XtSqQReDD5186xWiN4aJWswIWg/O5cYkGJIj3bz+8" +
    "AS5c0rZ5wP/jRuPIg7eHD2O4lKcByXzhJnH26cdxOyAsfvr0A8eP37FxKb8DJCw++caTePfixXOP" +
    "au5PxV0B0XA+qVCnuKw3Pa8dXL764nKhbgXEw/nK3fPpcTNwJyAm7vtkAnC50AASBa/1r0CrHM7E" +
    "zfZJIE4DouDus33aPYP7r7lwuWgHRMP5D4v30c+HK8VdK8CLlzpnc+P8bO9dv8Hg7jMUzgJ8Trgw" +
    "uN8hE4QrxSYL8DteezfvoJY6ieGK3gQS589EXNwJQMKz+h4QTJwGWBcWnjVaPAAHtwOwcDuARSDi" +
    "dgQC/gfithISWNFI9wAAAABJRU5ErkJggg==";

/** 128x128, for the window icon on Windows and Linux. */
const APP_PNG =
    "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" +
    "RU5ErkJggg==";

export function trayIcon(): NativeImage {
    const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_PNG}`);
    // macOS wants a 16pt template-sized icon in the menu bar.
    return process.platform === "darwin"
        ? image.resize({ width: 16, height: 16 })
        : image;
}

export function appIcon(): NativeImage {
    return nativeImage.createFromDataURL(`data:image/png;base64,${APP_PNG}`);
}
