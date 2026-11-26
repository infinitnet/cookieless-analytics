import { CONTRACT_VERSION, type ProxyCheckResponse } from "../contract.js";
import { PROXY_KEY_HEADER, proxySecretOk } from "../keys/proxy-secret.js";
import { proxyHashOf, registry, SITE_KEY_RE } from "../multisite/registry.js";
import { pluginResponse } from "emdash";
import type { RouteCtx } from "./env.js";

const answer = (ok: boolean) => {
	const body: ProxyCheckResponse = { v: CONTRACT_VERSION, ok };
	return pluginResponse({ status: ok ? 200 : 403, headers: { "content-type": "application/json; charset=utf-8" }, body: { kind: "text", value: JSON.stringify(body) } });
};

/**
 * Connection test of a server proxy: `GET .../proxy/check?k=<site key>` with the proxy secret in `X-EC-Proxy-Key`
 * answers 200 `{ ok: true }` when the secret is the one of that site. Everything else is one 403 `{ ok: false }`:
 * no key, an unknown key, a site without a secret, a missing, malformed or wrong secret. It answers for the given
 * site key only, so it tells nothing about any other site, and a paused site's secret still checks.
 *
 * Like the event route it refuses every secret while the snapshot is older than `PROXY_SNAPSHOT_MAX_AGE_MS`
 * (the sites collection could not be read for that long). It reads the sites registry snapshot and nothing else: no settings, no database, no counter, no write. The host
 * sends `Cache-Control: private, no-store` with both answers.
 */
export function proxyCheckRoute() {
	return {
		public: true,
		methods: ["GET" as const],
		response: "raw" as const,
		async handler(ctx: Pick<RouteCtx, "request" | "input" | "storage">) {
			const k = (ctx.input as { k?: unknown } | null)?.k;
			const reg = typeof k === "string" && SITE_KEY_RE.test(k) ? await registry(ctx.storage?.sites) : undefined;
			const hash = reg ? proxyHashOf(reg, reg.byKey.get(k as string)) : undefined;
			// One hash and one compare whatever the site key is: an unknown key takes the work of a wrong secret.
			return answer(await proxySecretOk(hash, ctx.request.headers.get(PROXY_KEY_HEADER)));
		},
	};
}
