// Mounts one admin page of the real admin entry over the synthetic API (stub.js). `?page=/path&mode=light|dark`.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import * as admin from "../../../src/admin/index.tsx";
import Settings from "../../../src/admin/pages/Settings.tsx";
import { installStub } from "./stub.js";

const P = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-mode", P.get("mode") === "dark" ? "dark" : "light");
installStub();
const page = P.get("page") ?? "/";
history.replaceState(null, "", `/_emdash/admin/plugins/cookieless-analytics${page === "/" ? "" : page}?${P.get("q") ?? ""}`);
const comp = admin.pages[page] ?? (page === "/settings" ? Settings : null);
if (!comp) throw new Error(`No admin page ${page}; pages: ${Object.keys(admin.pages).join(", ")}`);
createRoot(document.getElementById("ca-mount")).render(createElement(comp));
