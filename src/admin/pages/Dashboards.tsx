/** Dashboards (`/dashboards`): list with the template gallery, New, Import; one dashboard with Edit, Copy to sites, Export, Share and Delete. */
import { Badge, Button, DropdownMenu } from "@cloudflare/kumo";
import { annotationAction } from "../components/AnnotationPopover.js";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRESETS, type Preset, presetRange } from "../../core/presets.js";
import { distinctRequests, tileRequest } from "../../dashboards/run.js";
import { IMPACT_METRICS, IMPACT_REPORTS } from "../../query/reports/seo-copy.js";
import { type Dashboard, DashboardInput, isSearchReport, MAX_TILE_METRICS, TILE_KINDS, tileMetricsProblem, tileNeedsSearch, TILE_METRICS, TILE_PARAMS, TILE_REPORTS, type Tile, type TileKind, type TileReport, TileSchema } from "../../dashboards/schema.js";
import { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTIN_TEMPLATES, TEMPLATE_GROUPS } from "../../dashboards/templates.js";
import { currencyLines, lineAxes, metricLabel, type TileData, tileData, tileTitle, TRIMMED_COMPARE, valueFormat, valueLabel } from "../../dashboards/tiles.js";
import type { Filter } from "../../query/filters.js";
import { MAX_SHARES_PER_DASHBOARD } from "../../dashboards/limits.js";
import { MAX_SHARE_LABEL, type ShareState, shareState as stateOf, type ShareSummary, type ShareView } from "../../dashboards/share-view.js";
import type { ImportReport } from "../../routes/dashboards.js";
import { call, errorText, listConfig, listFunnels, listSegments, type SegmentItem, searchConfigured, useReport } from "../api.js";
import { annotationMarkers, BarList, type ChartSeries, Donut, LineChart, SlotShape, StackedBars } from "../components/Chart.js";
import { type MetricDef, nextSlots, seriesLimit, toggleMetric } from "../components/MetricChart.js";
import { DataTable, type TableRow } from "../components/DataTable.js";
import { FilterBar } from "../components/FilterBar.js";
import { fmt } from "../components/format.js";
import { isRemote, Shell, type View } from "../components/Header.js";
import { decodeState, readStoredView } from "../state.js";
import { KpiCard } from "../components/KpiCard.js";
import { TileList } from "../components/TileList.js";
import { DIGEST_SCHEDULE, ScheduleDialog } from "../components/ScheduleDialog.js";
import { Notice, Empty, Loading, ROW_MAIN, rowLink } from "../components/ui.js";
import { ReportNotices } from "../components/ReportNotices.js";

type Draft = Omit<Dashboard, "id" | "site" | "v" | "created" | "updated"> & { id?: string };

/** Body field `site` of a dashboards route: left out for the local site. */
const siteBody = (view: View) => (view.site.local ? {} : { site: view.site.id });
const date = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const newTileId = () => Math.random().toString(36).slice(2, 8).padEnd(6, "0");
const KIND_LABELS: Record<TileKind, string> = { kpi: "Number", line: "Line", area: "Area", bars: "Bars", donut: "Donut", table: "Table", stacked: "Stacked bars" };
const blank = (): Draft => ({ name: "New dashboard", tiles: [], defaults: { range: "30d", compare: "none", filters: [] }, viewer: { ranges: ["7d", "30d", "90d"], compare: true } });

function download(name: string, data: unknown) {
	const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
	Object.assign(document.createElement("a"), { href: url, download: name }).click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── one tile ──────────────────────────────────────────────────────────────────

/** One tile through `data/query` (one request per tile, as every page does), drawn with the chart kit. */
export function TileView({ tile, view, filters, goalNames, searchOff }: { tile: Tile; view: View; filters: readonly Filter[]; goalNames: ReadonlyMap<string, string>; searchOff: boolean }) {
	const { state, site, tz } = view;
	const series = tile.kind === "line" || tile.kind === "area";
	const req = { ...tileRequest(tile, { from: state.from, to: state.to, compare: state.compare, site: site.id, segment: state.segment, compareSegment: state.cseg, filters: [...filters] }), ...(series ? { withAnnotations: true } : {}) };
	const off = searchOff && tileNeedsSearch(tile);
	const res = useReport(site.id, off ? null : req);
	const data = res.data ? tileData(tile, res.data, { goalName: tile.params?.goal ? goalNames.get(tile.params.goal) : undefined }) : null;
	const cur = data?.currency;
	const title = tileTitle(tile, cur);
	const fmtKey = data?.metric ?? tile.metric ?? "";
	const metricFormat = (k: string) => valueFormat(k, cur);
	let body: ReactNode = <Loading />;
	if (off) body = <Empty>No Search source is connected. Set one up in the plugin settings to fill this tile.</Empty>;
	else if (res.error) body = <Notice tone="error">{res.error}</Notice>;
	else if (data) {
		if (data.empty) body = <Empty>{data.empty}</Empty>;
		else if (data.kind === "kpi" && data.impact)
			body = (
				<>
					<KpiCard metric={fmtKey} label={valueLabel(fmtKey, cur)} format={metricFormat(fmtKey)} value={data.value} compare={data.compare} />
					<p className="ca-small">
						Before: {fmt(data.impact.before, metricFormat(fmtKey))}, after {data.impact.day}
						{data.impact.complete ? "" : ` (${data.impact.daysAfter} days so far)`}
					</p>
				</>
			);
		else if (data.kind === "stacked" && data.stack)
			body = data.stack.series.length ? <StackedBars label={title} keys={data.stack.labels} data={data.stack.series.map((p) => ({ t: p.t, parts: data.stack?.keys.map((k) => p.values[k] ?? 0) ?? [] }))} /> : <Empty />;
		else if (data.kind === "kpi") body = <KpiCard metric={fmtKey} label={valueLabel(fmtKey, cur)} format={metricFormat(fmtKey)} value={data.value} compare={data.compare} />;
		else if (data.kind === "line" || data.kind === "area") body = data.buckets.length && data.lines.length ? <TileChart data={data} title={title} view={view} /> : <Empty />;
		else if (!data.rows.length) body = <Empty />;
		else if (data.kind === "bars") body = <BarList label={title} format={metricFormat(fmtKey)} rows={data.rows as Array<{ label: string; value: number }>} />;
		else if (data.kind === "donut") body = <Donut label={title} slices={data.rows as Array<{ label: string; value: number }>} />;
		else body = <DataTable label={title} columns={data.columns.map((k) => ({ key: k, label: valueLabel(k, cur), format: k === "key" ? "text" : metricFormat(k) }))} rows={data.rows as TableRow[]} pageSize={tile.limit ?? 10} />;
	}
	// A number tile whose card label repeats the title shows the name once; the card keeps it for screen readers.
	const plain = data?.kind === "kpi" && valueLabel(fmtKey, cur) === title;
	return (
		<section className="ca-tile ca-panel" data-tile={tile.id} data-w={tile.w} aria-label={title} {...(plain ? { "data-plain": "" } : {})} {...((data?.lines.length ?? 0) > 1 ? { "data-lines": "" } : {})}>
			<h3>{title}</h3>
			{data && <ReportNotices notices={data.notices} view={view} />}
			{body}
			{data && !data.empty
				? currencyLines(data).map((l) => (
						<p key={l} className="ca-small">
							{l}
						</p>
					))
				: null}
		</section>
	);
}

/**
 * The lines of a tile: the stored metrics, each with its slot colour and shape, on at most two axes.
 * With two or more metrics the legend under the title toggles lines for this view only (same rules as the
 * cards of the report pages); the stored list changes only in the tile editor.
 */
function TileChart({ data, title, view }: { data: TileData; title: string; view: View }) {
	const { state, tz } = view;
	const cur = data.currency;
	const all = data.lines.map((l) => l.key);
	const [on, setOn] = useState(all);
	const [refused, setRefused] = useState<string | null>(null);
	const compare = data.lines.some((l) => l.compare);
	// shortcut: the phone width is read on render, not followed on resize; a reload or any toggle picks it up.
	const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches === true;
	const limit = seriesLimit(compare, narrow);
	const shown = on.length > limit ? all.filter((k) => on.includes(k)).slice(0, limit) : on;
	const slotsRef = useRef<Record<string, number>>({});
	const slots = nextSlots(slotsRef.current, shown);
	slotsRef.current = slots;
	const lines = data.lines.filter((l) => shown.includes(l.key)).sort((a, b) => (slots[a.key] ?? 0) - (slots[b.key] ?? 0));
	const axes = lineAxes(lines);
	const defs: MetricDef[] = data.lines.map((l) => ({ key: l.key, label: valueLabel(l.key, cur), format: valueFormat(l.key, cur), ...(l.key === "position" ? { invert: true } : {}) }));
	const series: ChartSeries[] = lines.map((l) => ({
		key: l.key,
		label: valueLabel(l.key, cur),
		format: valueFormat(l.key, cur),
		slot: slots[l.key] ?? 0,
		values: l.values,
		compare: l.compare ?? undefined,
		axis: axes[l.key] ?? "left",
		...(l.key === "position" ? { invert: true } : {}),
	}));
	const toggle = (key: string, e: { shiftKey: boolean; altKey: boolean }) => {
		const r = toggleMetric(shown, key, defs, { compare, narrow, only: e.shiftKey || e.altKey });
		if ("refused" in r) return setRefused(r.refused);
		setRefused(null);
		setOn(r.selected);
	};
	const trimmed = on.length > shown.length ? (compare ? TRIMMED_COMPARE : "Small screen: showing the first 2 metrics.") : "";
	const gran = data.granularity ?? "day";
	return (
		<>
			<LineChart
				label={title}
				buckets={data.buckets}
				series={series}
				granularity={gran}
				compareLabel={data.compareLabel}
				height={160}
				markers={data.impact ? [{ t: data.impact.day, label: data.impact.day, day: data.impact.day }] : state.annotations !== false ? annotationMarkers(data.annotations ?? [], gran, tz) : []}
				markerActions={annotationAction}
				legend={
					all.length > 1 ? (
						<div className="ca-legend" role="group" aria-label="Lines">
							{defs.map((m) => {
								const isOn = shown.includes(m.key);
								return (
									<button key={m.key} type="button" className="ca-legend-item" aria-pressed={isOn} onClick={(e) => toggle(m.key, e)}>
										{isOn ? <SlotShape slot={slots[m.key] ?? 0} /> : <span className="ca-legend-off" aria-hidden="true" />}
										{m.label}
									</button>
								);
							})}
							{compare && (
								<span>
									<SlotShape slot={lines.length === 1 ? (lines[0] ? (slots[lines[0].key] ?? 0) : 0) : 0} dashed />
									<span className="ca-sr-only">Dashed lines: </span>
									{data.compareLabel ?? "Comparison period"}
								</span>
							)}
							<span className="ca-tile-hint" role="status">
								{refused ?? trimmed}
							</span>
						</div>
					) : null
				}
			/>
		</>
	);
}

function useGoalNames(view: View) {
	const [names, setNames] = useState<Map<string, string>>(new Map());
	useEffect(() => {
		if (isRemote(view.site)) return;
		listConfig<{ name: string }>("goals").then((r) => setNames(new Map(r.items.map((i) => [i.id, i.data.name]))), () => {});
	}, [view.site.id]);
	return names;
}

function Grid({ tiles, view, filters, segmentMissing }: { tiles: readonly Tile[]; view: View; filters: readonly Filter[]; segmentMissing?: boolean }) {
	const goalNames = useGoalNames(view);
	const [searchOff, setSearchOff] = useState(false);
	useEffect(() => {
		if (tiles.some((t) => isSearchReport(t.report)) && !isRemote(view.site)) searchConfigured().then((on) => setSearchOff(!on));
	}, [view.site.id]);
	return (
		<>
			{segmentMissing && <Notice tone="warning">The default segment of this dashboard was deleted; the tiles show all visitors.</Notice>}
			<div className="ca-tiles">
				{tiles.map((t) => (
					<TileView key={t.id} tile={t} view={view} filters={filters} goalNames={goalNames} searchOff={searchOff} />
				))}
			</div>
		</>
	);
}

// ── list ──────────────────────────────────────────────────────────────────────

function List({ view, open, create, digest, flash }: { view: View; open: (id: string) => void; create: () => void; digest: (id: string) => void; flash?: string | null }) {
	const [items, setItems] = useState<Dashboard[] | null>(null);
	const [shared, setShared] = useState<Record<string, ShareSummary>>({});
	const [error, setError] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(flash ?? null);
	const [picking, setPicking] = useState(false);
	const reload = useCallback(() => {
		call<{ items: Dashboard[]; shares?: Record<string, ShareSummary> }>("dashboards/list", siteBody(view)).then(
			(r) => {
				setItems(r.items);
				setShared(r.shares ?? {});
			},
			(e: unknown) => setError(errorText(e)),
		);
	}, [view.site.id]);
	useEffect(reload, [reload]);
	const runImport = async (body: Record<string, unknown>): Promise<ImportReport | null> => {
		setError(null);
		setMsg(null);
		try {
			const r = await call<ImportReport>("dashboards/import", { sites: [view.site.id], createDependencies: true, ...body });
			if (r.failed.length) setError(`Import failed: ${r.failed.map((f) => f.message).join("; ")}`);
			else setMsg(`Added.${r.unresolved.length ? ` Not found on this site: ${r.unresolved.map((u) => u.name).join(", ")}.` : ""}`);
			reload();
			return r;
		} catch (e) {
			setError(errorText(e));
			return null;
		}
	};
	/** "Set up weekly digest": the Weekly digest template for this site, then its schedule dialog. */
	const setUpDigest = async () => {
		const id = (await runImport({ builtin: "weekly-digest" }))?.created[0]?.id;
		if (id) digest(id);
	};
	const onFile = async (file: File | undefined) => {
		if (!file) return;
		try {
			await runImport({ template: JSON.parse(await file.text()) });
		} catch (e) {
			setError(`The file is not a dashboard template: ${errorText(e)}`);
		}
	};
	return (
		<>
			<div className="ca-actions">
				<Button size="sm" variant="primary" aria-expanded={picking} onClick={() => setPicking(!picking)}>
					New dashboard
				</Button>
			</div>
			{error && <Notice tone="error">{error}</Notice>}
			{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
			{picking && (
				<Picker
					remote={isRemote(view.site)}
					create={create}
					use={(name) => {
						setPicking(false);
						return name === "weekly-digest" && !isRemote(view.site) ? setUpDigest() : runImport({ builtin: name });
					}}
					onFile={(f) => {
						setPicking(false);
						return onFile(f);
					}}
					close={() => setPicking(false)}
				/>
			)}
			<section className="ca-panel" aria-label="Your dashboards" aria-busy={!items}>
				<h3>Your dashboards</h3>
				{items && !items.length && <Empty>No dashboards yet. Choose New dashboard to start from a template or a blank one.</Empty>}
				{items && items.length > 0 && (
					<div className="ca-table-scroll">
						<table>
							<thead>
								<tr>
									<th>Name</th>
									<th className="ca-num">Tiles</th>
									<th>Shared</th>
									<th>Updated</th>
								</tr>
							</thead>
							<tbody>
								{items.map((d) => (
									<tr key={d.id} {...rowLink(() => open(d.id))}>
										<td>
											<button type="button" {...ROW_MAIN} className="ca-linkbtn ca-rowlink-main" onClick={() => open(d.id)}>
												{d.name}
											</button>
										</td>
										<td className="ca-num">{d.tiles.length}</td>
										<td>
											<SharedCell s={shared[d.id]} />
										</td>
										<td>{date(d.updated)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
			{items?.some((d) => shared[d.id]) && (
				<section className="ca-panel" aria-label="Shared links">
					<h3>Shared links</h3>
					<ul className="ca-shared">
						{items
							.filter((d) => shared[d.id])
							.map((d) => (
								<li key={d.id}>
									<Button size="sm" aria-label={`Open the shared dashboard ${d.name}`} onClick={() => open(d.id)}>
										{d.name}
									</Button>
									<SharedCell s={shared[d.id]} />
									<span className="ca-small">{fmt(shared[d.id]?.views ?? 0)} views</span>
								</li>
							))}
					</ul>
				</section>
			)}
		</>
	);
}

/** The template picker behind "New dashboard": Blank first, a template file, then the built-in templates by group. */
function Picker({ remote, create, use, onFile, close }: { remote: boolean; create: () => void; use: (name: string) => void; onFile: (f: File | undefined) => void; close: () => void }) {
	const file = useRef<HTMLInputElement>(null);
	return (
		<section className="ca-panel" aria-label="New dashboard">
			<div className="ca-panel-head">
				<h3>New dashboard</h3>
				<Button size="sm" variant="ghost" onClick={close}>
					Close
				</Button>
			</div>
			<ul className="ca-cards">
				<li className="ca-card-link">
					<strong>Blank</strong>
					<p className="ca-small">An empty dashboard to fill with your own tiles.</p>
					<Button size="sm" variant="primary" className="ca-stretch" onClick={create}>
						Start blank
					</Button>
				</li>
				<li>
					<strong>From a file</strong>
					<p className="ca-small">A template file exported from a dashboard on this or another site.</p>
					<Button size="sm" onClick={() => file.current?.click()}>
						Choose a file
					</Button>
					<input ref={file} type="file" hidden accept="application/json,.json" aria-label="Import a template file" onChange={(e) => onFile(e.target.files?.[0])} />
				</li>
			</ul>
			{TEMPLATE_GROUPS.map((group) => (
				<div key={group} role="group" aria-label={`${group} templates`}>
					<h4>{group}</h4>
					<ul className="ca-cards">
						{BUILTIN_NAMES.filter((name) => BUILTIN_GROUPS[name] === group).map((name) => {
							const t = BUILTIN_TEMPLATES[name] as { name: string; description?: string };
							const digest = name === "weekly-digest" && !remote;
							return (
								<li key={name} className="ca-card-link">
									<strong>{t.name}</strong>
									<p className="ca-small">{t.description}</p>
									<Button size="sm" className="ca-stretch" aria-label={digest ? `Use the ${t.name} template and schedule its email` : `Use the ${t.name} template`} onClick={() => use(name)}>
										{digest ? "Use and schedule email" : "Use template"}
									</Button>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</section>
	);
}

/** Share state as a badge, with that link's label and expiry and the link count. A full link is shown only once, when it is created, so there is no copy here. */
function SharedCell({ s }: { s: ShareSummary | undefined }) {
	if (!s) return <span className="ca-muted">{STATE_LABEL.none}</span>;
	const facts = [s.label, s.expires === null ? "no expiry" : `${s.state === "expired" ? "expired" : "expires"} ${date(s.expires)}`, s.count > 1 ? `${s.count} links` : ""].filter(Boolean);
	return (
		<span className="ca-shared-cell">
			<Badge variant={s.state === "expired" ? "secondary" : s.state === "open" ? "warning" : "info"}>{STATE_LABEL[s.state]}</Badge>
			<span className="ca-small">{facts.join(", ")}</span>
		</span>
	);
}

// ── one dashboard ─────────────────────────────────────────────────────────────

function CopyToSites({ view, id, done }: { view: View; id: string; done: () => void }) {
	const targets = view.sites.filter((s) => s.id !== view.site.id);
	const [chosen, setChosen] = useState<string[]>([]);
	const [deps, setDeps] = useState(true);
	const [msg, setMsg] = useState<string | null>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		try {
			const r = await call<ImportReport>("dashboards/copy", { id, ...siteBody(view), sites: chosen, createDependencies: deps });
			setMsg(`Copied to ${r.created.length} site${r.created.length === 1 ? "" : "s"}.${r.failed.length ? ` Failed: ${r.failed.map((f) => `${f.site} (${f.message})`).join(", ")}.` : ""}${r.unresolved.length ? ` Not found: ${r.unresolved.map((u) => `${u.name} on ${u.site}`).join(", ")}.` : ""}`);
		} catch (err) {
			setMsg(`Failed: ${errorText(err)}`);
		}
	};
	if (!targets.length) return <Empty>There is no other site to copy to.</Empty>;
	return (
		<form aria-label="Copy to sites" onSubmit={submit}>
			<fieldset>
				<legend>Copy to sites</legend>
				{targets.map((s) => (
					<label key={s.id} className="ca-check">
						<input type="checkbox" checked={chosen.includes(s.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} /> {s.label}
					</label>
				))}
				<label className="ca-check">
					<input type="checkbox" checked={deps} onChange={(e) => setDeps(e.target.checked)} /> Create missing goals, funnels and segments
				</label>
			</fieldset>
			<Button variant="primary" size="sm" type="submit" disabled={!chosen.length}>
				Copy
			</Button>
			<Button size="sm" onClick={done}>
				Close
			</Button>
			{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
		</form>
	);
}

function DashboardPage({ view, id, close, deleted, edit, digest, linked }: { view: View; id: string; close: () => void; deleted: () => void; edit: (d: Dashboard) => void; digest?: boolean; linked?: boolean }) {
	const [d, setD] = useState<Dashboard | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [panel, setPanel] = useState<"none" | "copy" | "share" | "delete" | "email">(digest ? "email" : "none");
	const [typed, setTyped] = useState("");
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [segmentMissing, setSegmentMissing] = useState(false);
	// Link count: Share is the primary action while there is none.
	const [links, setLinks] = useState<number | null>(null);
	useEffect(() => {
		if (isRemote(view.site)) return;
		call<{ items: ShareView[] }>("shares/list", { dashboard: id, ...siteBody(view) }).then(
			(r) => setLinks(r.items.length),
			() => {},
		);
	}, [id]);
	useEffect(() => {
		call<Dashboard>("dashboards/get", { id, ...siteBody(view) }).then(
			(r) => {
				setD(r);
				// The header controls start from the dashboard's defaults (a link's own from and to win); changes apply on top while it is open.
				view.update({ ...(linked ? {} : presetRange(r.defaults.range, view.tz)), compare: r.defaults.compare, cseg: r.defaults.compareSegment, segment: r.defaults.segment, filters: [] });
				if (r.defaults.segment && !isRemote(view.site))
					listSegments().then((s) => setSegmentMissing(!s.items.some((x: SegmentItem) => x.id === r.defaults.segment)), () => {});
			},
			(e: unknown) => setError(errorText(e)),
		);
	}, [id]);
	if (error) return <Notice tone="error">{error}</Notice>;
	if (!d) return <Loading />;
	const remote = isRemote(view.site);
	const doExport = async (withDependencies: boolean) => {
		try {
			download(`${d.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "dashboard"}.json`, await call("dashboards/export", { id, ...siteBody(view), withDependencies }));
		} catch (e) {
			setError(errorText(e));
		}
	};
	const doDelete = async (e: FormEvent) => {
		e.preventDefault();
		setDeleteError(null);
		try {
			await call("dashboards/delete", { id, ...siteBody(view) });
			deleted();
		} catch (err) {
			setDeleteError(errorText(err));
		}
	};
	const segmentGone = segmentMissing && view.state.segment === d.defaults.segment;
	return (
		<>
			<div className="ca-actions ca-dash-head">
				<Button size="sm" onClick={close}>
					All dashboards
				</Button>
				<h2>{d.name}</h2>
				{/* The actions wrap as one group on narrow screens. */}
				<div className="ca-actions">
					<Button size="sm" onClick={() => edit(d)}>
						Edit
					</Button>
					{!remote && (
						<Button size="sm" variant={links === 0 ? "primary" : "secondary"} onClick={() => setPanel("share")}>
							Share
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenu.Trigger render={<Button size="sm" />}>More</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" className="ca-menu">
							{d.tiles.some((t) => t.kind === "line" || t.kind === "area") && (
								<DropdownMenu.CheckboxItem checked={view.state.annotations !== false} onCheckedChange={(on) => view.update({ annotations: on })}>
									Show annotations
								</DropdownMenu.CheckboxItem>
							)}
							<DropdownMenu.Item onClick={() => setPanel("copy")}>Copy to sites</DropdownMenu.Item>
							<DropdownMenu.Item onClick={() => doExport(false)}>Export</DropdownMenu.Item>
							<DropdownMenu.Item onClick={() => doExport(true)}>Export with dependencies</DropdownMenu.Item>
							{!remote && <DropdownMenu.Item onClick={() => setPanel("email")}>Schedule email</DropdownMenu.Item>}
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="danger" onClick={() => setPanel("delete")}>
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
			</div>
			{panel === "copy" && <CopyToSites view={view} id={id} done={() => setPanel("none")} />}
			{panel === "share" && !remote && <ShareDialog view={view} dashboard={d} saved={setD} counted={setLinks} close={() => setPanel("none")} />}
			{panel === "email" && !remote && <ScheduleDialog dashboard={d} site={siteBody(view)} {...(digest && !d.email ? { preset: DIGEST_SCHEDULE } : {})} saved={setD} close={() => setPanel("none")} />}
			{panel === "delete" && (
				<form aria-label="Delete dashboard" onSubmit={doDelete}>
					<label className="ca-field">
						<span>
							Type the name "<code>{d.name}</code>" to confirm
						</span>
						<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
					</label>
					<Button variant="destructive" size="sm" type="submit" disabled={typed !== d.name}>
						Delete dashboard
					</Button>
					{deleteError && <Notice tone="error">{deleteError}</Notice>}
				</form>
			)}
			<Grid tiles={d.tiles} view={segmentGone ? { ...view, state: { ...view.state, segment: undefined } } : view} filters={[...d.defaults.filters, ...view.state.filters]} segmentMissing={segmentGone} />
		</>
	);
}

// ── share ─────────────────────────────────────────────────────────────────────

const EXPIRY: ReadonlyArray<readonly [string, string]> = [
	["never", "Never"],
	["7", "In 7 days"],
	["30", "In 30 days"],
	["90", "In 90 days"],
	["date", "On a date"],
];

const STATE_LABEL: Record<ShareState, string> = { none: "Not shared", open: "Open", password: "Password", expired: "Expired" };
/** Share state label: none, open, password, expired. */
export const shareState = (s: ShareView | null) => STATE_LABEL[stateOf(s)];
/** The "Show annotations to viewers" switch of the Share dialog and the editor. */
function ViewerAnnotations({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
	return (
		<p>
			<label>
				<input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> Show annotations to viewers
			</label>
			<br />
			<small>Annotation texts are visible to anyone with the link.</small>
		</p>
	);
}

/** Up to ten links per dashboard; each has its own label, password, expiry and views. A full link is shown once, right after it is created. */
function ShareDialog({ view, dashboard, saved, counted, close }: { view: View; dashboard: Dashboard; saved: (d: Dashboard) => void; counted?: (n: number) => void; close: () => void }) {
	const id = dashboard.id;
	const [links, setLinks] = useState<ShareView[] | undefined>(undefined);
	const [link, setLink] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const [password, setPassword] = useState("");
	const [expiry, setExpiry] = useState("never");
	const [day, setDay] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [busy, setBusy] = useState(false);
	const body = { dashboard: id, ...siteBody(view) };
	useEffect(() => {
		if (links) counted?.(links.length);
	}, [links]);
	useEffect(() => {
		call<{ items: ShareView[] }>("shares/list", body).then(
			(r) => setLinks(r.items),
			(e: unknown) => setError(errorText(e)),
		);
	}, [id]);
	const expires = (): number | null => {
		if (expiry === "never") return null;
		if (expiry === "date") return day ? Math.floor(Date.parse(`${day}T23:59:59Z`) / 1000) : null;
		return Math.floor(Date.now() / 1000) + Number(expiry) * 86400;
	};
	const create = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setBusy(true);
		try {
			const r = await call<{ link: string; share: ShareView }>("shares/create", { ...body, ...(label.trim() ? { label: label.trim() } : {}), ...(password ? { password } : {}), expires: expires() });
			setLinks([...(links ?? []), r.share]);
			setLink(r.link);
			setCopied(false);
			setPassword("");
			setLabel("");
		} catch (err) {
			setError(errorText(err));
		} finally {
			setBusy(false);
		}
	};
	const revoke = async (shareId: string) => {
		setError(null);
		try {
			await call("shares/delete", { id: shareId, ...siteBody(view) });
			setLinks((links ?? []).filter((l) => l.id !== shareId));
			setLink(null);
		} catch (err) {
			setError(errorText(err));
		}
	};
	const copy = async () => {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			setError("Copying failed. Select the link and copy it by hand.");
		}
	};
	const pwBad = password !== "" && ([...password].length < 8 || [...password].length > 128);
	const setViewerAnnotations = async (on: boolean) => {
		setError(null);
		const { site: _s, v: _v, created: _c, updated: _u, email: _e, emailNext: _n, recipientCount: _r, ...rest } = dashboard as Dashboard & { recipientCount?: number };
		try {
			saved(await call<Dashboard>("dashboards/save", { dashboard: { ...rest, viewer: { ...dashboard.viewer, annotations: on } }, ...siteBody(view) }));
		} catch (err) {
			setError(errorText(err));
		}
	};
	const full = (links?.length ?? 0) >= MAX_SHARES_PER_DASHBOARD;
	return (
		<section aria-label="Share" className="ca-panel">
			<h3>Share</h3>
			<p>A shared link opens a read-only page of this dashboard. Viewers can switch between the allowed date ranges and nothing else. Each link has its own password, expiry and view count; revoking one leaves the others working.</p>
			{error && <Notice tone="error">{error}</Notice>}
			{links === undefined && !error && <Loading />}
			{links && links.length === 0 && <Empty>No links yet.</Empty>}
			{links && links.length > 0 && (
				<div className="ca-table-scroll">
					<table aria-label="Links">
						<thead>
							<tr>
								<th>Label</th>
								<th>State</th>
								<th>Link id</th>
								<th>Created</th>
								<th>Expires</th>
								<th>Views (approximate)</th>
								<th>Last viewed (approximate)</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{links.map((l) => (
								<tr key={l.id} data-share={l.id}>
									<td>{l.label ?? ""}</td>
									<td data-testid="share-state">{shareState(l)}</td>
									<td>{l.prefix}</td>
									<td>{date(l.created)}</td>
									<td>{l.expires === null ? "Never" : date(l.expires)}</td>
									<td>{fmt(l.views)}</td>
									<td>{l.lastViewed === null ? "Never" : date(l.lastViewed)}</td>
									<td>
										<Button variant="secondary-destructive" size="sm" aria-label={`Revoke ${l.label ?? l.prefix}`} onClick={() => revoke(l.id)}>
											Revoke
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{link && (
				<div role="status" className="ca-stack">
					<Notice tone="warning">This link is shown only once. Copy it now.</Notice>
					<input readOnly value={link} aria-label="Share link" size={60} onFocus={(e) => e.currentTarget.select()} />{" "}
					<Button size="sm" onClick={copy}>
						{copied ? "Copied" : "Copy link"}
					</Button>
				</div>
			)}
			<ViewerAnnotations on={dashboard.viewer.annotations === true} onChange={setViewerAnnotations} />
			<p>To change the password, create a new link.</p>
			{links && full && <p>This dashboard has {MAX_SHARES_PER_DASHBOARD} links, the most allowed. Revoke one to create another.</p>}
			{links && !full && (
				<form aria-label="Create share link" onSubmit={create}>
					<h4>New link</h4>
					<label>
						Label (optional) <input value={label} maxLength={MAX_SHARE_LABEL} onChange={(e) => setLabel(e.target.value)} />
					</label>{" "}
					<label>
						Password (optional, 8 to 128 characters) <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
					</label>{" "}
					<label>
						Expires{" "}
						<select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
							{EXPIRY.map(([v, l]) => (
								<option key={v} value={v}>
									{l}
								</option>
							))}
						</select>
					</label>{" "}
					{expiry === "date" && (
						<label>
							Expiry date <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
						</label>
					)}{" "}
					<Button variant="primary" size="sm" type="submit" disabled={busy || pwBad || (expiry === "date" && !day)}>
						Create link
					</Button>
					{pwBad && <p role="alert" className="ca-field-error">Use 8 to 128 characters.</p>}
				</form>
			)}
			<Button size="sm" onClick={close}>
				Close
			</Button>
		</section>
	);
}

// ── editor ────────────────────────────────────────────────────────────────────

function TileForm({ initial, onSave, onCancel, goals, funnels }: { initial: Tile | null; onSave: (t: Tile) => void; onCancel: () => void; goals: ReadonlyArray<{ id: string; name: string }>; funnels: ReadonlyArray<{ id: string; name: string }> }) {
	const [t, setT] = useState<Tile>(initial ?? { id: newTileId(), report: "overview", kind: "kpi", metric: "visitors", w: 1 });
	const kinds: readonly TileKind[] = TILE_KINDS[t.report];
	const metrics = t.report === "impact" ? IMPACT_METRICS[t.params?.report ?? "overview"] : t.kind === "stacked" ? ["queries", "impressions"] : (TILE_METRICS[t.report] ?? []);
	const seoParams = TILE_PARAMS[t.report] ?? [];
	const lines = t.kind === "line" || t.kind === "area";
	const needsMetric = t.kind === "kpi";
	const check = TileSchema.safeParse(t);
	const [refused, setRefused] = useState<string | null>(null);
	/** The metric fields of `kind` for `report`: `metrics` for lines, `metric` for a number; what still fits is kept, else the report's first. */
	const metricFields = (kind: TileKind, report: TileReport): Pick<Tile, "metric" | "metrics"> => {
		const fit = (report === "impact" ? IMPACT_METRICS[t.report === "impact" ? (t.params?.report ?? "overview") : "overview"] : TILE_METRICS[report]) ?? [];
		const keep = [...new Set([...(t.metrics ?? []), ...(t.metric ? [t.metric] : [])])].filter((m) => fit.includes(m));
		const list = keep.length ? keep : fit.slice(0, 1);
		if (kind === "line" || kind === "area") return list.length ? { metrics: list.slice(0, report === "impact" ? 1 : MAX_TILE_METRICS) } : {};
		return kind === "kpi" && list[0] ? { metric: list[0] } : {};
	};
	const setReport = (report: TileReport) => {
		const kind = (TILE_KINDS[report] as readonly TileKind[])[0] as TileKind;
		// An impact tile starts on the newest annotation, so it works on any site.
		setT({ id: t.id, report, kind, w: t.w, ...(t.title ? { title: t.title } : {}), ...metricFields(kind, report), ...(report === "impact" ? { params: { annotation: "latest", report: "overview", window: 28 } } : {}) });
	};
	/** A checklist click: the same refusals as the cards of the report pages; at least one stays on. */
	const toggleLine = (m: string, on: boolean) => {
		const cur = t.metrics ?? [];
		const next = on ? [...cur, m] : cur.filter((k) => k !== m);
		const problem = !next.length ? "One metric stays on." : t.report === "impact" && next.length > 1 ? "An impact line shows one metric." : tileMetricsProblem(next);
		if (problem) return setRefused(next.length ? `${problem} Turn one off first.` : problem);
		setRefused(null);
		setT({ ...t, metrics: next });
	};
	const setParam = (k: string, v: string) => {
		const params: Record<string, unknown> = { ...(t.params ?? {}), [k]: v };
		if (!v) delete params[k];
		const next = { ...t, params } as Tile;
		if (!Object.keys(params).length) delete next.params;
		setT(next);
	};
	return (
		<form
			aria-label="Tile"
			onSubmit={(e) => {
				e.preventDefault();
				if (check.success) onSave(check.data);
			}}
			className="ca-panel ca-tile-form"
		>
			<label>
				Report{" "}
				<select value={t.report} onChange={(e) => setReport(e.target.value as TileReport)}>
					{TILE_REPORTS.map((r) => (
						<option key={r} value={r}>
							{metricLabel(r)}
						</option>
					))}
				</select>
			</label>
			<label>
				Chart{" "}
				<select
					value={t.kind}
					onChange={(e) => {
						const kind = e.target.value as TileKind;
						const { metric: _m, metrics: _ms, ...rest } = t;
						// Lines keep their list, a number its metric; the report's first one when nothing fits.
						setRefused(null);
						setT({ ...rest, kind, ...(kind === "kpi" || kind === "line" || kind === "area" ? metricFields(kind, t.report) : t.metric && kind !== "table" ? { metric: t.metric } : {}) });
					}}
				>
					{kinds.map((k) => (
						<option key={k} value={k}>
							{KIND_LABELS[k]}
						</option>
					))}
				</select>
			</label>
			{lines && (
				<fieldset className="ca-tile-metrics">
					<legend>Metrics</legend>
					{metrics.map((m) => (
						<label key={m} className="ca-check ca-check-inline">
							<input type="checkbox" checked={t.metrics?.includes(m) ?? false} onChange={(e) => toggleLine(m, e.target.checked)} /> {metricLabel(m)}
						</label>
					))}
					<p className="ca-chart-hint" role="status">
						{refused ?? "Up to 4, on at most two scales. Viewers can hide lines, not add them."}
					</p>
				</fieldset>
			)}
			{!lines && (needsMetric || metrics.length > 0) && (
				<label>
					Metric{" "}
					<select value={t.metric ?? ""} onChange={(e) => setT({ ...t, ...(e.target.value ? { metric: e.target.value } : { metric: undefined }) })}>
						{!needsMetric && <option value="">First column</option>}
						{metrics.map((m) => (
							<option key={m} value={m}>
								{metricLabel(m)}
							</option>
						))}
					</select>
				</label>
			)}
			<label>
				Title <input value={t.title ?? ""} maxLength={60} onChange={(e) => setT({ ...t, title: e.target.value || undefined })} />
			</label>
			{tileNeedsSearch(t) && (
				<label>
					Source{" "}
					<select value={t.params?.source ?? ""} onChange={(e) => setParam("source", e.target.value)}>
						<option value="">All</option>
						<option value="google">Google</option>
						<option value="bing">Bing</option>
					</select>
				</label>
			)}
			{seoParams.includes("dim") && (
				<label>
					Group by{" "}
					<select value={t.params?.dim ?? ""} onChange={(e) => setParam("dim", e.target.value)}>
						<option value="">Default</option>
						<option value="query">Queries</option>
						<option value="page">Pages</option>
					</select>
				</label>
			)}
			{seoParams.includes("rank") && t.kind !== "kpi" && (
				<label>
					Rows{" "}
					<select value={t.params?.rank ?? ""} onChange={(e) => setParam("rank", e.target.value)}>
						<option value="">Busiest landing pages</option>
						<option value="best">Best pages by score</option>
						<option value="worst">Worst pages by score</option>
					</select>
				</label>
			)}
			{seoParams.includes("direction") && (
				<label>
					Direction{" "}
					<select value={t.params?.direction ?? ""} onChange={(e) => setParam("direction", e.target.value)}>
						<option value="">Declining</option>
						<option value="up">Rising</option>
					</select>
				</label>
			)}
			{t.report === "impact" && (
				<label>
					Compare{" "}
					<select
						value={t.params?.report ?? "overview"}
						onChange={(e) => {
							const report = e.target.value as (typeof IMPACT_REPORTS)[number];
							const first = IMPACT_METRICS[report][0] as string;
							setT({ ...t, ...(lines ? { metrics: [first] } : { metric: first }), params: { ...(t.params ?? {}), report } });
						}}
					>
						{IMPACT_REPORTS.map((r) => (
							<option key={r} value={r}>
								{metricLabel(r)}
							</option>
						))}
					</select>
				</label>
			)}
			{t.report === "goals" && (
				<label>
					Goal{" "}
					<select value={t.params?.goal ?? ""} onChange={(e) => setParam("goal", e.target.value)}>
						<option value="">All goals</option>
						{goals.map((g) => (
							<option key={g.id} value={g.id}>
								{g.name}
							</option>
						))}
					</select>
				</label>
			)}
			{t.report === "funnels" && (
				<label>
					Funnel{" "}
					<select value={t.params?.funnel ?? ""} onChange={(e) => setParam("funnel", e.target.value)}>
						<option value="">Choose</option>
						{funnels.map((f) => (
							<option key={f.id} value={f.id}>
								{f.name}
							</option>
						))}
					</select>
				</label>
			)}
			{t.report === "event_props" && (
				<label>
					Event name <input value={t.params?.event ?? ""} onChange={(e) => setParam("event", e.target.value)} />
				</label>
			)}
			{!needsMetric && !lines && (
				<label>
					Rows{" "}
					<input type="number" min={5} max={25} value={t.limit ?? 10} onChange={(e) => setT({ ...t, limit: Number(e.target.value) })} />
				</label>
			)}
			<label>
				Width{" "}
				<select value={t.w} onChange={(e) => setT({ ...t, w: Number(e.target.value) as Tile["w"] })}>
					<option value={1}>1 column</option>
					<option value={2}>2 columns</option>
					<option value={3}>Full row</option>
				</select>
			</label>
			<div>
				Tile filters
				<FilterBar filters={t.filters ?? []} onChange={(filters) => setT({ ...t, ...(filters.length ? { filters: filters.slice(0, 5) } : { filters: undefined }) })} />
			</div>
			{!check.success && <p role="alert" className="ca-field-error">{check.error.issues[0]?.message}</p>}
			<div>
				<Button variant="primary" size="sm" type="submit" disabled={!check.success}>
					Save tile
				</Button>
				<Button size="sm" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function Editor({ view, initial, saved, cancel }: { view: View; initial: Draft; saved: (d: Dashboard) => void; cancel: () => void }) {
	const [draft, setDraft] = useState<Draft>(initial);
	const [editing, setEditing] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [segments, setSegments] = useState<SegmentItem[]>([]);
	const [goals, setGoals] = useState<Array<{ id: string; name: string }>>([]);
	const [funnels, setFunnels] = useState<Array<{ id: string; name: string }>>([]);
	useEffect(() => {
		if (isRemote(view.site)) return;
		listSegments().then((r) => setSegments(r.items), () => {});
		listConfig<{ name: string }>("goals").then((r) => setGoals(r.items.map((i) => ({ id: i.id, name: i.data.name }))), () => {});
		listFunnels().then((r) => setFunnels(r.items.map((i) => ({ id: i.id, name: i.data.name }))), () => {});
	}, [view.site.id]);
	const check = useMemo(() => DashboardInput.safeParse(draft), [draft]);
	const set = (next: Partial<Draft>) => setDraft({ ...draft, ...next });
	const tiles = draft.tiles;
	const save = async () => {
		setError(null);
		try {
			saved(await call<Dashboard>("dashboards/save", { dashboard: draft, ...siteBody(view) }));
		} catch (e) {
			setError(errorText(e));
		}
	};
	const ranges = draft.viewer.ranges;
	return (
		<section aria-label="Edit dashboard">
			{error && <Notice tone="error">{error}</Notice>}
			<label>
				Name <input value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
			</label>
			<fieldset>
				<legend>Defaults</legend>
				<label>
					Range{" "}
					<select value={draft.defaults.range} onChange={(e) => set({ defaults: { ...draft.defaults, range: e.target.value as Preset } })}>
						{PRESETS.map(([id, label]) => (
							<option key={id} value={id}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					Compare{" "}
					<select
						value={draft.defaults.compare}
						onChange={(e) => {
							const compare = e.target.value as Draft["defaults"]["compare"];
							const { compareSegment, ...rest } = draft.defaults;
							const cseg = compareSegment ?? segments[0]?.id;
							set({ defaults: compare === "segment" && cseg ? { ...rest, compare, compareSegment: cseg } : { ...rest, compare: compare === "segment" ? "none" : compare } });
						}}
					>
						<option value="none">No comparison</option>
						<option value="previous">Previous period</option>
						<option value="year">Same period last year</option>
						{segments.length > 0 && <option value="segment">Another segment</option>}
					</select>
				</label>
				{draft.defaults.compare === "segment" && (
					<label>
						Compare with segment{" "}
						<select value={draft.defaults.compareSegment ?? ""} onChange={(e) => set({ defaults: { ...draft.defaults, compareSegment: e.target.value } })}>
							{segments.map((s) => (
								<option key={s.id} value={s.id}>
									{s.data.name}
								</option>
							))}
						</select>
					</label>
				)}
				{segments.length > 0 && (
					<label>
						Segment{" "}
						<select
							value={draft.defaults.segment ?? ""}
							onChange={(e) => {
								const { segment: _s, ...rest } = draft.defaults;
								set({ defaults: e.target.value ? { ...rest, segment: e.target.value } : rest });
							}}
						>
							<option value="">All visitors</option>
							{segments.map((s) => (
								<option key={s.id} value={s.id}>
									{s.data.name}
								</option>
							))}
						</select>
					</label>
				)}
				<FilterBar filters={draft.defaults.filters} onChange={(filters) => set({ defaults: { ...draft.defaults, filters: filters.slice(0, 10) } })} />
			</fieldset>
			<fieldset>
				<legend>Viewer rules</legend>
				{PRESETS.map(([id, label]) => (
					<label key={id} className="ca-check ca-check-inline">
						<input type="checkbox" checked={ranges.includes(id)} onChange={(e) => set({ viewer: { ...draft.viewer, ranges: e.target.checked ? [...ranges, id] : ranges.filter((r) => r !== id) } })} /> {label}
					</label>
				))}
				<label>
					<input type="checkbox" checked={draft.viewer.compare} onChange={(e) => set({ viewer: { ...draft.viewer, compare: e.target.checked } })} /> Allow comparison
				</label>
				<ViewerAnnotations on={draft.viewer.annotations === true} onChange={(on) => set({ viewer: { ...draft.viewer, annotations: on } })} />
			</fieldset>
			<fieldset>
				<legend>Tiles</legend>
				<TileList
					tiles={tiles}
					describe={(t) => {
						const ms = t.metrics ?? (t.metric ? [t.metric] : []);
						return `${t.title ?? metricLabel(t.report)} (${KIND_LABELS[t.kind]}${ms.length ? `, ${ms.map(metricLabel).join(", ")}` : ""}, width ${t.w})`;
					}}
					onChange={(next) => set({ tiles: next })}
					onEdit={setEditing}
				/>
				{editing === null && (
					<Button variant="primary" size="sm" onClick={() => setEditing("new")} disabled={tiles.length >= 12}>
						Add tile
					</Button>
				)}
				{editing !== null && (
					<TileForm
						key={editing}
						initial={editing === "new" ? null : (tiles.find((x) => x.id === editing) ?? null)}
						goals={goals}
						funnels={funnels}
						onCancel={() => setEditing(null)}
						onSave={(t) => {
							set({ tiles: editing === "new" ? [...tiles, t] : tiles.map((x) => (x.id === editing ? t : x)) });
							setEditing(null);
						}}
					/>
				)}
				<p>
					Distinct report requests: <span data-testid="distinct">{fmt(distinctRequests(draft))}</span>
				</p>
			</fieldset>
			{!check.success && tiles.length > 0 && <p role="alert" className="ca-field-error">{check.error.issues[0]?.message}</p>}
			<Button variant="primary" size="sm" onClick={save} disabled={!check.success}>
				Save dashboard
			</Button>
			<Button size="sm" onClick={cancel}>
				Cancel
			</Button>
			<section aria-label="Preview">
				<h3>Preview</h3>
				{tiles.length ? <Grid tiles={tiles} view={view} filters={[...draft.defaults.filters, ...view.state.filters]} /> : <Empty>Add a tile to see the preview.</Empty>}
			</section>
		</section>
	);
}

// ── page ──────────────────────────────────────────────────────────────────────

/** Leaving a dashboard: the header returns to the session view, which the dashboard's defaults never replaced. */
function leave(view: View): Partial<View["state"]> {
	const { from, to, compare, cseg, segment, filters } = decodeState("", view.tz, undefined, readStoredView());
	return { dash: undefined, from, to, compare, cseg, segment, filters };
}

function Body({ view, linked: link }: { view: View; linked: string | null }) {
	// The link's range applies to the first opening only.
	const [linked, setLinked] = useState(link);
	const [editing, setEditing] = useState<Draft | null>(null);
	const [digest, setDigest] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const open = view.state.dash;
	if (editing)
		return (
			<Editor
				view={view}
				initial={editing}
				cancel={() => setEditing(null)}
				saved={(d) => {
					setEditing(null);
					view.update({ dash: d.id });
				}}
			/>
		);
	if (open)
		return (
			<DashboardPage
				key={open}
				view={view}
				id={open}
				digest={digest === open}
				linked={linked === open}
				close={() => {
					setDigest(null);
					setLinked(null);
					view.update(leave(view));
				}}
				deleted={() => {
					setDigest(null);
					setFlash("Dashboard deleted.");
					setLinked(null);
					view.update(leave(view));
				}}
				edit={(d) => setEditing({ id: d.id, name: d.name, tiles: d.tiles, defaults: d.defaults, viewer: d.viewer })}
			/>
		);
	return (
		<List
			view={view}
			flash={flash}
			open={(id) => {
				setFlash(null);
				view.update({ dash: id });
			}}
			create={() => {
				setFlash(null);
				setEditing(blank());
			}}
			digest={(id) => {
				setFlash(null);
				setDigest(id);
				view.update({ dash: id });
			}}
		/>
	);
}

export default function Dashboards() {
	// A link with a dashboard and a range (?d=<id>&from=..&to=..) opens it on that range; read before the shell rewrites the URL.
	const [linked] = useState(() => {
		const q = new URLSearchParams(window.location.search);
		return q.get("d") && q.get("from") && q.get("to") ? q.get("d") : null;
	});
	return <Shell title="Dashboards">{(v) => <Body view={v} linked={linked} />}</Shell>;
}
