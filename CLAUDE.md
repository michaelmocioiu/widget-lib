# Environment notes

- `chromium-cli` and `playwright` are NOT available in this environment. Do not attempt
  browser-driven visual verification (screenshots, headless Chromium, Playwright) of the
  widgets here — it will not work and wastes time. Verify changes via `tsc -b`, `vite build`,
  and reading the code/CSS instead. If the user wants a visual check, ask them to run the
  dev server locally and look themselves.
