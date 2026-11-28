const MarkdownIt = require('markdown-it');

const markdown = new MarkdownIt({ html: false });

markdown.renderer.rules.table_open = (_tokens, _idx, _options, env) =>
  '<div class="guide-table-scroll" tabindex="0" role="region" aria-label="Article table ' + ++env.tableCount + '">\n<table>\n';
markdown.renderer.rules.table_close = () => '</table>\n</div>\n';

markdown.core.ruler.push('article_headings', state => {
  const counts = new Map();
  for (let index = 0; index < state.tokens.length; index++) {
    const token = state.tokens[index];
    if (token.type === 'heading_open') {
      const text = state.tokens[index + 1].content;
      const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
      const count = (counts.get(base) || 0) + 1;
      counts.set(base, count);
      token.attrSet('id', 'article-' + base + (count === 1 ? '' : '-' + count));
    }
    if (token.tag === 'h1') token.tag = 'h2';
    if (token.type === 'inline') {
      for (const child of token.children || []) {
        const href = child.type === 'link_open' && child.attrGet('href');
        if (href && /^#[a-z0-9-]+$/i.test(href)) child.attrSet('href', '#article-' + href.slice(1));
      }
    }
  }
});

function renderArticleMarkdown(source) {
  return markdown.render(source, { tableCount: 0 });
}

module.exports = { renderArticleMarkdown };

