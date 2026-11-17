import {
	DEFAULT_COLLECT_PATH,
	DEFAULT_NAMESPACE,
	DEFAULT_SCRIPT_PATH,
	DEFAULT_SHARE_PATH,
	FORBIDDEN_PUBLIC_WORDS,
} from "./contract.js";

const RESERVED_PREFIXES = ["/_emdash", "/_astro", "/_image"];
const PATH_RE = /^\/[A-Za-z0-9._~\-/]{1,63}$/;
const NAMESPACE_RE = /^[A-Za-z_][A-Za-z0-9_]{1,15}$/;

/** True when the value contains none of the forbidden public words (case-insensitive). */
export function isNeutral(value: string): boolean {
	const v = value.toLowerCase();
	return !FORBIDDEN_PUBLIC_WORDS.some((w) => v.includes(w));
}

function normalizePublicPath(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const v = value.trim();
	if (!PATH_RE.test(v) || v.includes("//") || v.includes("/../") || v.endsWith("/..")) return fallback;
	const lower = v.toLowerCase();
	if (RESERVED_PREFIXES.some((p) => lower.startsWith(p))) return fallback;
	return isNeutral(v) ? v : fallback;
}

export function normalizeScriptPath(value: unknown): string {
	return normalizePublicPath(value, DEFAULT_SCRIPT_PATH);
}

export function normalizeCollectPath(value: unknown): string {
	return normalizePublicPath(value, DEFAULT_COLLECT_PATH);
}

/** Like the script path, with trailing slashes stripped first. */
export function normalizeSharePath(value: unknown): string {
	return normalizePublicPath(typeof value === "string" ? value.trim().replace(/\/+$/, "") : value, DEFAULT_SHARE_PATH);
}

export function normalizeNamespace(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_NAMESPACE;
	const v = value.trim();
	return NAMESPACE_RE.test(v) && isNeutral(v) ? v : DEFAULT_NAMESPACE;
}

export interface PublicNames {
	/** `window.<namespace>` */
	namespace: string;
	/** Pre-load queue `window.<namespace>q`. */
	queue: string;
	/** CustomEvent name fired when the window API is ready. */
	readyEvent: string;
	/** `data-ec-` for the default namespace. */
	attrPrefix: string;
	attrEvent: string;
	attrPropPrefix: string;
	attrIgnore: string;
}

/** Names derived from a (normalized) namespace: `__ec` gives `data-ec-event`, `__ecq`, `__ec:ready`. */
export function publicNames(namespace: string): PublicNames {
	const ns = normalizeNamespace(namespace);
	const slug = ns.replace(/^_+/, "").toLowerCase().replace(/_/g, "-") || "ec";
	const attrPrefix = `data-${slug}-`;
	return {
		namespace: ns,
		queue: `${ns}q`,
		readyEvent: `${ns}:ready`,
		attrPrefix,
		attrEvent: `${attrPrefix}event`,
		attrPropPrefix: `${attrPrefix}prop-`,
		attrIgnore: `${attrPrefix}ignore`,
	};
}
