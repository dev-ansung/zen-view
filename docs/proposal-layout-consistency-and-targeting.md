# Proposal: Layout Consistency + Targeting Mode

Follow-up to [web-clipper-comparison.md](./web-clipper-comparison.md). That doc
identified two capabilities web-clipper has that zen-view doesn't:
element/component targeting, and structure-preserving output. This doc scopes
what each would take to add to zen-view, without changing its core premise
(replace the current page with a clean, read-in-place view - not export to
Markdown/an external service, which is web-clipper's model).

## Current pipeline (baseline)

`content/transform.js` today:

```
document -> Readability.parse() (whole document) -> DOMPurify.sanitize()
  -> hardcoded template (fixed font/width/color, <h1>title + body)
```

Both proposed features change this pipeline at different points: targeting
changes the *input* (what subtree gets processed), layout consistency changes
the *output* (what template wraps the result).

---

## Feature 1: Layout consistency

**What "layout consistency" means here**, matching web-clipper's actual
mechanism (per web-clipper-comparison.md): structure is preserved by
normalizing the extracted HTML into semantic Markdown constructs - a table
becomes a Markdown table, a code block becomes a fenced code block, a list
stays a list - rather than trusting whatever heterogeneous HTML/CSS classes
the source site happened to use. That normalization step is exactly what
zen-view is missing today. Right now `content/transform.js` keeps
Readability's raw extracted HTML as-is (`article.content`, source markup and
whatever classes survive DOMPurify's default allow-list) and drops it into a
single fixed template - so a table on one site and a table on another can
render with completely different embedded markup/attributes, and zen-view's
template CSS has to either guess at every site's HTML conventions or ignore
them. Passing everything through a Markdown round-trip removes that
variance: no matter what the source HTML looked like, the output is always
the same, small set of Markdown-equivalent constructs, styled once.

### What's needed

1. **Vendor a Turndown-equivalent HTML-to-Markdown converter.** The
   `turndown` npm package ships a plain UMD browser build
   (`turndown/dist/turndown.js`), the same vendoring pattern already used for
   DOMPurify and Readability - copy it into `vendor/turndown.js`, no bundler
   needed. Add `turndown` as a dev dependency in `zen-view/package.json` (for
   tests) and vendor the browser build for the extension runtime, matching
   how `dompurify`/`@mozilla/readability` are already handled.

2. **Insert a Markdown normalization step between Readability and the
   template.** New pipeline:
   ```
   document -> Readability.parse() -> DOMPurify.sanitize(article.content)
     -> TurndownService().turndown(sanitizedHtml)   // HTML -> Markdown
     -> a Markdown renderer                          // Markdown -> HTML for display
     -> template
   ```
   Sanitizing *before* the Markdown conversion (not after) matters: DOMPurify
   needs to run on raw HTML, and Turndown needs clean input to map
   correctly - converting first then sanitizing the resulting rendered HTML
   would be redundant work in the wrong order.

3. **Render the normalized Markdown back to HTML for display.** Unlike
   web-clipper (which stops at Markdown and hands it to an external note
   service), zen-view still needs to *render* something in the tab. This
   needs a minimal Markdown renderer - vendoring `marked` or `snarkdown`
   (both ship as small, dependency-free UMD/plain-script builds) the same
   way. This produces uniform HTML: every table is the same `<table>` markup
   regardless of source site, every code block is the same
   `<pre><code class="language-x">` shape.

4. **Style the normalized output once.** Because the HTML is now always
   Turndown/renderer-generated (not arbitrary source HTML), the template CSS
   only needs to handle one known shape per construct - not every site's
   variant:
   ```css
   table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
   th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
   pre { background: #f4f4f4; padding: 1em; overflow-x: auto; border-radius: 4px; }
   code { font-family: ui-monospace, monospace; }
   blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555; }
   ```

5. **Configure Turndown to match web-clipper's choices where they make
   sense for zen-view**: `codeBlockStyle: 'fenced'` (preserves language tags
   on code fences) and a GFM plugin (`turndown-plugin-gfm`, also a plain
   script, also vendorable) for table support - Turndown's core doesn't
   handle tables without it, which is why web-clipper depends on the GFM
   plugin too.

6. **What's explicitly out of scope**: syntax highlighting (the source
   page's highlighting is CSS/JS, discarded regardless of pipeline; would
   need a separate highlighter library layered on top of the fenced code
   blocks) and image captions (`<figure>`/`<figcaption>` don't have a
   standard Markdown equivalent - Turndown drops them to plain text by
   default; preserving them would need a custom Turndown rule).

**Trade-off vs. the CSS-only approach**: this is a real pipeline change (two
new vendored libraries, a new conversion step, tests need updating to assert
against Markdown-normalized output) rather than a same-day CSS tweak - but it
directly matches web-clipper's actual technique instead of a
lower-effort-but-different approach that only coincidentally addresses the
same symptom (unstyled tables/code).

---

## Feature 2: Targeting mode

**What's needed**: the ability to say "just clean up *this* element" instead
of always processing the whole `document`. This mirrors web-clipper's
`Highlighter`-based manual-selection mode, adapted to zen-view's simpler
"replace page in place" model instead of "extract to Markdown."

This is a bigger change than Feature 1: it adds a new interaction mode (hover
to highlight, click to confirm) and a decision point (whole-page vs.
targeted) that doesn't exist today.

### Architecture changes

**1. Manifest**: no permission changes needed - `activeTab` + `scripting`
already cover injecting a picker script on click, same as today.

**2. New interaction flow.** Today, one click on the toolbar icon does
everything in one shot (inject -> transform -> done). Targeting mode needs
two steps: *enter picking mode* -> *user clicks an element* -> *then*
transform. That means the single `chrome.action.onClicked` handler can no
longer just fire-and-forget the transform - it needs to branch:

```js
// service-worker.js (sketch)
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["vendor/purify.min.js", "vendor/Readability.js", "content/picker.js"],
  });
  // picker.js takes over; it messages back which mode + target once the user decides
});
```

The cleanest way to offer *both* "whole page" and "target an element" without
adding a popup UI (keeping the "lightweight and simple" premise) is a
**modifier-key convention**: plain click = whole-page transform (today's
behavior, unchanged); the picker only activates on a second interaction.
Concretely, recommend:

- Plain icon click -> today's behavior, no change.
- A `chrome.commands` keyboard shortcut (e.g. `Ctrl+Shift+E`, "pick element")
  or a right-click **context menu item** ("Zen View: select element") enters
  picking mode. Context menu is the better fit here since the skill's
  `context-menus.md` reference already covers the exact pattern
  (`chrome.contextMenus.create` + `contexts: ['page']`), and it avoids
  needing a popup just to expose a second mode.

**3. Picking the right granularity, not just the innermost node.** A naive
`mousemove` handler that outlines `e.target` picks whatever leaf DOM node is
under the cursor - a `<span>` inside a `<td>` inside a `<table>`, or a single
word inside a `<p>`. That's almost never the "component" the user means to
target (a whole table, a recipe card, a comment thread). web-clipper's
`Highlighter` package is a black box here (its source isn't in the repo
checkout), but the problem it has to solve is the same one, so zen-view's
picker needs its own answer: **walk up from `e.target` to the nearest
"block-like" ancestor**, and let the user widen the selection manually.
```js
const BLOCK_TAGS = new Set(['ARTICLE','SECTION','TABLE','FIGURE','UL','OL','DIV','P','BLOCKQUOTE','PRE']);
function nearestBlock(el) {
  while (el && el !== document.body && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement;
  return el || document.body;
}
```
Bind `ArrowUp`/`[` to `hovered = hovered.parentElement` (widen) and
`ArrowDown`/`]` to descend back toward `e.target` (narrow), so the user can
correct a too-broad or too-narrow guess before confirming - without this,
the picker technically "targets an element" but not usably.

**4. New file: `content/picker.js`** (new interactive layer, injected only
when targeting mode is requested):
```js
(() => {
  let hovered = null;
  const outline = (el) => { if (hovered) hovered.style.outline = ''; hovered = el; el.style.outline = '2px solid #0a7d2c'; };

  function onMove(e) { outline(nearestBlock(e.target)); }
  function onKey(e) {
    if (e.key === 'Escape') return cleanup();
    if (e.key === 'ArrowUp' && hovered?.parentElement) outline(hovered.parentElement);
    if (e.key === 'Enter') confirm();
  }
  function onClick(e) {
    e.preventDefault(); e.stopPropagation();
    confirm();
  }
  function confirm() {
    const target = hovered;
    cleanup();
    zenTransform(target); // same function Feature 1's whole-page mode calls, just scoped
  }
  function cleanup() {
    if (hovered) hovered.style.outline = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('click', onClick, true); // capture phase, so it wins over page handlers
  document.addEventListener('keydown', onKey);
})();
```
Key details worth flagging up front (things web-clipper's `Highlighter` and
the skill's content-script guidance both imply):
- **Capture-phase listener** (`addEventListener('click', onClick, true)`) is
  required so the picker intercepts the click before the page's own handlers
  (e.g. a link navigating away) run.
- **`e.preventDefault()` + `e.stopPropagation()`** on the picked click -
  otherwise clicking a link inside the target navigates the tab before the
  transform can run.
- **Escape-to-cancel** and **cleanup of listeners/outline styles** - without
  this, picking mode leaks state if the user changes their mind.
- No CSS-selector generation needed. web-clipper's `Highlighter` presumably
  builds a selector string to support serialization/persistence across its
  editor UI - zen-view has no such requirement, since it transforms
  immediately and in-place within the same script execution. **The picker
  script holds a direct reference to the DOM node and calls `zenTransform`
  on it in the same context** - no selector generation, no message passing.
  This is simpler than web-clipper's approach for a reason specific to
  zen-view's model, not a shortcut that skips something necessary.

**5. Transform logic needs a scoped entry point that reuses Feature 1's
pipeline.** `content/transform.js` currently hardcodes `document` as both
the extraction root and the sanitize/render path. For targeting mode to
produce output consistent with Feature 1 (same Markdown-normalized
tables/code/lists, same template, same CSS) rather than a different,
cruder path, the picked element needs to go through the *same*
sanitize -> Turndown -> render -> template pipeline as whole-page mode -
only the extraction step differs:

```js
function zenTransform(root = document) {
  const scoped = root !== document;
  const clone = root.cloneNode(true);
  const article = scoped ? null : new Readability(clone).parse();
  const rawHtml = article ? article.content : (scoped ? root.innerHTML : document.body.innerHTML);

  const sanitized = DOMPurify.sanitize(rawHtml, { WHOLE_DOCUMENT: false });
  const markdown = turndownService.turndown(sanitized);   // Feature 1's normalization step
  const bodyHtml = markdownRenderer.render(markdown);      // back to uniform HTML
  const title = (article && article.title) || document.title;
  renderTemplate(title, bodyHtml);                          // same template both modes share
}
```
Readability's whole-document heuristic is skipped when a specific root is
given (there's nothing to "find the article" within an already-picked
element) - `scoped` mode goes straight from the picked subtree's HTML into
the *same* Turndown/render/template path whole-page mode uses. This is the
one place targeting mode legitimately diverges from Feature 1: which HTML
enters the pipeline (Readability's guess vs. the user's explicit pick) -
everything downstream of extraction is identical, which is what makes the
two features composable instead of producing visually inconsistent results
depending on which mode was used.

**6. Injection sequencing.** Picking mode still needs DOMPurify + Turndown +
the Markdown renderer (Feature 1's pipeline) but not Readability, since
extraction is skipped when a root is explicitly picked - so the picker flow
can drop `vendor/Readability.js` from its `files` array, a minor injection
size optimization.

### Summary of changes

| File | Change |
|---|---|
| `manifest.json` | Add `context_menus` permission + a `contextMenus.create` call (service worker) for "Select element to clean up" |
| `service-worker.js` | Keep `onClicked` as-is (whole page); add `contextMenus.onClicked` handler that injects `content/picker.js` (+ Feature 1's vendored libs, minus Readability) instead |
| `content/picker.js` | New file - hover outline with block-ancestor widening (`nearestBlock`), keyboard widen/narrow/confirm, capture-phase click, Escape-to-cancel, calls `zenTransform` directly on the picked element |
| `content/transform.js` | Refactor `zenTransform(root)` so both whole-page and scoped calls share the same sanitize -> Turndown -> render -> template pipeline from Feature 1; only extraction (Readability vs. direct `innerHTML`) branches on `scoped` |
| `test/transform.test.js` | Add a case for `zenTransform` given a specific element (jsdom, skips Readability, asserts the same Markdown-normalized table/code output as whole-page mode on equivalent input) |

**Not needed**: no `host_permissions` change (still `activeTab`-triggered,
since context menu clicks are a valid `activeTab` gesture per the skill's
Mandatory Rule #12), no popup, no `chrome.storage` (picking is stateless and
synchronous within one script execution, unlike web-clipper which persists
clip drafts across its editor UI).

### Effort comparison

Both features are real pipeline/architecture changes, not same-day tweaks,
and **Feature 2 depends on Feature 1 being built first** - targeting mode
reuses Feature 1's sanitize/Turndown/render/template pipeline so both modes
produce consistent output; building the picker against today's raw-HTML
template would mean redoing that wiring once Feature 1 lands.

Feature 1 adds two-to-three new vendored libraries (Turndown, a GFM plugin,
a Markdown renderer) and a new conversion stage between extraction and
templating. Feature 2 adds a new content script, a new manifest surface
(context menu), and a signature change to the existing transform function -
but stays within zen-view's existing permission model and doesn't require
pulling in web-clipper's external picker packages (`@web-clipper/highlight`,
`@web-clipper/area-selector`); a from-scratch picker is still small (roughly
50-70 lines with the ancestor-walking/keyboard-widen logic included) because
zen-view's simpler "transform in place, no persistence" model doesn't need
selector-string generation or drag-rectangle support - the main added
complexity versus the original sketch is picking a sensible block-level
ancestor instead of the raw hovered leaf node, and letting the user correct
that guess before confirming.
