// Type check of the editor panel export against the installed host admin package.
// A script, not a vitest case: the program needs more heap than a test worker has under the 512 MB cap.
// It runs the tsc command line (TypeScript 7 has no programmatic compiler API) on a generated file and tsconfig.
import { spawnSync } from "node:child_process";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const emdashDir = realpathSync(resolve("node_modules/emdash"));
const hostRequire = createRequire(join(emdashDir, "package.json"));
const adminTypes = hostRequire.resolve("@emdash-cms/admin").replace(/index\.js$/, "index.d.ts");
const panels = resolve("src/admin/panels.ts");
const file = resolve("tests/.panel-typecheck.ts");
const config = resolve("tests/.panel-typecheck.tsconfig.json");
const source = `import type { PluginAdminModule } from ${JSON.stringify(adminTypes.replace(/\.d\.ts$/, ".js"))};
import { contentEditorPanels } from ${JSON.stringify(panels.replace(/\.ts$/, ".js"))};
export const mod: PluginAdminModule = { contentEditorPanels };`;
writeFileSync(file, source);
writeFileSync(config, JSON.stringify({ extends: resolve("tsconfig.admin.json"), compilerOptions: { noEmit: true, skipLibCheck: true }, include: [], files: [file] }));
try {
	const run = spawnSync(resolve("node_modules/.bin/tsc"), ["-p", config, "--pretty", "false"], { encoding: "utf8" });
	if (run.status !== 0) {
		console.error((run.stdout + run.stderr).trim());
		process.exit(1);
	}
	console.log("panel types ok");
} finally {
	rmSync(file, { force: true });
	rmSync(config, { force: true });
}
