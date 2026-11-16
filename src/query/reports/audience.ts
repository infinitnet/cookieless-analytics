import type { ReportCtx, RunInput } from "./base.js";
import { sessionBreakdown } from "./base.js";

const by = (col: string) => (rc: ReportCtx, input: RunInput) => sessionBreakdown(rc, input, `COALESCE(s.${col}, '(not set)')`);

export const countries = by("country");
export const regions = by("region");
export const devices = by("device");
export const browsers = by("browser");
export const os = by("os");
export const languages = by("lang");
