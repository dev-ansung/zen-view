# zen-view vs. web-clipper

Reference: [webclipper/web-clipper](https://github.com/webclipper/web-clipper), cloned for study
at `artifacts/web-clipper` (not vendored source, see sandbox root README).

## Architecture at a glance

zen-view is a single-purpose reader-view extension: click the icon, the whole
page is replaced with a cleaned-up article view. web-clipper is a much larger
clip-and-send tool: multiple clip modes, ~20 pluggable note-taking backends
(Notion, Obsidian, Yuque, GitHub, OneNote, etc.), a toolbar UI injected as an
iframe, and a Markdown-first pipeline for sending clips to external services.
Its extension-specific logic lives in three webpack entry points
(`background.worker.ts`, `content_script.main.ts`, `tool.main.chrome.ts`),
with element-picking and area-selection factored out into separate published
packages (`@web-clipper/highlight`, `@web-clipper/area-selector`) that are
not part of the main repo checkout.

## 1. Targeting a specific element/component

zen-view has no targeting: `content/transform.js` always clones the entire
`document` and runs Readability's whole-document heuristic. There's no way
to say "just this section."

web-clipper solves this with **interactive DOM-node picking**, implemented
as one of several mutually-exclusive clip modes under
`src/extensions/extensions/`:

- **Manual selection** (`select.ts`) - calls `new Highlighter().start()`,
  which hover-highlights elements on the live page and resolves with the
  one the user clicks. The picked node is cloned (`$(data).clone()`,
  preserving tags/classes/nesting) and converted to Markdown.
- **Delete element** (`extensions/remove.ts`) - reuses the same
  `Highlighter` picker, but removes the picked node instead of extracting
  it - useful for stripping ads/popups before clipping.
- **Screenshot** (`screenshot.ts`) - a different picker, `AreaSelector`,
  lets the user drag a rectangle; the region is cropped from
  `captureVisibleTab()` via `<canvas>` and uploaded as an image.
- **Text selection** (`contextMenus/saveSelection/`) - a right-click context
  menu entry that clips `document.getSelection()` directly, independent of
  any element picker.

The picker toggles the extension's own toolbar iframe off first
(`toggleClipper()`) so the UI doesn't select itself. The actual
hover/click-highlight and CSS-selector-generation logic lives in the
external `@web-clipper/highlight` / `@web-clipper/area-selector` packages,
not in this repo.

**Takeaway for zen-view**: element targeting would need a similar
interactive picker layered in front of the transform - e.g. inject a
hover-highlight overlay, capture the clicked element, and run Readability
or DOMPurify scoped to that subtree instead of `document`.

## 2. Structure preservation

zen-view's pipeline is:

```
document -> Readability (whole-doc extraction) -> DOMPurify-sanitized HTML -> replace page
```

This flattens everything into one simplified reading template. Original
tags/classes/layout are discarded; only what Readability judges to be
"the article" survives, re-rendered in zen-view's own minimal style.

web-clipper's pipeline is fundamentally different - it targets Markdown,
not a re-rendered page:

```
DOM subtree (whole-page / readability-extracted / picked / selected)
  -> Turndown (HTML -> Markdown)
  -> send to external note service
```

Key differences:
- Every mode ends in `turndownService.turndown(...)` (`contentScript.ts`),
  configured with `codeBlockStyle: 'fenced'` and GFM plugins, so headings,
  lists, tables, and fenced code blocks map to structural Markdown rather
  than being flattened to plain text.
- Even its Readability mode uses a fork (`@web-clipper/readability`) with
  `keepClasses: true`, then still serializes to Markdown - so "readability
  mode" there produces a document for pasting elsewhere, not an in-page
  replacement like zen-view's.
- No computed-style inlining, no iframe capture - visual styling isn't
  preserved, only structural HTML-to-Markdown mapping.
- Images aren't embedded as data URIs; they're re-uploaded to a
  user-configured image host and referenced by URL in the Markdown
  (`![](url)`). Data URIs only appear transiently in screenshot mode, as a
  transport step before upload.
- No DOMPurify/sanitization step is used anywhere - unnecessary since the
  output is Markdown text, not HTML re-injected into a page.

**Takeaway for zen-view**: "preserving structure" in web-clipper means
faithful HTML-to-Markdown structural mapping (tables, code fences, lists),
not raw-DOM cloning and not Readability-style flattening. If zen-view ever
needed richer structure than its current flattened template, adopting a
Turndown-style HTML->Markdown (or HTML->semantic-HTML, preserving
tag/attribute fidelity) pass instead of a fixed template would be the
comparable move - though that's a different goal from zen-view's current
"replace this page with a clean reading view" scope.
