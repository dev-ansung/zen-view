const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

const VENDOR = path.join(__dirname, "..", "vendor");
const CONTENT = path.join(__dirname, "..", "content");

// Mirrors the sanitize+extract+normalize pipeline implemented in
// content/transform.js, exercised here against jsdom instead of
// chrome.scripting.executeScript. Loads the same vendored files (and
// content/transform.js itself) the extension ships via jsdom's internal VM
// context, so the files run as true global scripts - matching how a
// content script sees them (no `module`/`exports` in scope) - which is
// what makes each library's UMD wrapper pick the browser-global branch.
function loadGlobals(dom) {
  const context = dom.getInternalVMContext();
  context.Readability = Readability;
  context.DOMPurify = createDOMPurify(dom.window);
  for (const file of ["turndown.js", "turndown-plugin-gfm.js", "marked.js"]) {
    vm.runInContext(fs.readFileSync(path.join(VENDOR, file), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(CONTENT, "transform.js"), "utf8"), context);
}

function zenView(html, url = "https://example.com/") {
  const dom = new JSDOM(html, { url, runScripts: "dangerously" });
  loadGlobals(dom);

  dom.window.zenTransform(dom.window.document);

  return {
    title: dom.window.document.title,
    bodyHtml: dom.window.document.body.innerHTML,
  };
}

function zenViewScoped(html, selector, url = "https://example.com/") {
  const dom = new JSDOM(html, { url, runScripts: "dangerously" });
  loadGlobals(dom);

  const root = dom.window.document.querySelector(selector);
  dom.window.zenTransform(root);

  return {
    title: dom.window.document.title,
    bodyHtml: dom.window.document.body.innerHTML,
  };
}

test("extracts article content, strips scripts/handlers, drops nav/footer boilerplate", () => {
  const before = `<html>
<head><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <div onclick="evil()">
    <h1>My Great Article</h1>
    <p>This is the first paragraph of a fairly long article that talks about
    something interesting, so that Readability has enough content to consider
    this the main article body rather than boilerplate.</p>
    <p>Here is a second paragraph with more text to pad out the content length
    and make the extraction algorithm confident about the article region.</p>
    <img src="x.jpg" onerror="evil()">
  </div>
  <footer>Copyright 2026</footer>
  <script>alert('xss')</script>
</body>
</html>`;

  const { title, bodyHtml } = zenView(before);

  assert.equal(title, "Test Article");
  assert.ok(bodyHtml.includes("My Great Article"), "article heading preserved");
  assert.ok(bodyHtml.includes("first paragraph"), "article body preserved");
  assert.ok(!bodyHtml.includes("<script>"), "script tag removed");
  assert.ok(!bodyHtml.includes("onclick"), "onclick handler removed");
  assert.ok(!bodyHtml.includes("onerror"), "onerror handler removed");
  assert.ok(!bodyHtml.includes('href="/about"'), "nav boilerplate dropped");
  assert.ok(!bodyHtml.includes("Copyright 2026"), "footer boilerplate dropped");
});

test("falls back to sanitizing body in place when Readability can't extract an article", () => {
  const before = `<html><head><title>Search Results</title></head>
<body onclick="evil()">
  <input type="text">
  <script>alert('xss')</script>
  <p>a</p>
</body></html>`;

  const { title, bodyHtml } = zenView(before);

  assert.equal(title, "Search Results");
  assert.ok(!bodyHtml.includes("<script>"), "script tag removed even in fallback");
  assert.ok(!bodyHtml.includes("onclick"), "onclick handler removed even in fallback");
});

test("normalizes a table into a uniform Markdown table, regardless of source markup", () => {
  const before = `<html><head><title>Data Article</title></head>
<body>
  <article>
    <h1>Data Article</h1>
    <p>This article contains a table with some data in it, along with enough
    surrounding text for Readability to treat it as the main content region
    rather than boilerplate to be discarded during extraction.</p>
    <table class="weird-vendor-table-class" data-sortable="true">
      <tr><th>Name</th><th>Score</th></tr>
      <tr><td>Alice</td><td>90</td></tr>
      <tr><td>Bob</td><td>85</td></tr>
    </table>
    <p>Some closing text after the table to round out the article body.</p>
  </article>
</body></html>`;

  const { bodyHtml } = zenView(before);

  assert.ok(bodyHtml.includes("<table>"), "rendered back to a plain <table> with no source classes/attrs");
  assert.ok(!bodyHtml.includes("weird-vendor-table-class"), "source-specific class stripped by the round-trip");
  assert.ok(!bodyHtml.includes("data-sortable"), "source-specific data attribute stripped by the round-trip");
});

test("normalizes a code block into a fenced Markdown block", () => {
  // Note: Readability's own extraction step strips the `class="language-js"`
  // attribute before DOMPurify/Turndown ever see the markup (independent of
  // this pipeline's sanitization), so the language tag doesn't survive
  // whole-page extraction. Fencing without a language tag is still correct
  // Markdown - this documents that limitation rather than a pipeline bug.
  const before = `<html><head><title>Code Article</title></head>
<body>
  <article>
    <h1>Code Article</h1>
    <p>This article contains a code sample, along with enough surrounding
    text for Readability to treat it as the main content region rather than
    boilerplate to be discarded during extraction from the page.</p>
    <pre><code class="language-js">const x = 1;</code></pre>
    <p>Some closing text after the code block to round out the article.</p>
  </article>
</body></html>`;

  const { bodyHtml } = zenView(before);

  assert.ok(bodyHtml.includes("<pre><code>"), "rendered back as a plain fenced code block");
});

test("zenTransform(root) on a picked element skips Readability and uses the element's own markup", () => {
  const before = `<html><head><title>Listing Page</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <ul>
    <li>Unrelated teaser one</li>
    <li>Unrelated teaser two</li>
  </ul>
  <table id="target" class="weird-vendor-table-class">
    <tr><th>Name</th><th>Score</th></tr>
    <tr><td>Alice</td><td>90</td></tr>
  </table>
  <footer>Copyright 2026</footer>
</body></html>`;

  const { title, bodyHtml } = zenViewScoped(before, "#target");

  assert.equal(title, "Listing Page", "falls back to document.title, since a scoped pick has no article title");
  assert.ok(bodyHtml.includes("<table>"), "picked table normalized through the same Turndown/marked pipeline");
  assert.ok(!bodyHtml.includes("weird-vendor-table-class"), "source class stripped by the round-trip");
  assert.ok(!bodyHtml.includes("Unrelated teaser"), "content outside the picked element is not included");
  assert.ok(!bodyHtml.includes("Copyright 2026"), "content outside the picked element is not included");
});
