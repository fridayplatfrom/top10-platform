(function (root) {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function editorialText(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    return /^not (specified|supplied|available)$/i.test(text) ? '' : text;
  }

  function imageUrl(value) {
    return typeof value === 'string' && /^(?:https:\/\/|\/(?![\/\\]))/i.test(value) ? value : '';
  }

  function renderComparison(products) {
    if (!products.length) return '';
    const rows = products.map(product => {
      const audience = editorialText(product.specs?.idealFor);
      const strength = Array.isArray(product.pros)
        ? product.pros.map(editorialText).find(Boolean)
        : '';
      const description = strength || editorialText(product.tagline);
      return `<tr>
        <th scope="row"><a href="#${escape(encodeURIComponent('prod-card-' + product.id))}">${escape(product.name)}</a></th>
        <td>${audience ? escape(audience) : '—'}</td>
        <td>${description ? escape(description) : '—'}</td>
      </tr>`;
    }).join('');
    return `<nav class="guide-article-jumps" aria-label="In this guide">
        <a href="#guideComparisonHeading">Compare products</a><a href="#guideRankingsTitle">Read product notes</a>
      </nav>
      <h2 id="guideComparisonHeading">Products at a glance</h2>
      <div class="guide-table-scroll" tabindex="0" role="region" aria-labelledby="guideComparisonHeading">
        <table>
          <thead><tr><th scope="col">Product</th><th scope="col">Who it’s for</th><th scope="col">What stands out</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderRelated(category, categories, getMeta) {
    const topic = getMeta(category).topic;
    const others = categories.filter(other => other.slug !== category.slug)
      .map(other => ({ other, meta: getMeta(other) }));
    const ranked = others.filter(({ meta }) => meta.topic === topic)
      .concat(others.filter(({ meta }) => meta.topic !== topic)).slice(0, 3);
    return ranked.map(({ other, meta }) => {
      const productImage = (other.top10 || []).map(product => imageUrl(product.media?.heroImage)).find(Boolean);
      const cover = productImage || imageUrl(meta.coverImage);
      const image = cover ? `<img src="${escape(cover)}" alt="" width="112" height="76" loading="lazy" decoding="async">` : '';
      return `<li><a href="/list/${encodeURIComponent(other.slug)}">${image}<span>${escape(meta.editorialTitle)}</span></a></li>`;
    }).join('');
  }

  const guideExtras = { renderComparison, renderRelated };
  if (typeof module === 'object' && module.exports) module.exports = guideExtras;
  else root.top10GuideExtras = guideExtras;
})(typeof window === 'object' ? window : null);
