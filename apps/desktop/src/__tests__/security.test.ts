import { describe, expect, it } from "vitest";
import {
    internalOrigins,
    isExternalHttpsUrl,
    isInternalUrl,
    parseUrl,
} from "../security.js";

describe("isExternalHttpsUrl", () => {
    it("accepts plain https URLs", () => {
        expect(isExternalHttpsUrl("https://developer.riotgames.com/")).toBe(true);
        expect(isExternalHttpsUrl("https://github.com/vigovlugt/draftgap")).toBe(true);
    });

    it("refuses every other scheme", () => {
        for (const url of [
            "http://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "ms-settings:privacy",
            "smb://share/file",
            "vbscript:msgbox",
        ]) {
            expect(isExternalHttpsUrl(url), url).toBe(false);
        }
    });

    it("refuses embedded credentials and junk input", () => {
        expect(isExternalHttpsUrl("https://user:pass@example.com")).toBe(false);
        expect(isExternalHttpsUrl("https://")).toBe(false);
        expect(isExternalHttpsUrl("")).toBe(false);
        expect(isExternalHttpsUrl(null)).toBe(false);
        expect(isExternalHttpsUrl(42)).toBe(false);
        expect(isExternalHttpsUrl(`https://example.com/${"a".repeat(4000)}`)).toBe(false);
    });
});

describe("navigation policy", () => {
    it("allows the embedded server under both spellings", () => {
        const allowed = internalOrigins("http://127.0.0.1:4700", false);
        expect(allowed).toContain("http://127.0.0.1:4700");
        expect(allowed).toContain("http://localhost:4700");
        expect(isInternalUrl("http://127.0.0.1:4700/draft", allowed)).toBe(true);
        expect(isInternalUrl("http://localhost:4700/", allowed)).toBe(true);
    });

    it("allows the Vite dev server only in development", () => {
        expect(isInternalUrl("http://localhost:5173/", internalOrigins("http://127.0.0.1:4700", false))).toBe(false);
        expect(isInternalUrl("http://localhost:5173/", internalOrigins("http://127.0.0.1:4700", true))).toBe(true);
    });

    it("refuses anything else, including a lookalike host", () => {
        const allowed = internalOrigins("http://127.0.0.1:4700", true);
        expect(isInternalUrl("https://127.0.0.1.evil.com/", allowed)).toBe(false);
        expect(isInternalUrl("http://127.0.0.1:9999/", allowed)).toBe(false);
        expect(isInternalUrl("https://draftgap.com", allowed)).toBe(false);
        expect(isInternalUrl("not a url", allowed)).toBe(false);
    });

    it("parses defensively", () => {
        expect(parseUrl("https://example.com")?.origin).toBe("https://example.com");
        expect(parseUrl("nope")).toBeNull();
        expect(parseUrl(undefined)).toBeNull();
    });
});
