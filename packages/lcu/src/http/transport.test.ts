import { EventEmitter } from "node:events";
import { request as httpsRequest } from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LcuConnectionError, LcuTimeoutError } from "../errors.js";
import { createNodeTransport } from "./transport.js";

// The https layer is mocked: these tests must never open a socket.
vi.mock("node:https", () => ({
    request: vi.fn(),
    Agent: class FakeAgent {},
}));
vi.mock("node:http", () => ({ request: vi.fn() }));

const mockedRequest = vi.mocked(httpsRequest);

type FakeRequest = EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setTimeout: ReturnType<typeof vi.fn>;
    timeoutHandler?: () => void;
};

function fakeRequest(): FakeRequest {
    const req = new EventEmitter() as FakeRequest;
    req.write = vi.fn();
    req.end = vi.fn();
    req.destroy = vi.fn();
    req.setTimeout = vi.fn((_ms: number, handler: () => void) => {
        req.timeoutHandler = handler;
        return req;
    });
    return req;
}

/** Drives the mocked `https.request` and returns the captured call options. */
function stubRequest(
    respond: (req: FakeRequest, callback: (res: EventEmitter) => void) => void,
): { req: FakeRequest; options: Record<string, unknown> } {
    const req = fakeRequest();
    const captured: { options: Record<string, unknown> } = { options: {} };
    mockedRequest.mockImplementation(((
        options: Record<string, unknown>,
        callback: (res: EventEmitter) => void,
    ) => {
        captured.options = options;
        respond(req, callback);
        return req;
    }) as unknown as typeof httpsRequest);
    return {
        req,
        get options() {
            return captured.options;
        },
    } as { req: FakeRequest; options: Record<string, unknown> };
}

function respondWith(status: number, body: string) {
    return (_req: FakeRequest, callback: (res: EventEmitter) => void) => {
        queueMicrotask(() => {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                headers: Record<string, string>;
            };
            res.statusCode = status;
            res.headers = { "content-type": "application/json" };
            callback(res);
            res.emit("data", Buffer.from(body));
            res.emit("end");
        });
    };
}

afterEach(() => {
    vi.resetAllMocks();
});

describe("createNodeTransport", () => {
    it("refuses a non-loopback host up front", () => {
        expect(() =>
            createNodeTransport({ port: 1234, protocol: "https", host: "riot.com" }),
        ).toThrow(/loopback/);
    });

    it("sends the request to 127.0.0.1 with the shared agent", async () => {
        const agent = {} as never;
        const stub = stubRequest(respondWith(200, '{"ok":true}'));
        const transport = createNodeTransport({
            port: 52459,
            protocol: "https",
            agent,
        });

        const response = await transport({
            method: "GET",
            path: "/lol-summoner/v1/current-summoner",
            headers: { authorization: "Basic xyz" },
            timeoutMs: 5_000,
        });

        expect(response).toMatchObject({ status: 200, body: '{"ok":true}' });
        expect(stub.options).toMatchObject({
            host: "127.0.0.1",
            port: 52459,
            method: "GET",
            path: "/lol-summoner/v1/current-summoner",
            agent,
        });
        expect(stub.req.setTimeout).toHaveBeenCalledWith(5_000, expect.any(Function));
    });

    it("writes a JSON body", async () => {
        const stub = stubRequest(respondWith(204, ""));
        const transport = createNodeTransport({ port: 1, protocol: "https" });

        await transport({
            method: "PATCH",
            path: "/lol-champ-select/v1/session/actions/11",
            headers: {},
            body: '{"championId":103}',
            timeoutMs: 0,
        });

        expect(stub.req.write).toHaveBeenCalledWith('{"championId":103}');
        expect(stub.req.setTimeout).not.toHaveBeenCalled();
    });

    it("turns a socket error into an LcuConnectionError carrying the code", async () => {
        const stub = stubRequest((req) => {
            queueMicrotask(() =>
                req.emit(
                    "error",
                    Object.assign(new Error("connect"), {
                        code: "ECONNREFUSED",
                    }),
                ),
            );
        });
        const transport = createNodeTransport({ port: 1, protocol: "https" });

        const failure = transport({
            method: "GET",
            path: "/x",
            headers: {},
            timeoutMs: 1_000,
        });

        await expect(failure).rejects.toBeInstanceOf(LcuConnectionError);
        await expect(failure).rejects.toMatchObject({ code: "ECONNREFUSED" });
        expect(stub.req.end).toHaveBeenCalled();
    });

    it("times out", async () => {
        const stub = stubRequest(() => {});
        const transport = createNodeTransport({ port: 1, protocol: "https" });

        const pending = transport({
            method: "GET",
            path: "/slow",
            headers: {},
            timeoutMs: 25,
        });
        stub.req.timeoutHandler?.();

        await expect(pending).rejects.toBeInstanceOf(LcuTimeoutError);
        expect(stub.req.destroy).toHaveBeenCalled();
    });

    it("rejects immediately when the signal is already aborted", async () => {
        stubRequest(respondWith(200, "{}"));
        const transport = createNodeTransport({ port: 1, protocol: "https" });
        const controller = new AbortController();
        controller.abort();

        await expect(
            transport({
                method: "GET",
                path: "/x",
                headers: {},
                timeoutMs: 0,
                signal: controller.signal,
            }),
        ).rejects.toBeInstanceOf(LcuConnectionError);
        expect(mockedRequest).not.toHaveBeenCalled();
    });
});
