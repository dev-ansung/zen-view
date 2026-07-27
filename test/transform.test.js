const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

// Mirrors the sanitize+extract pipeline implemented in content/transform.js,
// exercised here against jsdom instead of chrome.scripting.executeScript.
function zenView(html, url = "https://example.com/") {
  const dom = new JSDOM(html, { url });
  const clone = dom.window.document.cloneNode(true);
  const article = new Readability(clone).parse();

  const DOMPurify = createDOMPurify(dom.window);
  const bodyHtml = article
    ? DOMPurify.sanitize(article.content, { WHOLE_DOCUMENT: false })
    : DOMPurify.sanitize(dom.window.document.body.innerHTML, { WHOLE_DOCUMENT: false });
  const title = (article && article.title) || dom.window.document.title;

  return { title, bodyHtml };
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
