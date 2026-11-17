import { boot, type ClientConfig } from "./boot.js";

/** Replaced by the served JSON configuration (`src/client/serve.ts`). */
declare const __CFG__: ClientConfig;

boot(window, __CFG__);
