import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SnakeWidget } from "./SnakeWidget";
// Vite's `?inline` query returns the compiled CSS as a plain string instead
// of auto-injecting a <link>/<style> tag -- lets mount() inject it itself so
// the host page only needs one <script> tag, no separate stylesheet.
import css from "./Snake.module.css?inline";

let styleInjected = false;

export interface SnakeMountOptions {
  // Reserved for future options (e.g. theme); unused today.
  [key: string]: unknown;
}

export interface SnakeMountHandle {
  unmount: () => void;
}

function ensureStyleInjected() {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-nangame-snake", "");
  style.textContent = css;
  document.head.appendChild(style);
  styleInjected = true;
}

export function mount(container: HTMLElement, _options: SnakeMountOptions = {}): SnakeMountHandle {
  ensureStyleInjected();
  const root: Root = createRoot(container);
  root.render(createElement(SnakeWidget));
  return {
    unmount: () => root.unmount(),
  };
}

export function unmount(handle: SnakeMountHandle) {
  handle.unmount();
}

declare global {
  interface Window {
    NangameSnake: { mount: typeof mount; unmount: typeof unmount };
  }
}

window.NangameSnake = { mount, unmount };
