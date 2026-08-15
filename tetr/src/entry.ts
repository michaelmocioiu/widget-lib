import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TetrWidget } from "./TetrWidget";
// Vite's `?inline` query returns the compiled CSS as a plain string instead
// of auto-injecting a <link>/<style> tag -- lets mount() inject it itself so
// the host page only needs one <script> tag, no separate stylesheet.
import css from "./Tetr.module.css?inline";

let styleInjected = false;

export interface TetrMountOptions {
  // Reserved for future options; unused today.
  [key: string]: unknown;
}

export interface TetrMountHandle {
  unmount: () => void;
}

function ensureStyleInjected() {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-tetr-versus-widget", "");
  style.textContent = css;
  document.head.appendChild(style);
  styleInjected = true;
}

export function mount(container: HTMLElement, _options: TetrMountOptions = {}): TetrMountHandle {
  ensureStyleInjected();
  const root: Root = createRoot(container);
  root.render(createElement(TetrWidget));
  return {
    unmount: () => root.unmount(),
  };
}

export function unmount(handle: TetrMountHandle) {
  handle.unmount();
}

declare global {
  interface Window {
    TetrVersus: { mount: typeof mount; unmount: typeof unmount };
  }
}

window.TetrVersus = { mount, unmount };
