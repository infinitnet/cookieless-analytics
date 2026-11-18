import { r as PluginOptions } from "./config-C1DAdsvs.mjs";
import { PluginContext, PluginDescriptor } from "emdash";
/** The cron task that continues a job; scheduled while a job is active, cancelled when none is. */
declare const MOVE_CRON = "move";
/**
 * One-shot continuation names. The host deletes a finished one-shot row by id and `schedule()` upserts
 * the same `(plugin, name)` row (`plugins/cron.ts`), so a continuation that rescheduled its own name
 * would be deleted on return; a continuation therefore schedules the other name.
 */
declare const CONTINUE_JOBS: readonly ["search-continue", "search-continue-next"];
/** Capabilities: the head script via `page:fragments`, content reads for annotations, scheduled dashboard email through the host provider, schema reads for the collection report, outbound calls to the Search providers. */
declare const CAPABILITIES: readonly ["hooks.page-fragments:register", "content:read", "email:send", "network:request", "schema:read"];
/** Exact hosts `ctx.http` may reach for Search; never a wildcard. Remote satellites add their hostnames. */
declare const ALLOWED_HOSTS: readonly ["oauth2.googleapis.com", "www.googleapis.com", "ssl.bing.com", "www.bing.com"];
/** Config collections. Composite indexes are runtime-only; the descriptor carries flat ones. */
declare const STORAGE: {
  goals: {
    indexes: (string | string[])[];
  };
  funnels: {
    indexes: string[];
  };
  segments: {
    indexes: string[];
  };
  channel_rules: {
    indexes: (string | string[])[];
  };
  agent_rules: {
    indexes: (string | string[])[];
  };
  annotations: {
    indexes: (string | string[])[];
  };
  api_keys: {
    indexes: string[];
  };
  sites: {
    indexes: string[];
  };
  dashboards: {
    indexes: string[];
  };
  shares: {
    indexes: string[];
  };
};
/**
 * Admin pages; each path is a key of `pages` in `src/admin/index.tsx`. Icon names resolve in the host nav icon map.
 * `group` puts the eleven pages in one sidebar folder "Analytics".
 */
declare const ADMIN_PAGES: readonly [{
  readonly path: "/";
  readonly label: "Overview";
  readonly icon: "chart-line";
  readonly group: "Analytics";
}, {
  readonly path: "/dashboards";
  readonly label: "Dashboards";
  readonly icon: "dashboard";
  readonly group: "Analytics";
}, {
  readonly path: "/pages";
  readonly label: "Pages";
  readonly icon: "file";
  readonly group: "Analytics";
}, {
  readonly path: "/satisfaction";
  readonly label: "Search Satisfaction";
  readonly icon: "star";
  readonly group: "Analytics";
}, {
  readonly path: "/sources";
  readonly label: "Sources";
  readonly icon: "link";
  readonly group: "Analytics";
}, {
  readonly path: "/audience";
  readonly label: "Audience";
  readonly icon: "users";
  readonly group: "Analytics";
}, {
  readonly path: "/behaviour";
  readonly label: "Behaviour";
  readonly icon: "list";
  readonly group: "Analytics";
}, {
  readonly path: "/revenue";
  readonly label: "Revenue";
  readonly icon: "coins";
  readonly group: "Analytics";
}, {
  readonly path: "/links";
  readonly label: "Links";
  readonly icon: "tag";
  readonly group: "Analytics";
}, {
  readonly path: "/annotations";
  readonly label: "Annotations";
  readonly icon: "calendar";
  readonly group: "Analytics";
}, {
  readonly path: "/search";
  readonly label: "Search";
  readonly icon: "search";
  readonly group: "Analytics";
}, {
  readonly path: "/config";
  readonly label: "Definitions";
  readonly icon: "book";
  readonly group: "Analytics";
}, {
  readonly path: "/data";
  readonly label: "Data";
  readonly icon: "database";
  readonly group: "Analytics";
}, {
  readonly path: "/settings";
  readonly label: "Settings";
  readonly icon: "settings";
  readonly group: "Analytics";
}];
/** Dashboard widgets; ids match the `widgets` map of the admin entry. */
declare const ADMIN_WIDGETS: readonly [{
  readonly id: "today";
  readonly title: "Cookieless Analytics";
  readonly size: "third";
}];
/**
 * Product labels where the host shows no plugin name. `displayName` and `description` are typed on
 * the descriptor and on `definePlugin` from EmDash 1.5.0; 1.4.0 ignores them (docs/design-notes.md).
 */
declare const PLUGIN_LABELS: {
  readonly displayName: "Cookieless Analytics by Infinitnet";
  readonly description: "Cookieless Analytics by Infinitnet is a self-hosted, cookieless web analytics plugin for EmDash CMS with real sessions, no cookies and a page script of about 2.7 KB gzipped.";
};
/**
 * `options.sites`: remote satellites; `options.database`: the D1 or Hyperdrive binding of an own analytics database;
 * `options.databases`: site routing, each listed site's analytics tables in its own binding. `engine: "postgres"`
 * in either loads the runtime entry `/postgres`, the one that carries the node-postgres driver.
 * Validated here so a bad `astro.config` fails the build.
 */
declare function cookielessAnalytics(options?: PluginOptions): PluginDescriptor<PluginOptions>;
/** Event of the host `cron` hook (`CronEvent` in `plugins/types.ts`, not exported from the package root). */
interface CronEvent {
  name: string;
  data?: Record<string, unknown>;
  scheduledAt: string;
}
/** Cron jobs and their schedules. The host Cron Trigger cadence bounds how often they run. */
declare const CRON_JOBS: {
  readonly rollup: "*/30 * * * *";
  readonly retention: "17 * * * *";
  readonly salts: "5 0 * * *";
  readonly search: "7 */1 * * *";
  readonly revenue: "25,55 * * * *";
  readonly mail: "15,35,45 * * * *";
};
/** Job names the `cron` hook handles: the schedules plus the one-shot Search continuation. */
type CronJob = keyof typeof CRON_JOBS | (typeof CONTINUE_JOBS)[number] | typeof MOVE_CRON;
/** The `cron` hook timeout; the host default is 5000 ms (`plugins/define-plugin.ts`). */
declare const CRON_TIMEOUT_MS = 55000;
type CronCtx = Pick<PluginContext, "kv" | "storage" | "log" | "cron" | "http"> & Partial<Pick<PluginContext, "email" | "site">>;
/**
 * Tasks that spend a request budget. The host runs every due task of a tick in one invocation, one after another,
 * and the platform's queries per invocation (Workers Free: 50) are shared by all of them; so one invocation runs at
 * most one of these. With a per-minute trigger the schedules never make two of them due together; with a coarser one
 * (`*\/15`), a task that finds the invocation taken is owed a turn (`cron:owed`), and the next invocation's task
 * hands its turn to the task owed longest, in order. `salts` (KV only) always runs.
 */
declare const HEAVY_JOBS: ReadonlySet<string>;
declare const KV_CRON_OWED = "cron:owed";
/** A heavy task that starts this soon after the last one ended runs in the same invocation (tasks of a tick follow each other at once; ticks are a minute apart). */
declare const SAME_INVOCATION_MS = 5000;
/** Turn state requests per heavy run: the owed read and, when it changed, its write. Taken from the run's budget. */
declare const TURN_REQUESTS = 2;
/** `cron` hook body: one handler per job name; unknown names are logged and ignored. */
declare function cronDispatcher(handlers: Record<CronJob, (ctx: CronCtx, event: CronEvent) => Promise<unknown>>): (event: CronEvent, ctx: CronCtx) => Promise<void>;
/** Forget the turn state of this isolate (tests). */
declare function resetCronTurns(): void;
/** Create missing or changed schedule rows. `plugin:activate` runs only on first install, so admin routes also call this once per isolate. */
declare function ensureCron(ctx: Pick<PluginContext, "cron">): Promise<void>;
declare function createPlugin(options?: PluginOptions): import("emdash").ResolvedPlugin<{
  goals: {
    indexes: (string | string[])[];
  };
  funnels: {
    indexes: string[];
  };
  segments: {
    indexes: string[];
  };
  channel_rules: {
    indexes: (string | string[])[];
  };
  agent_rules: {
    indexes: (string | string[])[];
  };
  annotations: {
    indexes: (string | string[])[];
  };
  api_keys: {
    indexes: string[];
  };
  sites: {
    indexes: string[];
  };
  dashboards: {
    indexes: string[];
  };
  shares: {
    indexes: string[];
  };
}>;
export { cronDispatcher as _, CRON_JOBS as a, CronJob as c, PLUGIN_LABELS as d, SAME_INVOCATION_MS as f, createPlugin as g, cookielessAnalytics as h, CAPABILITIES as i, HEAVY_JOBS as l, TURN_REQUESTS as m, ADMIN_WIDGETS as n, CRON_TIMEOUT_MS as o, STORAGE as p, ALLOWED_HOSTS as r, CronEvent as s, ADMIN_PAGES as t, KV_CRON_OWED as u, ensureCron as v, resetCronTurns as y };