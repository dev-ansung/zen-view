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

// Loads transform.js + picker.js as true global scripts via jsdom's internal
// VM context, matching how chrome.scripting.executeScript injects them -
// same rationale as test/transform.test.js.
function loadGlobals(dom) {
  const context = dom.getInternalVMContext();
  context.Readability = Readability;
  context.DOMPurify = createDOMPurify(dom.window);
  for (const file of ["turndown.js", "turndown-plugin-gfm.js", "marked.js"]) {
    vm.runInContext(fs.readFileSync(path.join(VENDOR, file), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(CONTENT, "transform.js"), "utf8"), context);
  return context;
}

test("Escape falls back to a whole-page transform", () => {
  const before = `<html><head><title>Some Page</title></head>
<body>
  <div id="a"><p>Block A with enough content to be picked up as an article region here.</p></div>
  <div id="b"><p>Block B with enough content to be picked up as an article region here too.</p></div>
</body></html>`;

  const dom = new JSDOM(before, { url: "https://example.com/", runScripts: "dangerously" });
  const context = loadGlobals(dom);
  vm.runInContext(fs.readFileSync(path.join(CONTENT, "picker.js"), "utf8"), context);

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

  const bodyHtml = dom.window.document.body.innerHTML;
  assert.ok(bodyHtml.includes("Block A"), "whole-page fallback includes content outside any single picked block");
  assert.ok(bodyHtml.includes("Block B"), "whole-page fallback includes content outside any single picked block");
});

test("clicking a nested element picks its nearest block-level ancestor, not the leaf node", () => {
  const before = `<html><head><title>Some Page</title></head>
<body>
  <table id="target">
    <tr><th>Name</th><th>Score</th></tr>
    <tr><td><span id="leaf">Alice</span></td><td>90</td></tr>
  </table>
  <p>Unrelated paragraph elsewhere on the page.</p>
</body></html>`;

  const dom = new JSDOM(before, { url: "https://example.com/", runScripts: "dangerously" });
  const context = loadGlobals(dom);
  vm.runInContext(fs.readFileSync(path.join(CONTENT, "picker.js"), "utf8"), context);

  const leaf = dom.window.document.querySelector("#leaf");
  const clickEvent = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
  Object.defineProperty(clickEvent, "target", { value: leaf });
  leaf.dispatchEvent(clickEvent);

  const bodyHtml = dom.window.document.body.innerHTML;
  assert.ok(bodyHtml.includes("<table>"), "picked the ancestor <table>, not the <span> leaf node");
  assert.ok(bodyHtml.includes("Alice"), "picked element's own content is preserved");
  assert.ok(!bodyHtml.includes("Unrelated paragraph"), "content outside the picked table is excluded");
});
