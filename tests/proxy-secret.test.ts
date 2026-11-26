/** The proxy secret primitive: what is generated, what is stored, and that the stored hash is compared in constant time. */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real compare, observed: every check must go through it with the two hashes.
const compared: Array<[string, string]> = [];
vi.mock("../src/core/crypto.js", async (original) => {
	const real = await original<typeof import("../src/core/crypto.js")>();
	return {
		...real,
		timingSafeEqual: (a: string, b: string) => {
			compared.push([a, b]);
			return real.timingSafeEqual(a, b);
		},
	};
});

const { PROXY_HEADERS } = await import("../src/contract.js");
const { CLIENT_IP_HEADER, COUNTRY_HEADER, newProxySecret, PROXY_HASH_RE, PROXY_KEY_HEADER, proxySecretOk } = await import("../src/keys/proxy-secret.js");
const { generateToken, hashSecret } = await import("../src/keys/token.js");
const { ClientSiteSchema, siteView } = await import("../src/multisite/registry.js");

beforeEach(() => {
	compared.length = 0;
});

describe("proxy secret", () => {
	it("is 32 random bytes in base64url, stored as the hex SHA-256 the API keys use", async () => {
		const a = await newProxySecret();
		const b = await newProxySecret();
		expect(a.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(a.secret).not.toBe(b.secret);
		expect(a.hash).toMatch(PROXY_HASH_RE);
		expect(a.hash).toBe(await hashSecret(a.secret));
		// The same shape as the secret half of an API key token.
		expect(generateToken().secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("accepts only the secret behind the stored hash", async () => {
		const { secret, hash } = await newProxySecret();
		expect(await proxySecretOk(hash, secret)).toBe(true);
		expect(await proxySecretOk(hash, ` ${secret} `)).toBe(true);
		const other = (await newProxySecret()).secret;
		for (const header of [null, undefined, "", "nope", other, hash, secret.slice(1), `${secret}A`, `abcdefgh.${secret}`]) expect(await proxySecretOk(hash, header), String(header)).toBe(false);
		// No stored hash, or something that is not one: no secret matches, the right one included.
		for (const stored of [undefined, "", "0".repeat(64).slice(1), hash.toUpperCase()]) expect(await proxySecretOk(stored, secret), String(stored)).toBe(false);
		// The all-zero hash a site without a secret is compared against is not a way in.
		expect(await proxySecretOk(undefined, other)).toBe(false);
	});

	it("compares the hashes in constant time, also for a site without a secret, and never compares a malformed header", async () => {
		const { secret, hash } = await newProxySecret();
		const wrong = (await newProxySecret()).secret;
		await proxySecretOk(hash, secret);
		await proxySecretOk(hash, wrong);
		await proxySecretOk(undefined, wrong);
		expect(compared).toEqual([
			[hash, hash],
			[await hashSecret(wrong), hash],
			[await hashSecret(wrong), "0".repeat(64)],
		]);
		// Every compare is between two strings of one length, so the length check never decides.
		for (const [a, b] of compared) expect(a.length).toBe(b.length);
		compared.length = 0;
		await proxySecretOk(hash, "nope");
		await proxySecretOk(hash, null);
		expect(compared).toEqual([]);
	});

	it("names its headers as the contract module does", () => {
		expect(PROXY_HEADERS).toEqual({ key: "X-EC-Proxy-Key", clientIp: "X-EC-Client-IP", country: "X-EC-Country" });
		expect([PROXY_KEY_HEADER, CLIENT_IP_HEADER, COUNTRY_HEADER]).toEqual(Object.values(PROXY_HEADERS));
	});

	it("the site record takes a hash and a time, and the view of it drops the hash", async () => {
		const { hash } = await newProxySecret();
		const base = { id: "blog", label: "Blog", key: "k".repeat(20), hosts: ["blog.example.net"], created: 0 };
		const site = ClientSiteSchema.parse({ ...base, proxyHash: hash, proxyCreated: 5 });
		expect(site).toMatchObject({ proxyHash: hash, proxyCreated: 5 });
		expect(siteView(site)).toEqual({ ...base, gscProperty: "", bingSiteUrl: "", paused: false, proxyCreated: 5 });
		expect(ClientSiteSchema.safeParse({ ...base, proxyHash: "not a hash" }).success).toBe(false);
		expect(ClientSiteSchema.parse(base)).not.toHaveProperty("proxyHash");
	});
});
