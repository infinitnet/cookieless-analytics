import { pluginResponse } from "emdash";
import type { KvLike } from "../core/crypto.js";
import type { RecorderDeps } from "../core/recorder.js";
import type { ChannelRule } from "../core/channels.js";
import type { SitesColl } from "../multisite/registry.js";

/** The parts of the host `RouteContext` the public routes read. */
export interface RouteCtx {
	request: Request;
	input: unknown;
	requestMeta?: { ip: string | null } | null;
	kv: KvLike;
	storage?: { sites?: Pick<SitesColl, "query"> };
}

/** Host wiring injected by `src/index.ts`, replaced by fakes in tests. */
export interface RouteEnv {
	deps(ctx: RouteCtx): Promise<RecorderDeps>;
	/** Channel rules of a client site (the deps carry the local site's). */
	channelRules?(ctx: RouteCtx, site: string): Promise<readonly ChannelRule[]>;
	/** Run work after the response (`after` from `emdash`). */
	after(fn: () => Promise<unknown>): void;
}

/** 204 with no body. The host adds `Cache-Control: private, no-store` to non-GET plugin responses. */
export const noContent = () => pluginResponse({ status: 204, headers: { "content-type": "text/plain" } });

export const json = (data: unknown) =>
	pluginResponse({ status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: { kind: "text", value: JSON.stringify(data) } });
