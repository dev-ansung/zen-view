(() => {
  const BLOCK_TAGS = new Set([
    "ARTICLE", "SECTION", "TABLE", "FIGURE", "UL", "OL", "DIV", "P", "BLOCKQUOTE", "PRE",
  ]);

  function nearestBlock(el) {
    while (el && el !== document.body && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement;
    return el || document.body;
  }

  let hovered = null;

  function outline(el) {
    if (hovered) hovered.style.outline = "";
    hovered = el;
    if (hovered) hovered.style.outline = "2px solid #0a7d2c";
  }

  function onMove(e) {
    outline(nearestBlock(e.target));
  }

  function onKey(e) {
    if (e.key === "Escape") {
      cleanup();
      zenTransform(document);
      return;
    }
    if (e.key === "ArrowUp" && hovered && hovered.parentElement) {
      outline(hovered.parentElement);
    }
    if (e.key === "Enter" && hovered) {
      confirm();
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!hovered) outline(nearestBlock(e.target));
    confirm();
  }

  function confirm() {
    const target = hovered;
    cleanup();
    zenTransform(target);
  }

  function cleanup() {
    if (hovered) hovered.style.outline = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey);
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey);
})();
