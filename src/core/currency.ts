/**
 * ISO 4217 currencies and money formatting. Pure: shared by the server, the admin
 * bundle, the share renderer and the email renderer. No `Intl`, so every runtime prints the same text.
 */
import data from "../data/currencies.json";

export interface Currency {
	code: string;
	/** Minor unit exponent: 0, 2 or 3. */
	exp: 0 | 2 | 3;
	name: string;
}

export const CURRENCIES = data as readonly Currency[];
const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const REVENUE_MAX_VALUE = 1_000_000_000;
export const REVENUE_MAX_OID = 64;
export const MAX_CURRENCIES_LISTED = 5;

/** An uppercase code on the embedded list. */
export const isCurrency = (code: unknown): code is string => typeof code === "string" && BY_CODE.has(code);

/** Trim, uppercase, three letters, listed; anything else is null (never a fallback). */
export function normalizeCurrency(input: unknown): string | null {
	if (typeof input !== "string") return null;
	const c = input.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(c) && BY_CODE.has(c) ? c : null;
}

/** Minor unit exponent of a code; 2 for an unknown code. */
export const exponent = (code: string): number => BY_CODE.get(code)?.exp ?? 2;

/** Round half away from zero to the currency's minor unit. `toPrecision(15)` absorbs binary drift (1.005 * 100). */
export function roundMinor(value: number, code: string): number {
	const f = 10 ** exponent(code);
	const r = Math.round(Number((Math.abs(value) * f).toPrecision(15))) / f;
	return value < 0 ? -r : r;
}

/** `1,234.50 USD`, `1,235 JPY`: grouped integer part, the minor unit digits, a space and the code. */
export function formatAmount(value: number, code: string): string {
	const e = exponent(code);
	const fixed = Math.abs(roundMinor(value, code)).toFixed(e);
	const [int = "0", frac] = fixed.split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${value < 0 && Number(fixed) !== 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""} ${code}`;
}
