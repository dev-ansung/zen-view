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

**What "layout consistency" means here**: right now every page - a recipe
blog, a news article, a technical doc with code blocks and tables - gets
squashed into the same fixed template (18px system font, 680px column, no
regard for the source's original structure). "Consistency" can mean two
different things, and the doc should pick one:

- **(a) Consistent zen-view output** - every clipped page looks the same
  (current behavior, already true) - the ask would be refining that one
  template (better code block styling, table styling, blockquote styling,
  captioned images) rather than architecture change.
- **(b) Structure preserved from the source** - a recipe's ingredient list
  stays a list, a table stays a table with its columns, code blocks keep
  syntax highlighting - i.e. the "layout" is *derived from the source's
  semantic HTML* rather than discarded. This is the web-clipper-comparison
  gap: Readability already keeps the extracted subtree's semantic tags
  (`<table>`, `<pre>`, `<ul>`, etc.) in `article.content` - the gap is that
  DOMPurify's default allow-list is broad enough to pass these through, but
  zen-view's template CSS doesn't style anything beyond `body`/`img`.

This proposal assumes **(b)**, since that's the concrete gap the web-clipper
comparison surfaced (Turndown's structural HTML->Markdown mapping vs.
zen-view's fixed template).

### What's needed

1. **Verify DOMPurify's allow-list already passes structural tags through.**
   `DOMPurify.sanitize(article.content, { WHOLE_DOCUMENT: false })` uses the
   default config, which permits `table`/`thead`/`tbody`/`tr`/`td`/`th`,
   `pre`/`code`, `ul`/`ol`/`li`, `blockquote`, `figure`/`figcaption`. No
   change needed here - confirm with a fixture test (extend
   `test/transform.test.js` with a table + code-block fixture, assert the
   tags survive sanitization).

2. **Style what already survives.** Extend the inline `<style>` block in
   `content/transform.js` to cover the tags Readability/DOMPurify pass
   through but the current CSS ignores:
   ```css
   table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
   th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
   pre { background: #f4f4f4; padding: 1em; overflow-x: auto; border-radius: 4px; }
   code { font-family: ui-monospace, monospace; }
   blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555; }
   figure { margin: 1.5em 0; } figcaption { font-size: 0.9em; color: #666; }
   ```
   This is a pure CSS addition - no manifest/permission changes, no new
   files. Lowest-effort, highest-value part of this feature.

3. **Optional: syntax highlighting for code blocks.** Readability preserves
   `<pre><code class="language-js">...</code></pre>` when the source site
   used that convention, but doesn't highlight it - highlighting was the
   source page's own CSS/JS, which is discarded. To actually get colored
   syntax (not just monospace text), a highlighter library (e.g.
   `highlight.js`, vendored the same way as DOMPurify/Readability - a
   browser build, no bundler) would need to run over `<pre><code>` blocks in
   `transform.js` before injection into `document.documentElement.innerHTML`.
   This is a meaningful size/complexity addition (highlight.js's core +
   language grammars is not tiny) - worth deferring unless code-heavy pages
   are a real use case.

4. **Optional: preserve image captions/credits.** Readability keeps
   `<figure>`/`<figcaption>` when present in the source. No extra work
   beyond step 2's CSS if the goal is just "don't drop them" - they already
   survive DOMPurify's default allow-list.

**Scope**: step 2 alone (CSS only) delivers most of the visible improvement
and requires no manifest, permission, or architecture change. Steps 3-4 are
optional and separable.

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

**3. New file: `content/picker.js`** (new interactive layer, injected only
when targeting mode is requested):
```js
(() => {
  let hovered = null;
  const outline = (el) => { if (hovered) hovered.style.outline = ''; hovered = el; el.style.outline = '2px solid #0a7d2c'; };

  function onMove(e) { outline(e.target); }
  function onClick(e) {
    e.preventDefault(); e.stopPropagation();
    cleanup();
    chrome.runtime.sendMessage({ type: 'ELEMENT_PICKED', selector: buildSelector(e.target) });
    // or: pass the element directly to transform logic run in the same script,
    // avoiding a round-trip through the service worker (simpler, see below)
  }
  function onKey(e) { if (e.key === 'Escape') cleanup(); }
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
- No need for a separate `buildSelector()`/CSS-selector step at all if the
  picker directly holds a reference to the clicked DOM node in the same
  script context - selector-string generation (what web-clipper's
  `Highlighter` does, presumably to support serialization/persistence) is
  only necessary if the target needs to be re-found later (e.g. from a
  different script or after a message round-trip). Since zen-view transforms
  immediately and in-place, **the picker script can just call the transform
  logic directly on `e.target`** - no selector generation, no message
  passing needed. This is simpler than web-clipper's approach because
  zen-view doesn't need to persist/serialize the target.

**4. Transform logic needs a scoped entry point.** `content/transform.js`
currently hardcodes `document` as the extraction root. Refactor to accept an
optional root element:

```js
function zenTransform(root = document.body) {
  const scoped = root === document.body;
  const clone = (scoped ? document : root).cloneNode(true);
  const article = scoped ? new Readability(clone).parse() : null;
  const bodyHtml = article
    ? DOMPurify.sanitize(article.content, { WHOLE_DOCUMENT: false })
    : DOMPurify.sanitize((scoped ? document.body : root).innerHTML, { WHOLE_DOCUMENT: false });
  ...
}
```
Readability's whole-document heuristic doesn't make sense on an
already-picked element (there's nothing to "find the article" within a
single `<div>`) - so targeting mode should skip Readability and go straight
to DOMPurify-sanitizing the picked subtree, replacing `document.body` with
just that sanitized fragment (in the same wrapper template from Feature 1).
This is effectively the same shortcut web-clipper's own manual-selection
mode takes (`select.ts` clones the picked node and skips Readability
entirely).

**5. Injection sequencing.** Picking mode still needs DOMPurify (to sanitize
the final picked subtree) but not necessarily Readability (skipped per
above) - so the picker flow could drop `vendor/Readability.js` from its
`files` array, a minor injection-size optimization.

### Summary of changes

| File | Change |
|---|---|
| `manifest.json` | Add `context_menus` permission + a `contextMenus.create` call (service worker) for "Select element to clean up" |
| `service-worker.js` | Keep `onClicked` as-is (whole page); add `contextMenus.onClicked` handler that injects `content/picker.js` instead |
| `content/picker.js` | New file - hover outline, capture-phase click, Escape-to-cancel, calls transform directly on the clicked element |
| `content/transform.js` | Refactor into a `zenTransform(root)` function taking an optional scoped root; skip Readability when a root is provided |
| `test/transform.test.js` | Add a case for `zenTransform` given a specific element (jsdom `element.cloneNode(true)` + DOMPurify only, no Readability) |

**Not needed**: no `host_permissions` change (still `activeTab`-triggered,
since context menu clicks are a valid `activeTab` gesture per the skill's
Mandatory Rule #12), no popup, no `chrome.storage` (picking is stateless and
synchronous within one script execution, unlike web-clipper which persists
clip drafts across its editor UI).

### Effort comparison

Feature 1 (step 2, the CSS-only version) is a same-day change with no new
files. Feature 2 is a real feature addition - new content script, new
manifest surface (context menu), and a signature change to the existing
transform function - but stays within zen-view's existing permission model
and doesn't require pulling in web-clipper's external picker packages
(`@web-clipper/highlight`, `@web-clipper/area-selector`); a from-scratch
picker is ~30-40 lines because zen-view's simpler "transform in place, no
persistence" model doesn't need selector-string generation or drag-rectangle
support.
