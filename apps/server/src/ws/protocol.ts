import { z } from "zod";
import type { PublicConfig } from "../config/types.js";
import type { DatasetPairMeta } from "../services/dataset.js";
import type { AnalyzePayload, SuggestionsPayload } from "../services/draft.js";
import type { LcuStatus, SerializedChampSelectState } from "../lcu/serialize.js";
import { draftConfigSchema } from "../services/draft-schema.js";

/**
 * The `/ws` protocol.
 *
 * Server messages are "here is the current state of X"; the client keeps the
 * last one per type, which is why the hub replays them on connect. Client
 * messages are subscriptions plus `draft:set`, the manual-edit path: the UI
 * sends a draft, the server answers on the same socket.
 */

export const WS_TOPICS = [
    "lcu",
    "champselect",
    "draft",
    "config",
    "dataset",
    "jobs",
] as const;

export type WsTopic = (typeof WS_TOPICS)[number];

export function isWsTopic(value: string): value is WsTopic {
    return (WS_TOPICS as readonly string[]).includes(value);
}

// ------------------------------------------------------- server -> client ---

export type ServerMessage =
    | {
          type: "hello";
          clientId: string;
          topics: WsTopic[];
          heartbeatMs: number;
          staticDataVersion: string;
      }
    | { type: "lcu:status"; status: LcuStatus }
    | {
          type: "champselect:update";
          state: SerializedChampSelectState;
          analysis: AnalyzePayload;
          suggestions: SuggestionsPayload;
      }
    | { type: "champselect:end" }
    | {
          type: "draft:analysis";
          requestId: string | null;
          analysis: AnalyzePayload;
          suggestions: SuggestionsPayload | null;
      }
    | { type: "config:update"; config: PublicConfig }
    | { type: "dataset:update"; dataset: DatasetPairMeta }
    | {
          type: "job:progress";
          job: string;
          key: string;
          stage: string;
          loaded: number;
          total: number;
      }
    | { type: "pong"; time: number }
    | {
          type: "error";
          requestId: string | null;
          error: { code: string; message: string; details?: unknown };
      };

/** Which topic a server message belongs to. */
export const topicByMessageType: Record<ServerMessage["type"], WsTopic> = {
    hello: "config",
    "lcu:status": "lcu",
    "champselect:update": "champselect",
    "champselect:end": "champselect",
    "draft:analysis": "draft",
    "config:update": "config",
    "dataset:update": "dataset",
    "job:progress": "jobs",
    pong: "draft",
    error: "draft",
};

/** Message types whose latest value is replayed to a client on connect. */
export const REPLAYED_MESSAGE_TYPES: ServerMessage["type"][] = [
    "lcu:status",
    "champselect:update",
    "config:update",
    "dataset:update",
];

// ------------------------------------------------------- client -> server ---

const topicsSchema = z.array(z.string()).max(WS_TOPICS.length * 2).optional();

const roleSchema = z.number().int().min(0).max(4);
const championKeySchema = z.string().regex(/^[0-9]+$/);

export const clientMessageSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ping") }).strip(),
    z.object({ type: z.literal("subscribe"), topics: topicsSchema }).strip(),
    z.object({ type: z.literal("unsubscribe"), topics: topicsSchema }).strip(),
    z
        .object({
            type: z.literal("draft:set"),
            requestId: z.string().max(64).optional(),
            team: z.array(z.tuple([roleSchema, championKeySchema])).max(5).default([]),
            enemy: z.array(z.tuple([roleSchema, championKeySchema])).max(5).default([]),
            bans: z
                .object({
                    ally: z.array(championKeySchema).max(5).default([]),
                    opponent: z.array(championKeySchema).max(5).default([]),
                })
                .strip()
                .default({ ally: [], opponent: [] }),
            config: draftConfigSchema,
            /** Also compute suggestions for the open ally roles. Default true. */
            suggestions: z.boolean().optional(),
            limit: z.number().int().min(1).max(50).optional(),
        })
        .strip(),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
