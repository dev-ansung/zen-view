# Zen View

A lightweight Chrome extension (Manifest V3). Click the toolbar icon to pick
an element on the page - or press Escape to use the whole page instead - and
turn it into a clean, readable, sanitized view, powered by
[Mozilla Readability](https://github.com/mozilla/readability) (article
extraction), [DOMPurify](https://github.com/cure53/DOMPurify) (sanitization),
and [Turndown](https://github.com/mixmark-io/turndown) +
[marked](https://github.com/markedjs/marked) (structure normalization).

## How it works

Clicking the icon injects seven plain scripts into the current tab via
`chrome.scripting.executeScript` (no build step, no bundler):

1. `vendor/purify.min.js` - DOMPurify, vendored unmodified
2. `vendor/Readability.js` - Mozilla Readability, vendored unmodified
3. `vendor/turndown.js` - Turndown (HTML -> Markdown), vendored unmodified
4. `vendor/turndown-plugin-gfm.js` - GFM plugin (tables, strikethrough, task
   lists) for Turndown; re-wrapped as a plain global script since upstream
   only ships CJS/ES builds, no UMD - logic is unmodified
5. `vendor/marked.js` - Markdown -> HTML renderer, vendored unmodified
6. `content/transform.js` - defines `zenTransform(root)`: sanitizes `root`
   with DOMPurify, normalizes it to Markdown via Turndown and back to HTML
   via marked, then replaces the page with a clean single-column view.
   `root === document` runs Readability first to find the article; a picked
   element skips Readability and uses the element's own markup directly.
7. `content/picker.js` - enters picking mode: hovering the page outlines the
   nearest block-level ancestor of the cursor (a whole `<table>`, `<ul>`,
   `<blockquote>`, etc, never a bare leaf node like a `<span>`), clicking
   confirms it and calls `zenTransform(pickedElement)`, and pressing
   **Escape** cancels picking and calls `zenTransform(document)` instead
   (today's original whole-page behavior). Press **ArrowUp** while hovering
   to widen the selection to the parent element if the guessed block is too
   narrow.

The Markdown round-trip means structure (tables, fenced code blocks, lists,
blockquotes) always renders the same way regardless of the source site's
original HTML/CSS - the output HTML is always Turndown/marked-generated, not
arbitrary source markup, so the template only needs to style one known shape
per construct. Both whole-page and picked-element modes share this same
`zenTransform` pipeline, so their output is visually consistent.

If Readability can't identify an article, or only finds a thin fragment
(under ~250 characters of text - e.g. a single teaser card on a homepage or
listing page), it falls back to sanitizing the existing page body in place
rather than rendering just that fragment.

Uses `activeTab` + `scripting` permissions only - no `host_permissions`, no
background scanning, no data collection.

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory
4. Visit any page and click the Zen View icon in the toolbar, then either
   click an element to target it or press Escape for the whole page

The badge flashes green (✓) on success or red (!) if something went wrong
(check the service worker console via `chrome://extensions` -> Zen View ->
"service worker" for errors).

## Example

**Before**: a news article page with a nav bar, sidebar, footer, ads, and
tracking scripts.

**After**: just the title and article body (whole page) or just the picked
element (targeting mode), in a readable single-column layout, with all
`<script>` tags and inline event handlers stripped.

## Development

```sh
npm install   # dev-only deps, used for tests
npm test      # runs unit tests against the sanitize+extract logic
```

`test/transform.test.js` and `test/picker.test.js` load the actual files
shipped by the extension (`content/transform.js`, `content/picker.js`, and
the vendored libraries, not the npm packages) via jsdom's internal VM
context, so the tests catch vendoring bugs, not just pipeline-logic bugs.
Fixtures cover nav/footer boilerplate, inline event handlers, a `<script>`
tag, a table, a code block, a thin-teaser listing page, and the picker's
element-selection and Escape-fallback behavior.

Tests cover the transform and picker logic; they don't replace manually
loading the unpacked extension and clicking the icon on a real page (see
Install above).
