import { MiddlewareHandler } from "astro";

//#region src/middleware.d.ts
declare const onRequest: MiddlewareHandler;
//#endregion
export { onRequest };