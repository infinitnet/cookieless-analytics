// Frozen public contract: changing any value here is a breaking change.
import { describe, expect, it } from "vitest";
import * as contract from "../src/contract.js";
import { DIRECT_IN_PATH } from "../src/client/serve.js";
import { contractBody } from "../src/routes/contract.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

describe("contract", () => {
	it("matches the frozen snapshot", () => {
		expect({
			PLUGIN_ID: contract.PLUGIN_ID,
			CONTRACT_VERSION: contract.CONTRACT_VERSION,
			ROUTES: contract.ROUTES,
			DEFAULT_SCRIPT_PATH: contract.DEFAULT_SCRIPT_PATH,
			DEFAULT_COLLECT_PATH: contract.DEFAULT_COLLECT_PATH,
			DEFAULT_NAMESPACE: contract.DEFAULT_NAMESPACE,
			DEFAULT_SHARE_PATH: contract.DEFAULT_SHARE_PATH,
			SID_RE: String(contract.SID_RE),
			HIT_RE: String(contract.HIT_RE),
			RESERVED_EVENTS: contract.RESERVED_EVENTS,
			FORBIDDEN_PUBLIC_WORDS: contract.FORBIDDEN_PUBLIC_WORDS,
			DIRECT_IN_PATH,
			PROXY_HEADERS: contract.PROXY_HEADERS,
			discovery: contractBody(DEFAULT_SETTINGS),
		}).toMatchInlineSnapshot(`
			{
			  "CONTRACT_VERSION": 1,
			  "DEFAULT_COLLECT_PATH": "/_/e",
			  "DEFAULT_NAMESPACE": "__ec",
			  "DEFAULT_SCRIPT_PATH": "/_/e.js",
			  "DEFAULT_SHARE_PATH": "/_/s",
			  "DIRECT_IN_PATH": "/_emdash/api/plugins/cookieless-analytics/in",
			  "FORBIDDEN_PUBLIC_WORDS": [
			    "analytics",
			    "track",
			    "tracker",
			    "tracking",
			    "pixel",
			    "telemetry",
			    "collect",
			    "stats",
			    "beacon",
			  ],
			  "HIT_RE": "/^[a-z0-9]{12}$/",
			  "PLUGIN_ID": "cookieless-analytics",
			  "PROXY_HEADERS": {
			    "clientIp": "X-EC-Client-IP",
			    "country": "X-EC-Country",
			    "key": "X-EC-Proxy-Key",
			  },
			  "RESERVED_EVENTS": {
			    "_download": "file",
			    "_form": "form",
			    "_outbound": "url",
			  },
			  "ROUTES": {
			    "contract": "contract",
			    "in": "in",
			    "proxyCheck": "proxy/check",
			    "rollup": "rollup",
			    "session": "session",
			    "shareView": "share/view",
			  },
			  "SID_RE": "/^[a-z0-9]{20}$/",
			  "discovery": {
			    "collectPath": "/_/e",
			    "namespace": "__ec",
			    "pluginId": "cookieless-analytics",
			    "proxy": true,
			    "scriptPath": "/_/e.js",
			    "v": 1,
			  },
			}
		`);
	});
});
