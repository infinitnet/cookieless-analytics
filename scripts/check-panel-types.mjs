// Type check of the editor panel export against the installed host admin package.
// A script, not a vitest case: the program needs more heap than a test worker has under the 512 MB cap.
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import ts from "typescript";

const emdashDir = realpathSync(resolve("node_modules/emdash"));
const hostRequire = createRequire(join(emdashDir, "package.json"));
const adminTypes = hostRequire.resolve("@emdash-cms/admin").replace(/index\.js$/, "index.d.ts");
const panels = resolve("src/admin/panels.ts");
const file = resolve("tests/.panel-typecheck.ts");
const source = `import type { PluginAdminModule } from ${JSON.stringify(adminTypes.replace(/\.d\.ts$/, ".js"))};
import { contentEditorPanels } from ${JSON.stringify(panels.replace(/\.ts$/, ".js"))};
export const mod: PluginAdminModule = { contentEditorPanels };`;
const cfg = ts.getParsedCommandLineOfConfigFile(resolve("tsconfig.admin.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const options = { ...(cfg?.options ?? {}), noEmit: true, skipLibCheck: true };
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host);
host.readFile = (f) => (resolve(f) === file ? source : read(f));
const exists = host.fileExists.bind(host);
host.fileExists = (f) => resolve(f) === file || exists(f);
const program = ts.createProgram([file], options, host);
const diags = ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
if (diags.length) {
	console.error(diags.join("\n"));
	process.exit(1);
}
console.log("panel types ok");
