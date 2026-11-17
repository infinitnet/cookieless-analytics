/** Per key, per isolate sliding window: approximate across isolates, documented in AGENTS.md. */
export function createRateLimiter(windowMs = 60_000) {
	const hits = new Map<string, number[]>();
	/** Records one request; returns 0 when allowed, else the seconds until a slot frees up. */
	return (id: string, limit: number, nowMs: number = Date.now()): number => {
		const list = (hits.get(id) ?? []).filter((t) => t > nowMs - windowMs);
		if (list.length >= limit) {
			hits.set(id, list);
			return Math.max(1, Math.ceil(((list[0] as number) + windowMs - nowMs) / 1000));
		}
		list.push(nowMs);
		hits.set(id, list);
		return 0;
	};
}
export type RateLimiter = ReturnType<typeof createRateLimiter>;
