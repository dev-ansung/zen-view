function zenTransform(root) {
  const scoped = root !== document;

  const clone = root.cloneNode(true);
  const article = scoped ? null : new Readability(clone).parse();

  const rawHtml = article ? article.content : (scoped ? root.outerHTML : document.body.innerHTML);
  const sanitized = DOMPurify.sanitize(rawHtml, { WHOLE_DOCUMENT: false });

  const turndownService = new TurndownService({ codeBlockStyle: "fenced" });
  turndownService.use(turndownPluginGfm.gfm);
  const markdown = turndownService.turndown(sanitized);
  const bodyHtml = marked.parse(markdown);

  const title = (article && article.title) || document.title;

  document.title = title;
  document.documentElement.innerHTML =
    `<head><meta charset="utf-8"><title>${title}</title>` +
    `<style>
      body{max-width:680px;margin:2rem auto;padding:0 1rem;font:18px/1.6 -apple-system,system-ui,sans-serif;color:#1a1a1a}
      img{max-width:100%}
      table{border-collapse:collapse;width:100%;margin:1.5em 0}
      th,td{border:1px solid #ddd;padding:0.5em;text-align:left}
      pre{background:#f4f4f4;padding:1em;overflow-x:auto;border-radius:4px}
      code{font-family:ui-monospace,monospace}
      blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#555}
    </style></head>` +
    `<body><h1>${title}</h1>${bodyHtml}</body>`;
}

if (typeof window !== "undefined") window.zenTransform = zenTransform;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { zenTransform };
}
