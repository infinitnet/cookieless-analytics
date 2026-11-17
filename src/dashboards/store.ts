/** Dashboards over the `dashboards` storage collection, indexed by `site`. */
import { randomId } from "../core/crypto.js";
import { loadAll } from "../routes/data.js";
import { type Dashboard, DashboardError, DashboardInput, type DashboardInputT, MAX_DASHBOARDS_PER_SITE, parseStrict, readDashboard } from "./schema.js";

export interface DashColl {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
	put(id: string, data: unknown): Promise<void>;
	delete(id: string): Promise<boolean>;
}

/** The site's readable dashboards, newest first. A record of an unknown format version is left out. */
export async function listDashboards(coll: DashColl, site: string): Promise<Dashboard[]> {
	const out: Dashboard[] = [];
	for (const it of await loadAll(coll, { site })) {
		try {
			const d = readDashboard(it.data);
			if (d.site === site && d.id === it.id) out.push(d);
		} catch {}
	}
	return out.sort((a, b) => b.updated - a.updated);
}

/** One dashboard of the site, or null. Throws `unknown_version` for a record this reader cannot read. */
export async function getDashboard(coll: DashColl, site: string, id: string): Promise<Dashboard | null> {
	const raw = await coll.get(id);
	if (!raw || (raw as { site?: unknown }).site !== site) return null;
	return readDashboard(raw);
}

/** Fields only `dashboards/email/save` and the mail tick write; every other writer ignores them. */
const EMAIL_FIELDS = ["email", "emailNext", "recipientCount"];

/**
 * Validate and store; `input.id` absent creates (at most MAX_DASHBOARDS_PER_SITE per site). An incoming `email` is
 * ignored and the stored schedule kept.
 */
export async function saveDashboard(coll: DashColl, site: string, input: unknown, now: number): Promise<Dashboard> {
	const clean = input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([k]) => !EMAIL_FIELDS.includes(k))) : input;
	const d: DashboardInputT = parseStrict(DashboardInput, clean, "invalid_dashboard");
	let created = now;
	let kept: Pick<Dashboard, "email" | "emailNext"> = {};
	if (d.id) {
		const cur = await getDashboard(coll, site, d.id);
		if (!cur) throw new DashboardError("invalid_dashboard", "Unknown dashboard.");
		created = cur.created;
		if (cur.email) kept = { email: cur.email, ...(cur.emailNext !== undefined ? { emailNext: cur.emailNext } : {}) };
	} else if ((await loadAll(coll, { site })).length >= MAX_DASHBOARDS_PER_SITE) {
		throw new DashboardError("too_many_dashboards", `At most ${MAX_DASHBOARDS_PER_SITE} dashboards per site.`);
	}
	const { id: _id, ...rest } = d;
	const id = d.id ?? randomId(12);
	const record = readDashboard({ id, site, v: 1, ...rest, created, updated: now, ...kept });
	await coll.put(id, record);
	return record;
}

export async function deleteDashboard(coll: DashColl, site: string, id: string): Promise<boolean> {
	const raw = await coll.get(id);
	if (!raw || (raw as { site?: unknown }).site !== site) return false;
	return coll.delete(id);
}
