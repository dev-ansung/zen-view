(() => {
  const clone = document.cloneNode(true);
  const article = new Readability(clone).parse();

  const bodyHtml = article
    ? DOMPurify.sanitize(article.content, { WHOLE_DOCUMENT: false })
    : DOMPurify.sanitize(document.body.innerHTML, { WHOLE_DOCUMENT: false });
  const title = (article && article.title) || document.title;

  document.title = title;
  document.documentElement.innerHTML =
    `<head><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{max-width:680px;margin:2rem auto;padding:0 1rem;font:18px/1.6 -apple-system,system-ui,sans-serif;color:#1a1a1a}img{max-width:100%}</style></head>` +
    `<body><h1>${title}</h1>${bodyHtml}</body>`;
})();
