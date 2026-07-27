# Zen View

[![test](https://github.com/dev-ansung/zen-view/actions/workflows/test.yml/badge.svg)](https://github.com/dev-ansung/zen-view/actions/workflows/test.yml)
[![Manifest](https://img.shields.io/badge/manifest-v3-blue)](manifest.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

A lightweight Chrome extension that turns any page - or just one element on
it - into a clean, readable, sanitized view. No account, no server, no
tracking: everything runs locally in the tab you're looking at.

## Features

- **One-click reading view** - strips ads, nav bars, trackers, and scripts,
  leaving just the article
- **Element targeting** - pick any block on the page (a table, a recipe
  card, a comment thread) and clean up just that
- **Consistent structure** - tables, code blocks, and lists always render the
  same way, regardless of how messy the source site's markup is
- **No build step** - vendored, dependency-free scripts; load it unpacked
  and go
- **Minimal permissions** - only `activeTab` and `scripting`; no
  `host_permissions`, no background activity, no data collection

## Install

> [!NOTE]
> Zen View isn't published on the Chrome Web Store yet - install it unpacked
> for now.

1. Clone this repository:
   ```sh
   git clone https://github.com/dev-ansung/zen-view.git
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `zen-view` directory
5. Pin the icon to your toolbar

## Usage

Click the Zen View icon on any page, then either:

- **Click an element** (a table, an article, a card) to clean up just that
  element, or
- **Press `Escape`** to clean up the whole page instead

While picking, the nearest block-level element under your cursor is
outlined - never a bare `<span>` or text node. Press `ArrowUp` to widen the
selection to the parent element if the guess is too narrow.

> [!TIP]
> On article pages, whole-page mode runs [Readability](#how-it-works) first
> to find the article automatically - you don't need to pick anything.

The toolbar badge flashes green on success, or red if something went wrong
(check the service worker console via `chrome://extensions` → Zen View →
"service worker" for details).

## How it works

Clicking the icon injects a handful of plain, vendored scripts into the
current tab via `chrome.scripting.executeScript` - no bundler, no build
step:

| File | Role |
|---|---|
| `vendor/purify.min.js` | [DOMPurify](https://github.com/cure53/DOMPurify) - strips scripts, inline handlers, and unsafe markup |
| `vendor/Readability.js` | [Mozilla Readability](https://github.com/mozilla/readability) - finds the main article on a page |
| `vendor/turndown.js` + `vendor/turndown-plugin-gfm.js` | [Turndown](https://github.com/mixmark-io/turndown) - converts HTML to Markdown, with GFM table support |
| `vendor/marked.js` | [marked](https://github.com/markedjs/marked) - renders the normalized Markdown back to HTML |
| `content/transform.js` | `zenTransform(root)` - the shared sanitize → Turndown → marked pipeline |
| `content/picker.js` | Hover-to-outline, click-to-confirm element picker |

Both whole-page and targeted modes funnel through the same `zenTransform`
pipeline, so their output always looks the same regardless of which mode
produced it:

```
root (document, or a picked element)
  -> Readability (whole-page mode only, finds the article)
  -> DOMPurify.sanitize()
  -> Turndown (HTML -> Markdown)
  -> marked (Markdown -> HTML)
  -> replace the page
```

Routing everything through a Markdown round-trip means a table is always the
*same* `<table>` markup and a code block is always the *same* fenced block,
no matter how different the source site's original HTML/CSS was - the
template only has to style one shape per construct.

> [!NOTE]
> If Readability can't identify an article, or only finds a thin fragment
> (under ~250 characters - a single teaser card on a homepage, say), Zen
> View falls back to sanitizing the full page body instead of rendering just
> that fragment.

See [`docs/web-clipper-comparison.md`](docs/web-clipper-comparison.md) and
[`docs/proposal-layout-consistency-and-targeting.md`](docs/proposal-layout-consistency-and-targeting.md)
for the design background behind the Markdown pipeline and the element
picker.

## Development

```sh
npm install   # dev-only deps, used for tests
npm test      # run the unit tests
```

`test/transform.test.js` and `test/picker.test.js` load the actual files
shipped by the extension - not the npm packages - through jsdom's internal
VM context, so a script that works in Node but breaks once vendored as a
plain global (a real failure mode this project has hit before) gets caught.
Fixtures cover article extraction, script/handler stripping, table and code
block normalization, the thin-teaser fallback, and the picker's
element-selection and Escape-to-whole-page behavior.

Tests cover the transform and picker logic; they don't replace loading the
unpacked extension and trying it on a real page (see [Install](#install)).

## Vendored dependencies

Zen View vendors a few libraries as plain scripts (see the table above)
instead of pulling them in through a bundler. Each file retains its
original license header: DOMPurify and Readability are Apache-2.0 / MPL-2.0;
Turndown, turndown-plugin-gfm, and marked are MIT.
