# Zen View

A lightweight Chrome extension (Manifest V3). Click the toolbar icon to turn
the current page into a clean, readable, sanitized view - powered by
[Mozilla Readability](https://github.com/mozilla/readability) (article
extraction) and [DOMPurify](https://github.com/cure53/DOMPurify)
(sanitization).

## How it works

Clicking the icon injects three plain scripts into the current tab via
`chrome.scripting.executeScript` (no build step, no bundler):

1. `vendor/purify.min.js` - DOMPurify, vendored unmodified
2. `vendor/Readability.js` - Mozilla Readability, vendored unmodified
3. `content/transform.js` - clones the page, runs Readability to extract the
   article, sanitizes the result with DOMPurify, and replaces the page with a
   clean single-column view

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

`test/transform.test.js` exercises the same Readability + DOMPurify pipeline
used in `content/transform.js`, via jsdom, against fixture HTML with nav/
footer boilerplate, inline event handlers, and a `<script>` tag - verifying
extraction keeps the article and sanitization strips everything unsafe.

Tests cover the transform logic; they don't replace manually loading the
unpacked extension and clicking the icon on a real page (see Install above).
