/** Pure share types and helpers. The admin bundle imports this file, never shares.ts, which reaches server only code. */
export const MAX_SHARE_LABEL = 40;

/** What the admin sees: never the hash or the verifier. */
export interface ShareView {
	id: string;
	site: string;
	dashboard: string;
	prefix: string;
	password: boolean;
	expires: number | null;
	expired: boolean;
	created: number;
	views: number;
	lastViewed: number | null;
	label?: string;
}

export type ShareState = "none" | "expired" | "password" | "open";
/** The state of one link; `stateRank` orders them from least to most permissive. */
export const shareState = (s: Pick<ShareView, "expired" | "password"> | null): ShareState => (!s ? "none" : s.expired ? "expired" : s.password ? "password" : "open");
const STATE_RANK: readonly ShareState[] = ["none", "expired", "password", "open"];
export const mostPermissive = (states: readonly ShareState[]): ShareState => states.reduce<ShareState>((a, b) => (STATE_RANK.indexOf(b) > STATE_RANK.indexOf(a) ? b : a), "none");

/** What `dashboards/list` returns per shared dashboard: link count, most permissive state, total views, and that link's label and expiry. */
export interface ShareSummary {
	count: number;
	state: ShareState;
	views: number;
	label?: string;
	expires: number | null;
}
