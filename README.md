# Zen View

A lightweight Chrome extension (Manifest V3). Click the toolbar icon to turn
the current page into a clean, readable, sanitized view - powered by
[Mozilla Readability](https://github.com/mozilla/readability) (article
extraction), [DOMPurify](https://github.com/cure53/DOMPurify) (sanitization),
and [Turndown](https://github.com/mixmark-io/turndown) +
[marked](https://github.com/markedjs/marked) (structure normalization).

## How it works

Clicking the icon injects six plain scripts into the current tab via
`chrome.scripting.executeScript` (no build step, no bundler):

1. `vendor/purify.min.js` - DOMPurify, vendored unmodified
2. `vendor/Readability.js` - Mozilla Readability, vendored unmodified
3. `vendor/turndown.js` - Turndown (HTML -> Markdown), vendored unmodified
4. `vendor/turndown-plugin-gfm.js` - GFM plugin (tables, strikethrough, task
   lists) for Turndown; re-wrapped as a plain global script since upstream
   only ships CJS/ES builds, no UMD - logic is unmodified
5. `vendor/marked.js` - Markdown -> HTML renderer, vendored unmodified
6. `content/transform.js` - clones the page, runs Readability to extract the
   article, sanitizes it with DOMPurify, normalizes it to Markdown via
   Turndown and back to HTML via marked, then replaces the page with a clean
   single-column view

The Markdown round-trip means structure (tables, fenced code blocks, lists,
blockquotes) always renders the same way regardless of the source site's
original HTML/CSS - the output HTML is always Turndown/marked-generated, not
arbitrary source markup, so the template only needs to style one known shape
per construct.

If Readability can't identify an article (e.g. a search results page), it
falls back to sanitizing the existing page body in place rather than failing.

Uses `activeTab` + `scripting` permissions only - no `host_permissions`, no
background scanning, no data collection.

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory
4. Visit any article page and click the Zen View icon in the toolbar

The badge flashes green (✓) on success or red (!) if something went wrong
(check the service worker console via `chrome://extensions` -> Zen View ->
"service worker" for errors).

## Example

**Before**: a news article page with a nav bar, sidebar, footer, ads, and
tracking scripts.

**After**: just the title and article body, in a readable single-column
layout, with all `<script>` tags and inline event handlers stripped.

## Development

```sh
npm install   # dev-only deps, used for tests
npm test      # runs unit tests against the sanitize+extract logic
```

`test/transform.test.js` exercises the same Readability + DOMPurify +
Turndown + marked pipeline used in `content/transform.js`, loading the
actual vendored files (not the npm packages) via jsdom's internal VM
context so the tests catch vendoring bugs, not just pipeline-logic bugs.
Fixtures cover nav/footer boilerplate, inline event handlers, a `<script>`
tag, a table, and a code block - verifying extraction keeps the article,
sanitization strips everything unsafe, and structure normalizes to uniform
Markdown-derived HTML regardless of source markup.

Tests cover the transform logic; they don't replace manually loading the
unpacked extension and clicking the icon on a real page (see Install above).
