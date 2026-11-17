// Admin entry (`./admin`), compiled by the host. `pages` keys match `ADMIN_PAGES` and `widgets` keys `ADMIN_WIDGETS` in `src/index.ts`.
import Annotations from "./pages/Annotations.js";
import Audience from "./pages/Audience.js";
import Behaviour from "./pages/Behaviour.js";
import Config from "./pages/Config.js";
import Dashboards from "./pages/Dashboards.js";
import Data from "./pages/Data.js";
import Links from "./pages/Links.js";
import Overview from "./pages/Overview.js";
import Pages from "./pages/Pages.js";
import Revenue from "./pages/Revenue.js";
import Satisfaction from "./pages/Satisfaction.js";
import Search from "./pages/Search.js";
import Settings from "./pages/Settings.js";
import Sources from "./pages/Sources.js";
import TodayWidget from "./widget.js";
import { injectStyles } from "./styles.js";

// The one admin stylesheet, added once when the host loads this entry.
injectStyles();

export const pages = { "/": Overview, "/dashboards": Dashboards, "/pages": Pages, "/satisfaction": Satisfaction, "/sources": Sources, "/audience": Audience, "/behaviour": Behaviour, "/revenue": Revenue, "/links": Links, "/annotations": Annotations, "/search": Search, "/config": Config, "/data": Data, "/settings": Settings };
export const widgets = { today: TodayWidget };
export { contentEditorPanels } from "./panels.js";
