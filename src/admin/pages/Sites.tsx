/** Config, Sites tab: client sites registry, snippet, pause, key regeneration, proxy secret, delete. Local site only. */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CURRENCIES } from "../../core/currency.js";
import { dayInZone } from "../../core/time.js";
import type { ClientSiteView } from "../../multisite/registry.js";
import type { SiteEntry, SnippetInfo } from "../../routes/sites.js";
import { call, errorText } from "../api.js";
import { snippets } from "../snippet.js";
import { HostsList } from "../components/HostsList.js";
import { count } from "../components/format.js";
import { Notice, Empty, Loading } from "../components/ui.js";
import { Field } from "./Config.js";

type Row = ClientSiteView & { pageviewsToday?: number };
interface ListResult {
	sites: SiteEntry[];
	/** Client sites linked to this site (not in the site switcher). */
	linked?: ClientSiteView[];
	middlewareSeen?: boolean;
	snippet?: SnippetInfo;
}
interface Draft {
	id: string;
	label: string;
	hosts: string;
	gscProperty: string;
	bingSiteUrl: string;
	/** Empty means Inherit (the master's setting). */
	defaultCurrency: string;
	acceptClientRevenue: "" | "on" | "off";
	/** Site search parameters: null is Inherit, "" is off for this site. */
	siteSearchParams: string | null;
	/** Linked to this site: one visit across the hosts, stored as this site. */
	linked: boolean;
}
const BLANK: Draft = { id: "", label: "", hosts: "", gscProperty: "", bingSiteUrl: "", defaultCurrency: "", acceptClientRevenue: "", siteSearchParams: null, linked: false };
const CONFIRM = "DELETE";

function Copy({ label, text }: { label: string; text: string }) {
	const [state, setState] = useState<string | null>(null);
	return (
		<div className="ca-stack">
			<div className="ca-field-label">{label}</div>
			<code aria-label={label} className="ca-secret">
				{text}
			</code>
			<Button size="sm"
				onClick={() =>
					void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"))).then(
						() => setState("Copied."),
						() => setState("Copy failed; select the text and copy it by hand."),
					)
				}
			>
				Copy
			</Button>{" "}
			{state && <span role="status">{state}</span>}
		</div>
	);
}

function SnippetPanel({ site, info }: { site: Row; info: SnippetInfo }) {
	const s = snippets(info, site.key);
	return (
		<section aria-label={`Snippet for ${site.label}`}>
			<h3>Snippet for {site.label}</h3>
			{!info.external && <Notice tone="warning">Script delivery is set to inline, so this install serves no script file for other sites. Set it to External file in the settings.</Notice>}
			<Copy label="Script tag: paste into the head of every page" text={s.tag} />
			<Copy label='Tag Manager: a Custom HTML tag with the same text, trigger "Initialization - All Pages"' text={s.tagManager} />
			<Copy label="Single page apps: run after each route change (in Tag Manager, a Custom HTML tag with this line inside script tags on the History Change trigger)" text={s.spa} />
		</section>
	);
}

/**
 * The proxy secret of one site: make, replace, remove. The secret is shown once, right after it is made; the
 * list only tells whether one exists and since when.
 */
function ProxyPanel({ site, tz, busy, run }: { site: Row; tz: string; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
	const [secret, setSecret] = useState<string | null>(null);
	const [armed, setArmed] = useState<"replace" | "remove" | null>(null);
	const has = site.proxyCreated !== undefined;
	const make = () =>
		void run(async () => {
			setSecret(null);
			setSecret((await call<{ secret: string }>("sites/proxy-secret", { id: site.id })).secret);
		}).then(() => setArmed(null));
	const remove = () =>
		void run(async () => {
			await call("sites/proxy-secret", { id: site.id, revoke: true });
			setSecret(null);
		}).then(() => setArmed(null));
	return (
		<section aria-label={`Proxy secret for ${site.label}`}>
			<h3>Proxy secret for {site.label}</h3>
			<p className="ca-small">
				Only needed when a server on this site's own host forwards the page script's posts to this install. That server sends the secret in the X-EC-Proxy-Key header and each visitor's address in X-EC-Client-IP, so visitors are told
				apart. The script tag alone needs no secret. Keep the secret on the server and never put it into a page.
			</p>
			<p>{has ? `A proxy secret exists, made on ${dayInZone(site.proxyCreated as number, tz)}.` : "No proxy secret."}</p>
			{secret && (
				<Notice tone="warning">
					Copy the secret now: it is not shown again. Every server of this install accepts it within 60 seconds, so a connection test can fail during that minute. <Copy label={`Proxy secret of ${site.label}`} text={secret} />
				</Notice>
			)}
			{armed && (
				<Notice tone="warning">
					{armed === "replace" ? "A new secret stops the old one within 60 seconds." : "Removing the secret stops it within 60 seconds."} Until the proxy sends a valid secret, its posts are refused and counted as "Proxy secret not accepted". While the site list cannot be read, every proxy secret is refused once the last successful read is 10 minutes old.
				</Notice>
			)}
			<div className="ca-actions">
				{!has ? (
					<Button variant="primary" size="sm" disabled={busy} onClick={make}>
						Create proxy secret
					</Button>
				) : armed === "replace" ? (
					<Button variant="primary" size="sm" disabled={busy} onClick={make}>
						Confirm new proxy secret
					</Button>
				) : (
					<Button size="sm" onClick={() => setArmed("replace")}>
						New proxy secret
					</Button>
				)}
				{has &&
					(armed === "remove" ? (
						<Button variant="secondary-destructive" size="sm" disabled={busy} onClick={remove}>
							Confirm removal
						</Button>
					) : (
						<Button variant="secondary-destructive" size="sm" onClick={() => setArmed("remove")}>
							Remove proxy secret
						</Button>
					))}
				{armed && (
					<Button size="sm" onClick={() => setArmed(null)}>
						Cancel
					</Button>
				)}
			</div>
		</section>
	);
}

export function Sites() {
	const [data, setData] = useState<ListResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [shown, setShown] = useState<string | null>(null);
	const [proxyOf, setProxyOf] = useState<string | null>(null);
	const [armedKey, setArmedKey] = useState<string | null>(null);
	const [del, setDel] = useState<{ id: string; typed: string; data: boolean } | null>(null);
	const [msg, setMsg] = useState<string | null>(null);

	const reload = useCallback(
		() =>
			call<ListResult>("sites/list", { counts: true }).then(
				(r) => setData(r),
				(e: unknown) => setError(errorText(e)),
			),
		[],
	);
	useEffect(() => {
		void reload();
	}, [reload]);

	const run = async (fn: () => Promise<unknown>) => {
		setError(null);
		setMsg(null);
		setBusy(true);
		try {
			await fn();
			await reload();
			return true;
		} catch (e) {
			setError(errorText(e));
			return false;
		} finally {
			setBusy(false);
		}
	};

	const tz = data?.sites.find((s) => s.local)?.timezone ?? "UTC";
	const rows: Row[] = [...(data?.sites ?? []).flatMap((s) => (s.kind === "client" && s.client ? [s.client] : [])), ...(data?.linked ?? [])];
	const save = async (e: FormEvent) => {
		e.preventDefault();
		if (!draft) return;
		const hosts = draft.hosts.split(/[\s,]+/).filter(Boolean);
		const body = {
			...(editing ? {} : { create: true }),
			id: draft.id.trim(),
			label: draft.label.trim(),
			hosts,
			gscProperty: draft.gscProperty.trim(),
			bingSiteUrl: draft.bingSiteUrl.trim(),
			// null clears the site's own value: Inherit.
			defaultCurrency: draft.defaultCurrency || null,
			acceptClientRevenue: draft.acceptClientRevenue === "" ? null : draft.acceptClientRevenue === "on",
			siteSearchParams: draft.siteSearchParams === null ? null : draft.siteSearchParams.trim(),
			linked: draft.linked,
		};
		if (await run(() => call("sites/save", body))) {
			setShown(body.id);
			setDraft(null);
			setEditing(null);
		}
	};
	const remove = async (e: FormEvent) => {
		e.preventDefault();
		if (!del || del.typed !== CONFIRM) return;
		const { id, data: withData } = del;
		await run(async () => {
			const first = await call<{ data: { done: boolean } | null }>("sites/delete", { id, deleteData: withData });
			// The first call deleted one batch; continue until every row of the site is gone.
			for (let i = 0; withData && !first.data?.done && i < 1000; i++) if ((await call<{ done: boolean }>("tools/purge-site", { site: id, confirm: CONFIRM })).done) break;
			setMsg(withData ? `Deleted ${id} and its data.` : `Deleted ${id}; its data stays until retention removes it.`);
			setDel(null);
		});
	};

	return (
		<section aria-label="Sites">
			<p className="ca-small">
				Hosted on this install, measuring any site you register: a client site loads the script from here and sends its visits here. Its reports, goals, funnels, segments and annotations work like this site's. Error pages and automatic
				annotations are not available for client sites.
			</p>
			{error && <Notice tone="error">{error}</Notice>}
			{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
			{data && data.middlewareSeen === false && (
				<Notice tone="warning">The middleware has not been seen for a day. Client sites need it: without it, visits from other sites are refused. Check that the integration is installed.</Notice>
			)}
			{data === null ? (
				<Loading />
			) : rows.length === 0 ? (
				<Empty>No client sites yet.</Empty>
			) : (
				<div className="ca-table-scroll">
					<table aria-label="Client sites">
						<thead>
							<tr>
								{["Label", "Id", "Hosts", "Status", "Key", "Search", "Page views today", ""].map((h) => (
									<th key={h} className={h === "Page views today" ? "ca-num" : undefined}>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td>{r.label}</td>
									<td className="ca-ident">
										<code>{r.id}</code>
									</td>
									<td>{r.hosts.join(", ")}</td>
									<td>{[r.paused ? "paused" : "active", r.linked && "linked to this site", r.proxyCreated !== undefined && "proxy secret set"].filter(Boolean).join(", ")}</td>
									<td className="ca-ident">
										<code>{r.key.slice(0, 4)}...</code>
									</td>
									<td>{[r.gscProperty && "Google", r.bingSiteUrl && "Bing"].filter(Boolean).join(", ") || "No property mapped"}</td>
									<td className="ca-num">{r.pageviewsToday == null ? "" : count(r.pageviewsToday)}</td>
									<td>
										{/* One row of actions, like the other definition tables; the table scrolls on narrow screens. */}
										<div className="ca-actions ca-row-actions">
											<Button size="sm" onClick={() => setShown(shown === r.id ? null : r.id)}>
												Snippet
											</Button>
											<Button size="sm"
												onClick={() => {
													setEditing(r.id);
													setDraft({
														id: r.id,
														label: r.label,
														hosts: r.hosts.join("\n"),
														gscProperty: r.gscProperty,
														bingSiteUrl: r.bingSiteUrl,
														defaultCurrency: r.defaultCurrency ?? "",
														acceptClientRevenue: r.acceptClientRevenue === undefined ? "" : r.acceptClientRevenue ? "on" : "off",
														siteSearchParams: r.siteSearchParams ? r.siteSearchParams.join(", ") : null,
														linked: !!r.linked,
													});
												}}
											>
												Edit
											</Button>
											<Button size="sm" disabled={busy} onClick={() => void run(() => call("sites/save", { id: r.id, label: r.label, hosts: r.hosts, paused: !r.paused }))}>
												{r.paused ? "Resume" : "Pause"}
											</Button>
											{armedKey === r.id ? (
												<Button variant="primary" size="sm" disabled={busy} onClick={() => void run(() => call("sites/key", { id: r.id })).then(() => setArmedKey(null))}>
													Confirm new key
												</Button>
											) : (
												<Button size="sm" onClick={() => setArmedKey(r.id)}>
													New key
												</Button>
											)}
											<Button size="sm" onClick={() => setProxyOf(proxyOf === r.id ? null : r.id)}>
												Proxy secret
											</Button>
											<Button variant="secondary-destructive" size="sm" onClick={() => setDel({ id: r.id, typed: "", data: false })}>
												Delete
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{armedKey && <Notice tone="warning">A new key stops the old one at once: every page still using the old snippet stops sending until it is updated.</Notice>}
			{del && (
				<form aria-label={`Delete ${del.id}`} className="ca-form" onSubmit={(e) => void remove(e)}>
					<Notice tone="warning">This removes the site {del.id}. Its visits are refused from now on. It cannot be undone.</Notice>
					<label className="ca-check">
						<input type="checkbox" checked={del.data} onChange={(e) => setDel({ ...del, data: e.target.checked })} /> Also delete its data
					</label>
					<Field label={`Type ${CONFIRM} to confirm`}>
						<input value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} autoComplete="off" />
					</Field>
					<div className="ca-actions">
						<Button variant="secondary-destructive" size="sm" type="submit" disabled={busy || del.typed !== CONFIRM}>
							Delete site
						</Button>
						<Button size="sm" onClick={() => setDel(null)}>
							Cancel
						</Button>
					</div>
				</form>
			)}
			{shown && data?.snippet && rows.find((r) => r.id === shown) && <SnippetPanel site={rows.find((r) => r.id === shown) as Row} info={data.snippet} />}
			{proxyOf && rows.find((r) => r.id === proxyOf) && <ProxyPanel key={proxyOf} site={rows.find((r) => r.id === proxyOf) as Row} tz={tz} busy={busy} run={run} />}
			<HostsList key={rows.map((r) => `${r.id}:${r.linked ? 1 : 0}:${r.hosts.join(",")}`).join(" ")} />
			{draft ? (
				<form aria-label={editing ? `Edit ${editing}` : "New client site"} className="ca-form" onSubmit={(e) => void save(e)}>
					<Field label="Label">
						<input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
					</Field>
					<Field label="Id (lowercase letters, digits and dashes)">
						<input value={draft.id} disabled={!!editing} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
					</Field>
					<Field label="Host names, one per line (up to 10, without https://)">
						<textarea rows={3} value={draft.hosts} onChange={(e) => setDraft({ ...draft, hosts: e.target.value })} />
					</Field>
					<label className="ca-check">
						<input type="checkbox" checked={draft.linked} onChange={(e) => setDraft({ ...draft, linked: e.target.checked })} /> Linked to this site (a shop or checkout of this site)
					</label>
					{draft.linked && (
						<p className="ca-small">
							Its visits are stored as this site's visits with the host recorded, and a visit that moves between this site and these hosts stays one visit with its first source. The revenue, site search and Search property settings below
							do not apply: this site's settings do. It is not listed in the site switcher, and data it recorded before it was linked stays under its own id, no longer shown.
						</p>
					)}
					<Field label="Google property (optional)">
						<input value={draft.gscProperty} placeholder="sc-domain:example.com" onChange={(e) => setDraft({ ...draft, gscProperty: e.target.value })} />
					</Field>
					<Field label="Bing site URL (optional)">
						<input value={draft.bingSiteUrl} placeholder="https://www.example.com/" onChange={(e) => setDraft({ ...draft, bingSiteUrl: e.target.value })} />
					</Field>
					<Field label="Default currency">
						<select value={draft.defaultCurrency} onChange={(e) => setDraft({ ...draft, defaultCurrency: e.target.value })}>
							<option value="">Inherit (this site's setting)</option>
							{CURRENCIES.map((c) => (
								<option key={c.code} value={c.code}>
									{c.code} {c.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Accept revenue from browsers">
						<select value={draft.acceptClientRevenue} onChange={(e) => setDraft({ ...draft, acceptClientRevenue: e.target.value as Draft["acceptClientRevenue"] })}>
							<option value="">Inherit (this site's setting)</option>
							<option value="on">Yes</option>
							<option value="off">No: only server calls and the agent events route</option>
						</select>
					</Field>
					<Field label="Site search parameters">
						<select aria-label="Site search source" value={draft.siteSearchParams === null ? "inherit" : "own"} onChange={(e) => setDraft({ ...draft, siteSearchParams: e.target.value === "inherit" ? null : "" })}>
							<option value="inherit">Inherit (this site's setting)</option>
							<option value="own">Own list (empty is off)</option>
						</select>
						{draft.siteSearchParams !== null && (
							<input aria-label="Site search parameter names" value={draft.siteSearchParams} placeholder="q, s" onChange={(e) => setDraft({ ...draft, siteSearchParams: e.target.value })} />
						)}
					</Field>
					<div className="ca-actions">
						<Button variant="primary" size="sm" type="submit" disabled={busy || !draft.id.trim() || !draft.label.trim() || !draft.hosts.trim()}>
							{editing ? "Save" : "Add site"}
						</Button>
						<Button
							size="sm"
							onClick={() => {
								setDraft(null);
								setEditing(null);
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<Button variant="primary" size="sm" onClick={() => setDraft(BLANK)}>
					Add a client site
				</Button>
			)}
		</section>
	);
}
