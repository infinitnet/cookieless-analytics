let found: Promise<Record<string, unknown> | null> | undefined;

/**
 * The Worker's bindings, looked up once per isolate through `cloudflare:workers`. Null where that module does not
 * exist (Node, other hosts).
 */
export function workerEnv(): Promise<Record<string, unknown> | null> {
	return (found ??= (async () => {
		try {
			// Computed so Vite does not resolve it when this source runs under Node (tests); the package build folds it
			// back to the literal `import("cloudflare:workers")`, the form measured on a Worker. Node throws here: null.
			const id = "cloudflare:workers";
			const { env } = (await import(/* @vite-ignore */ id)) as { env?: Record<string, unknown> };
			return env ?? null;
		} catch {
			return null;
		}
	})());
}
