// Dev-only entry (not part of the built widget bundle) -- lets `vite dev`
// render the widget directly for local iteration.
import { createRoot } from "react-dom/client";
import { SnakeWidget } from "./SnakeWidget";
import "./Snake.module.css";

createRoot(document.getElementById("root")!).render(<SnakeWidget />);
