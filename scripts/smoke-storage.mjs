// Release canary for storage, opt in: one synthetic page view to the collect path, then one agent/v1/query read that
// must find it. It writes about 3 rows (the visit and its visitor key index now, the visit's delete when retention
// expires it) and shows up in the site's reports as one visit to a /ca-smoke-<random> path.
//
//   CA_API_KEY=<read:analytics key> node scripts/smoke-storage.mjs --base https://<host> [--collect /_/e] [--wait 35]
//
// The key is read from the environment only. Exit status 0 when the page view is stored and read back, 1 otherwise.
import { randomBytes } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const base = String(args.base ?? "").replace(/\/$/, "");
const key = process.env.CA_API_KEY;
if (!/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(base) || !key) {
	console.error("usage: CA_API_KEY=<key> node scripts/smoke-storage.mjs --base https://<host> [--collect /_/e] [--wait 35]");
	process.exit(64);
}
const id = (n) => [...randomBytes(n)].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const path = `/ca-smoke-${id(8)}`;
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

const sent = await fetch(`${base}${args.collect ?? "/_/e"}`, {
	method: "POST",
	headers: { "content-type": "application/json", origin: base, "user-agent": ua },
	body: JSON.stringify({ v: 1, t: "pv", sid: id(20), h: id(12), u: path, w: 1440, n: 1 }),
});
console.log(`collect ${path}: ${sent.status}`);
if (sent.status !== 204) process.exit(1);

// The query answers from a 30 second cache; the visit is written before the 204.
await new Promise((r) => setTimeout(r, Number(args.wait ?? 35) * 1000));
const today = new Date();
const day = (d) => d.toISOString().slice(0, 10);
const res = await fetch(`${base}/_emdash/api/plugins/cookieless-analytics/agent/v1/query`, {
	method: "POST",
	headers: { "content-type": "application/json", "x-api-key": key },
	body: JSON.stringify({ report: "pages", query: { from: day(new Date(today.getTime() - 86_400_000)), to: day(today), compare: "none", filters: [{ dim: "page", op: "is", values: [path] }] } }),
});
const body = await res.json().catch(() => null);
const views = (body?.data?.rows ?? []).filter((r) => r.key === path).reduce((n, r) => n + Number(r.pageviews ?? 0), 0);
console.log(`agent/v1/query: ${res.status}, page views of ${path}: ${views}`);
process.exit(res.status === 200 && views >= 1 ? 0 : 1);
