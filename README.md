# widget-lib

A shared home for small, standalone, embeddable web widgets — games and
non-games alike. Hosted via GitHub Pages: one gallery landing page listing
every widget, plus each widget's built assets served directly so any other
site can embed one via a plain script tag:

```html
<div id="my-widget"></div>
<script src="https://michaelmocioiu.github.io/widget-lib/<name>/<name>.js"></script>
<script>
  window.<Name>.mount(document.getElementById("my-widget"));
</script>
```

## Layout

One folder per widget at the repo root (`snake/`, `tetr/`, ...), each its
own npm workspace package with its own `package.json`, `vite.config.ts`,
`src/`, and an `index.html` that doubles as the local dev/demo page and the
literal embed snippet to copy elsewhere.

No cross-widget imports — each widget's code is self-contained under its
own `src/`, copied in rather than shared via the workspace, so every widget
stays independently buildable, embeddable, and versionable. The workspace
only shares the *install* (one root `node_modules`, deduped across every
widget's React/Vite/TypeScript deps) — it does not share a build graph.

## Mount contract

Every widget attaches one global (`window.<Name>`) with a
`mount(container, options)` function that renders into a plain DOM element,
and an `unmount()` to clean up. No other globals, no assumptions about the
host page. This is the same contract the repo's own gallery page uses to
embed each widget live, so an awkward mount contract shows up immediately
in the gallery too.

## Status

No GitHub Pages deploy workflow or gallery landing page yet — each widget
folder is just committed here for now until that repo-wide infrastructure
gets built.
