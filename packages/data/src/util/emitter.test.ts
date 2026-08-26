import { describe, expect, it, vi } from "vitest";
import { Emitter } from "./emitter.js";

type Events = { ping: number; pong: string };

describe("Emitter", () => {
    it("delivers payloads to every listener", () => {
        const emitter = new Emitter<Events>();
        const a = vi.fn();
        const b = vi.fn();
        emitter.on("ping", a);
        emitter.on("ping", b);
        emitter.on("pong", vi.fn());

        emitter.emit("ping", 7);

        expect(a).toHaveBeenCalledWith(7);
        expect(b).toHaveBeenCalledWith(7);
    });

    it("unsubscribes through the returned function and through off()", () => {
        const emitter = new Emitter<Events>();
        const listener = vi.fn();

        const off = emitter.on("ping", listener);
        off();
        emitter.emit("ping", 1);
        expect(listener).not.toHaveBeenCalled();

        emitter.on("ping", listener);
        emitter.off("ping", listener);
        emitter.emit("ping", 1);
        expect(listener).not.toHaveBeenCalled();
    });

    it("fires a once listener exactly once", () => {
        const emitter = new Emitter<Events>();
        const listener = vi.fn();
        emitter.once("ping", listener);

        emitter.emit("ping", 1);
        emitter.emit("ping", 2);

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith(1);
    });

    it("isolates a throwing listener", () => {
        const onError = vi.fn();
        const emitter = new Emitter<Events>(onError);
        const survivor = vi.fn();

        emitter.on("ping", () => {
            throw new Error("boom");
        });
        emitter.on("ping", survivor);

        expect(() => emitter.emit("ping", 1)).not.toThrow();
        expect(survivor).toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith("ping", expect.any(Error));
    });

    it("tolerates a listener removing itself mid-emit", () => {
        const emitter = new Emitter<Events>();
        const second = vi.fn();
        const off = emitter.on("ping", () => off());
        emitter.on("ping", second);

        emitter.emit("ping", 1);
        expect(second).toHaveBeenCalled();
        expect(emitter.listenerCount("ping")).toBe(1);
    });

    it("counts and clears listeners", () => {
        const emitter = new Emitter<Events>();
        emitter.on("ping", vi.fn());
        emitter.on("pong", vi.fn());
        expect(emitter.listenerCount("ping")).toBe(1);

        emitter.removeAllListeners();
        expect(emitter.listenerCount("ping")).toBe(0);
        expect(emitter.listenerCount("pong")).toBe(0);
    });
});
