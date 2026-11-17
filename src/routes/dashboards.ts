/**
 * Dashboard routes: `dashboards/list` and `dashboards/get` under `plugins:read`; save, delete,
 * export, import and copy under `plugins:manage`. Every route takes `site` (local, client or remote id). Dependencies
 * are created through the config save routes, so their validation (safe regex, funnel steps) applies. The schedule
 * (`email`) is written only by `dashboards/email/save`; list and get hide its recipients below Admin.
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import { applySchedule, checkSchedule, type ComposeCtx, composeEmail, type MailEmail } from "../dashboards/mail.js";
import { type Dashboard, DashboardError, EmailSettings } from "../dashboards/schema.js";
import { type DashColl, deleteDashboard, getDashboard, listDashboards, saveDashboard } from "../dashboards/store.js";
import { deleteSharesOf, mostPermissive, type Share, type ShareColl, shareState, shareView } from "../dashboards/shares.js";
import type { ShareSummary } from "../dashboards/share-view.js";
import { BUILTIN_NAMES, DEP_KINDS, type DepKind, fromTemplate, type Lookups, readTemplate, toTemplate } from "../dashboards/templates.js";
import { bindSite, SiteField, type SitesColl } from "../multisite/registry.js";
import type { Settings } from "../settings.js";
import type { ConfigCtx, configRoutes } from "./config.js";
import { type Coll, loadAll } from "./data.js";

export interface DashCtx {
	input: unknown;
	/** The authenticated caller (host `RouteContext.user`); absent for a token without a user. */
	user?: { email: string; role: number } | undefined;
	kv?: KvLike;
	/** Present only with `email:send` and a configured provider. */
	email?: MailEmail | undefined;
	storage: { dashboards?: DashColl; shares?: ShareColl; sites?: Pick<SitesColl, "query"> } & Partial<Record<DepKind, Coll>> & Record<string, unknown>;
}

export interface DashEnv {
	settings(): Promise<Pick<Settings, "siteId">>;
	/** The config routes: dependencies are saved through them. */
	config: ReturnType<typeof configRoutes>;
	/** Remote satellite ids. Their dashboards are stored here; their config lives on the satellite. */
	remoteIds?(): readonly string[];
	now?(): number;
	/** Scheduled email: the site timezone and what composing a message needs. */
	mail?(ctx: DashCtx): Promise<{ tz: string } & Omit<ComposeCtx, "now">>;
}

/** Host role of Admin (`Role.ADMIN`); callers below see `recipientCount` instead of the recipients. */
export const ADMIN_ROLE = 50;
/** The host text when no email provider is configured. */
export const NO_PROVIDER_TEXT = "No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email.";
const TEST_SEND_SECONDS = 60;

/** `email` without recipients for callers below Admin, plus `recipientCount`. */
export function forCaller(d: Dashboard, role: number | undefined): Dashboard & { recipientCount?: number } {
	if (!d.email) return d;
	if ((role ?? 0) >= ADMIN_ROLE) return { ...d, recipientCount: d.email.recipients.length };
	const { recipients: _r, pending: _p, ...email } = d.email;
	return { ...d, email: email as Dashboard["email"], recipientCount: d.email.recipients.length };
}

const Id = z.string().regex(/^[a-z0-9]{12}$/);
const Sites = z.array(z.string().regex(/^[a-z0-9-]{1,32}$/)).min(1).max(20);
export const DashBodies = {
	list: z.object({ site: SiteField }).strict(),
	get: z.object({ id: Id, site: SiteField }).strict(),
	save: z.object({ dashboard: z.record(z.string(), z.unknown()), site: SiteField }).strict(),
	delete: z.object({ id: Id, site: SiteField }).strict(),
	export: z.object({ id: Id, site: SiteField, withDependencies: z.boolean().optional() }).strict(),
	import: z
		.object({ sites: Sites, template: z.record(z.string(), z.unknown()).optional(), builtin: z.enum(BUILTIN_NAMES).optional(), createDependencies: z.boolean().optional() })
		.strict()
		.refine((b) => (b.template === undefined) !== (b.builtin === undefined), { message: "give template or builtin" }),
	copy: z.object({ id: Id, site: SiteField, sites: Sites, createDependencies: z.boolean().optional() }).strict(),
	emailSave: z.object({ id: Id, site: SiteField, email: EmailSettings }).strict(),
	// Not strict: an address in the body is ignored, the message goes to the caller only.
	emailTest: z.object({ id: Id, site: SiteField }),
	emailStatus: z.object({ site: SiteField }).strict(),
};

export interface ImportReport {
	created: Array<{ site: string; id: string }>;
	dependencies: Array<{ site: string; kind: DepKind; id: string; name: string }>;
	unresolved: Array<{ site: string; kind: DepKind; name: string; tile: string }>;
	failed: Array<{ site: string; code: string; message: string }>;
}

const typed = (err: unknown): never => {
	if (err instanceof DashboardError) throw new PluginRouteError(err.code, err.message, 400);
	throw err;
};

export function dashboardRoutes(env: DashEnv) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);

	/** Local, client or remote site; anything else is a typed 400. */
	async function site(ctx: DashCtx, requested: string | undefined): Promise<{ id: string; remote: boolean }> {
		const s = await env.settings();
		if (requested && requested !== s.siteId && env.remoteIds?.().includes(requested)) return { id: requested, remote: true };
		return { id: (await bindSite(requested, s.siteId, ctx.storage.sites)).id, remote: false };
	}
	const coll = (ctx: DashCtx) => {
		if (!ctx.storage.dashboards) throw new PluginRouteError("storage_unavailable", "The dashboards collection is not available.", 500);
		return ctx.storage.dashboards;
	};
	async function lookups(ctx: DashCtx, s: { id: string; remote: boolean }): Promise<Lookups> {
		const out: Lookups = { goals: [], segments: [], funnels: [] };
		if (s.remote) return out;
		for (const k of DEP_KINDS) out[k] = (await loadAll(ctx.storage[k], { site: s.id })) as Lookups[DepKind];
		return out;
	}
	async function found(ctx: DashCtx, s: { id: string }, id: string) {
		const d = await getDashboard(coll(ctx), s.id, id).catch(typed);
		if (!d) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
		return d;
	}

	async function importInto(ctx: DashCtx, tplInput: { template?: unknown; builtin?: string }, sites: readonly string[], createDependencies: boolean): Promise<ImportReport> {
		// Structure first: an invalid template rejects the whole call.
		let tpl: ReturnType<typeof readTemplate>;
		try {
			tpl = readTemplate(tplInput);
		} catch (err) {
			return typed(err);
		}
		const report: ImportReport = { created: [], dependencies: [], unresolved: [], failed: [] };
		for (const requested of sites) {
			try {
				const s = await site(ctx, requested);
				const create = async (kind: DepKind, data: Record<string, unknown>) => {
					const route = env.config[`config/${kind}/save`];
					if (!route) throw new Error(`no config route for ${kind}`);
					const res = (await route.handler({ input: { data, site: s.id }, storage: ctx.storage as ConfigCtx["storage"] })) as { id: string };
					return res.id;
				};
				const r = await fromTemplate(tpl, await lookups(ctx, s), { createDependencies: createDependencies && !s.remote, create });
				report.dependencies.push(...r.dependencies.map((d) => ({ site: s.id, ...d })));
				report.unresolved.push(...r.unresolved.map((u) => ({ site: s.id, ...u })));
				const d = await saveDashboard(coll(ctx), s.id, r.dashboard, now());
				report.created.push({ site: s.id, id: d.id });
			} catch (err) {
				const e = err as { code?: unknown; message?: unknown };
				report.failed.push({ site: requested, code: typeof e.code === "string" ? e.code : "error", message: String(e.message ?? err) });
			}
		}
		return report;
	}

	return {
		"dashboards/list": {
			permission: "plugins:read" as const,
			input: DashBodies.list,
			async handler(ctx: DashCtx) {
				const b = DashBodies.list.parse(ctx.input ?? {});
				const s = await site(ctx, b.site);
				const items = (await listDashboards(coll(ctx), s.id)).map((d) => forCaller(d, ctx.user?.role));
				// Link count and the most permissive state per dashboard, with that link's label and expiry; remote sites have no shares.
				const shares: Record<string, ShareSummary> = {};
				if (ctx.storage.shares && !s.remote)
					for (const it of await loadAll(ctx.storage.shares, { site: s.id })) {
						const sh = it.data as Share;
						const view = shareView(it.id, sh, now());
						const st = shareState(view);
						const cur = shares[sh.dashboard] ?? { count: 0, state: "none", views: 0, expires: null };
						const lead = cur.count === 0 || mostPermissive([cur.state, st]) !== cur.state;
						const link = lead ? { expires: view.expires, ...(view.label ? { label: view.label } : {}) } : { expires: cur.expires, ...(cur.label ? { label: cur.label } : {}) };
						shares[sh.dashboard] = { count: cur.count + 1, state: lead ? st : cur.state, views: cur.views + (sh.views ?? 0), ...link };
					}
				return { site: s.id, items, shares };
			},
		},
		"dashboards/get": {
			permission: "plugins:read" as const,
			input: DashBodies.get,
			async handler(ctx: DashCtx) {
				const b = DashBodies.get.parse(ctx.input);
				return forCaller(await found(ctx, await site(ctx, b.site), b.id), ctx.user?.role);
			},
		},
		"dashboards/save": {
			permission: "plugins:manage" as const,
			input: DashBodies.save,
			async handler(ctx: DashCtx) {
				const b = DashBodies.save.parse(ctx.input);
				const s = await site(ctx, b.site);
				return forCaller(await saveDashboard(coll(ctx), s.id, b.dashboard, now()).catch(typed), ctx.user?.role);
			},
		},
		"dashboards/delete": {
			permission: "plugins:manage" as const,
			input: DashBodies.delete,
			async handler(ctx: DashCtx) {
				const b = DashBodies.delete.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (!(await deleteDashboard(coll(ctx), s.id, b.id))) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
				// Its links die with it.
				if (ctx.storage.shares) await deleteSharesOf(ctx.storage.shares, s.id, b.id);
				return { id: b.id, deleted: true };
			},
		},
		"dashboards/export": {
			permission: "plugins:manage" as const,
			input: DashBodies.export,
			async handler(ctx: DashCtx) {
				const b = DashBodies.export.parse(ctx.input);
				const s = await site(ctx, b.site);
				return toTemplate(await found(ctx, s, b.id), await lookups(ctx, s), { withDependencies: !!b.withDependencies });
			},
		},
		"dashboards/import": {
			permission: "plugins:manage" as const,
			input: DashBodies.import,
			async handler(ctx: DashCtx) {
				const b = DashBodies.import.parse(ctx.input);
				return importInto(ctx, b.builtin !== undefined ? { builtin: b.builtin } : { template: b.template }, b.sites, !!b.createDependencies);
			},
		},
		"dashboards/copy": {
			permission: "plugins:manage" as const,
			input: DashBodies.copy,
			async handler(ctx: DashCtx) {
				const b = DashBodies.copy.parse(ctx.input);
				const s = await site(ctx, b.site);
				// Export with dependencies, then import: the copies are not linked to the source.
				const tpl = toTemplate(await found(ctx, s, b.id), await lookups(ctx, s), { withDependencies: true });
				return importInto(ctx, { template: tpl }, b.sites, !!b.createDependencies);
			},
		},
		"dashboards/email/status": {
			permission: "plugins:read" as const,
			input: DashBodies.emailStatus,
			async handler(ctx: DashCtx) {
				const b = DashBodies.emailStatus.parse(ctx.input ?? {});
				const s = await site(ctx, b.site);
				const scheduled = s.remote ? 0 : (await listDashboards(coll(ctx), s.id)).filter((d) => d.email?.enabled).length;
				return { provider: !!ctx.email, scheduled, ...(ctx.email ? {} : { message: NO_PROVIDER_TEXT }) };
			},
		},
		"dashboards/email/save": {
			permission: "plugins:manage" as const,
			input: DashBodies.emailSave,
			async handler(ctx: DashCtx) {
				const b = DashBodies.emailSave.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (s.remote) throw new PluginRouteError("remote_site_not_schedulable", "Dashboards of a remote site cannot be sent by email.", 400);
				if (!env.mail) throw new PluginRouteError("mail_unavailable", "Scheduled email is not available.", 500);
				const d = await found(ctx, s, b.id);
				const others = (await listDashboards(coll(ctx), s.id)).filter((x) => x.id !== d.id && x.email?.enabled).length;
				try {
					checkSchedule(d, b.email, others);
				} catch (err) {
					typed(err);
				}
				const record = applySchedule(d, b.email, (await env.mail(ctx)).tz, now());
				await coll(ctx).put(d.id, record);
				return forCaller(record, ctx.user?.role);
			},
		},
		"dashboards/email/send-test": {
			permission: "plugins:manage" as const,
			input: DashBodies.emailTest,
			async handler(ctx: DashCtx) {
				const b = DashBodies.emailTest.parse(ctx.input);
				const to = ctx.user?.email;
				if (!to) throw new PluginRouteError("no_user", "A test email goes to your own address; this token has no user.", 400);
				if (!ctx.email) throw new PluginRouteError("no_provider", NO_PROVIDER_TEXT, 400);
				if (!env.mail || !ctx.kv) throw new PluginRouteError("mail_unavailable", "Scheduled email is not available.", 500);
				const s = await site(ctx, b.site);
				if (s.remote) throw new PluginRouteError("remote_site_not_schedulable", "Dashboards of a remote site cannot be sent by email.", 400);
				const d = await found(ctx, s, b.id);
				// One test per minute per dashboard.
				const key = `mail:test:${d.id}`;
				const last = await ctx.kv.get<{ at?: number }>(key);
				if (last?.at !== undefined && now() - last.at < TEST_SEND_SECONDS) throw new PluginRouteError("too_many_requests", "One test email per minute. Try again shortly.", 429);
				await ctx.kv.set(key, { at: now() });
				const m = await env.mail(ctx);
				const msg = await composeEmail({ ...m, now: now() }, d, d.email ?? { range: d.defaults.range, compare: false });
				await ctx.email.send({ to, subject: msg.subject, text: msg.text, html: msg.html });
				return { sent: true, to };
			},
		},
	};
}
