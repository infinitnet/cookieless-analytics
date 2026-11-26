/**
 * Proxy secret of a client site: the one credential of the event route's proxy mode. A server proxy on the site's
 * own host sends it in `X-EC-Proxy-Key`; only then does the route read the visitor's address from the proxy.
 * The secret is 32 random bytes in base64url, shown once when it is made. The site record keeps only its hex
 * SHA-256 (`hashSecret`, as for API keys), so a check costs one hash and no storage read: the record is already
 * in the sites registry snapshot.
 */
import { PROXY_HEADERS } from "../contract.js";
import { base64url, timingSafeEqual } from "../core/crypto.js";
import { hashSecret } from "./token.js";

/** Request header that carries the secret. The event path's preflight never allows it, so a browser cannot send it. */
export const PROXY_KEY_HEADER = PROXY_HEADERS.key;
/** The visitor's address as the proxy saw it: one IPv4 or IPv6 address. */
export const CLIENT_IP_HEADER = PROXY_HEADERS.clientIp;
/** The visitor's country, two letters, when the proxy knows it. */
export const COUNTRY_HEADER = PROXY_HEADERS.country;

const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
/** Stored form: lowercase hex SHA-256. */
export const PROXY_HASH_RE = /^[0-9a-f]{64}$/;
/** Compared against when a site has no secret, so that answer takes the same work as a wrong secret. */
const NO_HASH = "0".repeat(64);

/** A new secret and the hash to store. */
export async function newProxySecret(): Promise<{ secret: string; hash: string }> {
	const secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
	return { secret, hash: await hashSecret(secret) };
}

/**
 * True when `header` is the secret behind `stored`. A missing or malformed header, a site without a secret and
 * a wrong secret are all false; the hashes are compared in constant time.
 */
export async function proxySecretOk(stored: string | undefined, header: string | null | undefined): Promise<boolean> {
	const secret = header?.trim() ?? "";
	if (!SECRET_RE.test(secret)) return false;
	const hash = await hashSecret(secret);
	const known = stored !== undefined && PROXY_HASH_RE.test(stored);
	return timingSafeEqual(hash, known ? stored : NO_HASH) && known;
}
