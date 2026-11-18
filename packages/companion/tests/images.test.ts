import { describe, expect, it } from "vitest";

import manifestSrc from "../emdash-plugin.jsonc?raw";

// The listing images as data URLs; the tests run in workerd, so vite reads the files.
const IMAGES = import.meta.glob<string>("../images/*", { query: "?inline", import: "default", eager: true });

const MIB = 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytesOf(path: string): Uint8Array {
	const url = IMAGES[`../${path}`];
	if (!url) throw new Error(`${path} is missing`);
	const bin = atob(url.slice(url.indexOf(",") + 1));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Width and height from the IHDR chunk, which always follows the signature. */
function pngSize(b: Uint8Array): { width: number; height: number } {
	expect([...b.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	return { width: v.getUint32(16), height: v.getUint32(20) };
}

const artifactFiles = [...manifestSrc.matchAll(/"file":\s*"([^"]+)"/g)].map((m) => m[1] as string);

describe("listing images", () => {
	it("the manifest lists the icon and four screenshots, and every path exists", () => {
		expect(artifactFiles).toEqual([
			"images/icon.png",
			"images/screenshot-1.png",
			"images/screenshot-2.png",
			"images/screenshot-3.png",
			"images/screenshot-4.png",
		]);
		for (const f of artifactFiles) expect(IMAGES[`../${f}`], f).toBeDefined();
	});

	it("the icon is a 256 x 256 PNG under 20 KB", () => {
		const b = bytesOf("images/icon.png");
		expect(pngSize(b)).toEqual({ width: 256, height: 256 });
		expect(b.length).toBeLessThan(20 * 1024);
	});

	it.each([1, 2, 3, 4])("screenshot %i is a 1440 x 900 PNG under 1 MiB", (n) => {
		const b = bytesOf(`images/screenshot-${n}.png`);
		expect(pngSize(b)).toEqual({ width: 1440, height: 900 });
		expect(b.length).toBeLessThan(MIB);
	});
});
