/** API key tokens: `<8 char prefix>.<secret>`, the secret is 32 random bytes in base64url. */
import { base64url, randomId, sha256 } from "../core/crypto.js";

const TOKEN_RE = /^([a-z0-9]{8})\.([A-Za-z0-9_-]{43})$/;

export function generateToken(): { prefix: string; secret: string; token: string } {
	const prefix = randomId(8);
	const secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
	return { prefix, secret, token: `${prefix}.${secret}` };
}

/** Prefix and secret of a well formed token, else null. */
export function parseToken(raw: string | null | undefined): { prefix: string; secret: string } | null {
	const m = TOKEN_RE.exec(raw?.trim() ?? "");
	return m ? { prefix: m[1] as string, secret: m[2] as string } : null;
}

/** Hex SHA-256 of the secret; 256 bits of entropy make a slow or salted hash unnecessary. */
export async function hashSecret(secret: string): Promise<string> {
	return [...(await sha256(secret))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
