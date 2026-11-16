/**
 * Editor sidebar panels, re-exported by the `./admin` entry as `contentEditorPanels`. `minRole` 40 is
 * Editor, the role that holds `plugins:read` (`@emdash-cms/auth`), so the panel never answers 403.
 */
import { TrafficPanel } from "./components/TrafficPanel.js";

export const EDITOR_ROLE = 40;

export const contentEditorPanels = [{ id: "traffic", title: "Traffic", component: TrafficPanel, minRole: EDITOR_ROLE, order: 50 }] as const;
