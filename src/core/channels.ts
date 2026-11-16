import channelsData from "../data/channels.json";
import hostsData from "../data/hosts.json";
import { cleanHost, hostInList, type Utm } from "./url.js";

export type HostListName = "search" | "social" | "video" | "shopping" | "ai" | "webmail" | "ignore";
export type HostLists = Record<HostListName, string[]>;

/** All keys inside one condition must hold. */
export interface ChannelCondition {
	/** Referrer host or utm_source in the host list. */
	list?: HostListName;
	/** Referrer host in the host list. */
	refList?: HostListName;
	medium?: string;
	source?: string;
	campaign?: string;
	mediumIn?: string[];
	sourceIn?: string[];
	click?: string[];
	/** utm_source ends with `ad`/`ads` and names a host of the list. */
	adsSource?: HostListName;
	referrer?: true;
	utm?: true;
	direct?: true;
}

export interface ChannelRule {
	id: string;
	channel: string;
	/** The rule matches when any condition matches. */
	any: ChannelCondition[];
	/** User rules only; built-ins are spaced by 10 in file order. */
	priority?: number;
}

export interface ChannelInput {
	/** External referrer host (already filtered for self and ignored hosts), or null. */
	refHost?: string | null;
	utm?: Utm;
	/** Click id parameter names present on the landing URL. */
	clickIds?: readonly string[];
}

export interface ChannelResult {
	channel: string;
	source: string;
}

export const DEFAULT_HOSTS = hostsData as HostLists;
export const BUILTIN_CHANNEL_RULES = channelsData as ChannelRule[];

const reCache = new Map<string, RegExp | null>();
function re(p: string): RegExp | null {
	if (!reCache.has(p)) {
		let r: RegExp | null = null;
		try {
			r = new RegExp(p, "i");
		} catch {
			r = null;
		}
		reCache.set(p, r);
	}
	return reCache.get(p) ?? null;
}

/** Bare label of a two-label list entry: `google.*` and `bing.com` give `google` and `bing`; deeper hosts give null. */
function entryLabel(entry: string): string | null {
	const parts = entry.toLowerCase().split(".");
	if (parts.length !== 2) return null;
	return parts[0] || null;
}

/** utm_source names a host of the list: a host value is matched as a host, a bare word against entry labels. */
function sourceInList(source: string | undefined, list: readonly string[]): boolean {
	if (!source) return false;
	if (source.includes(".")) return hostInList(source, list);
	return list.some((e) => entryLabel(e) === source);
}

function test(c: ChannelCondition, i: Required<ChannelInput>, hosts: HostLists): boolean {
	const { refHost, utm, clickIds } = i;
	const src = utm.utm_source;
	const med = utm.utm_medium;
	const camp = utm.utm_campaign;
	if (c.list && !(hostInList(refHost, hosts[c.list]) || sourceInList(src, hosts[c.list]))) return false;
	if (c.refList && !hostInList(refHost, hosts[c.refList])) return false;
	if (c.medium && !(med && re(c.medium)?.test(med))) return false;
	if (c.source && !(src && re(c.source)?.test(src))) return false;
	if (c.campaign && !(camp && re(c.campaign)?.test(camp))) return false;
	if (c.mediumIn && !(med && c.mediumIn.includes(med))) return false;
	if (c.sourceIn && !(src && c.sourceIn.includes(src))) return false;
	if (c.click && !c.click.some((k) => clickIds.includes(k))) return false;
	if (c.adsSource) {
		if (!src || !/ads?$/.test(src)) return false;
		const labels = hosts[c.adsSource].map(entryLabel).filter((l): l is string => !!l);
		if (!labels.some((l) => src.includes(l))) return false;
	}
	const hasUtm = Object.values(utm).some(Boolean);
	if (c.referrer && !refHost) return false;
	if (c.utm && !hasUtm) return false;
	if (c.direct && (refHost || hasUtm || clickIds.length > 0)) return false;
	return true;
}

/** Built-ins (minus disabled ids) merged with user rules by priority; ties keep user rules first. */
export function buildChannelRules(user: readonly ChannelRule[] = [], disabled: readonly string[] = []): ChannelRule[] {
	const builtins = BUILTIN_CHANNEL_RULES.map((rule, idx) => ({ rule, p: (idx + 1) * 10, u: 1, idx })).filter((x) => !disabled.includes(x.rule.id));
	const users = user.map((r, idx) => ({ rule: r, p: r.priority ?? 0, u: 0, idx }));
	return [...builtins, ...users].sort((a, b) => a.p - b.p || a.u - b.u || a.idx - b.idx).map((x) => x.rule);
}

/** First matching rule wins; nothing matched (no referrer, no UTM) is Direct. */
export function classifyChannel(
	input: ChannelInput,
	opts: { rules?: readonly ChannelRule[]; hosts?: HostLists } = {},
): ChannelResult {
	const i: Required<ChannelInput> = {
		refHost: input.refHost ? cleanHost(input.refHost) : null,
		utm: input.utm ?? {},
		clickIds: input.clickIds ?? [],
	};
	const hosts = opts.hosts ?? DEFAULT_HOSTS;
	const source = i.refHost || i.utm.utm_source || (Object.values(i.utm).some(Boolean) ? "(not set)" : "(direct)");
	for (const rule of opts.rules ?? BUILTIN_CHANNEL_RULES) {
		if (rule.any.some((c) => test(c, i, hosts))) return { channel: rule.channel, source };
	}
	return { channel: "Direct", source };
}

/** A referrer host that never starts a source: the site itself, built-in ignore list, or extra hosts. */
export function isIgnoredReferrer(host: string, siteHost: string | null | undefined, extra: readonly string[] = [], hosts: HostLists = DEFAULT_HOSTS): boolean {
	const h = cleanHost(host);
	return (!!siteHost && h === cleanHost(siteHost)) || hostInList(h, hosts.ignore) || hostInList(h, extra);
}
