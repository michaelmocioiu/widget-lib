// Dev-only entry (not part of the built widget bundle) -- lets `vite dev`
// render the widget directly for local iteration. Guarded on import.meta.env.DEV
// so the section stays hidden if this file is ever reached outside a dev server
// (e.g. the static index.html deployed to GitHub Pages).
import { createRoot } from "react-dom/client";
import { SnakeWidget } from "./SnakeWidget";
import "./Snake.module.css";

if (import.meta.env.DEV) {
  document.getElementById("dev-live-section")!.style.display = "";
  createRoot(document.getElementById("root")!).render(<SnakeWidget />);
}
