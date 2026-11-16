#!/usr/bin/env node
// Publishes docs/wiki to the GitHub wiki of the repository: clones `<repo>.wiki.git` into a temp dir, replaces its
// files with docs/wiki, commits as Infinitnet and pushes. The wiki git repo exists only after the wiki is enabled
// and one page was saved in the GitHub UI.
//
// Usage: node scripts/publish-wiki.mjs [--dry-run]
//   GITHUB_TOKEN       token with contents write access (in Actions: the default token); absent uses your git credentials
//   GITHUB_REPOSITORY  owner/name; default from package.json `repository.url`
//   WIKI_REMOTE        full clone URL, overrides the two above (tests use a local bare repo)
//   --dry-run          commit in the temp clone, print what would change, do not push
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry-run");
const repo =
	process.env.GITHUB_REPOSITORY ||
	JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
		.repository.url.replace(/^git\+/, "")
		.replace(/^https:\/\/github\.com\//, "")
		.replace(/\.git$/, "");
const token = process.env.GITHUB_TOKEN;
const remote = process.env.WIKI_REMOTE || `https://${token ? `x-access-token:${token}@` : ""}github.com/${repo}.wiki.git`;
const shown = remote.replace(/\/\/[^@/]*@/, "//***@");

const dir = mkdtempSync(join(tmpdir(), "wiki-"));
const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
try {
	console.log(`Cloning ${shown}`);
	execFileSync("git", ["clone", "--quiet", "--depth", "1", remote, dir], { stdio: ["ignore", "inherit", "inherit"] });
	// A mirror: pages removed from docs/wiki are removed from the wiki too.
	for (const f of readdirSync(dir)) if (f !== ".git") rmSync(join(dir, f), { recursive: true, force: true });
	cpSync(join(root, "docs/wiki"), dir, { recursive: true });
	git("add", "-A");
	const changed = git("status", "--porcelain").trim();
	if (!changed) {
		console.log("The wiki is up to date.");
	} else {
		const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
		const email = process.env.WIKI_GIT_EMAIL || "infinitnet@users.noreply.github.com";
		git("-c", "user.name=Infinitnet", "-c", `user.email=${email}`, "commit", "--quiet", "-m", `Update from docs/wiki at ${sha}`);
		console.log(changed);
		if (dry) console.log("Dry run: not pushed.");
		else {
			git("push", "--quiet", "origin", "HEAD");
			console.log(`Pushed to ${shown}`);
		}
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}
