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

  // Product artwork from the respective vendor pages and app-store listings.
  const productThumbnails = new Map([
    ['prod_datadog', 'datadog-apm'],
    ['prod_stripe', 'stripe-billing'],
    ['ai_cursor', 'cursor'],
    ['crm_attio', 'attio'],
    ['spk_kef', 'kef-ls50-wireless-ii'],
    ['ov_breville', 'breville-bov900'],
    ['tv_hisense_u8n', 'hisense-u8n'],
    ['pc_caudabe', 'caudabe-sheath'],
    ['gp_fanduel', 'fanduel-sportsbook'],
    ['mg_genshin', 'genshin-impact'],
    ['ab_audible', 'audible']
  ]);

  function renderRelated(category, categories, getMeta) {
    const topic = category.topic || getMeta(category).topic;
    const others = categories.filter(other => other.slug !== category.slug)
      .map(other => ({ other, meta: getMeta(other) }));
    const sameTopic = ({ other, meta }) => (other.topic || meta.topic) === topic;
    const ranked = others.filter(sameTopic)
      .concat(others.filter(item => !sameTopic(item))).slice(0, 3);
    return ranked.map(({ other, meta }) => {
      const products = other.top10 || [];
      const productThumbnail = products.map(product => productThumbnails.get(product.id)).find(Boolean);
      const productImage = products.map(product => imageUrl(product.media?.heroImage)).find(Boolean);
      const cover = imageUrl(meta.coverImage);
      const src = productThumbnail ? '/images/related-guides/' + productThumbnail + '.webp' : productImage || cover;
      const fallback = cover && cover !== src ? ' data-related-fallback="' + escape(cover) + '"' : '';
      const image = src ? '<img src="' + escape(src) + '"' + fallback + ' alt="" width="112" height="76" loading="lazy" decoding="async">' : '';
      return '<li><a href="/list/' + encodeURIComponent(other.slug) + '">' + image + '<span>' + escape(meta.editorialTitle) + '</span></a></li>';
    }).join('');
  }

  function handleRelatedImageError(event) {
    const image = event.target;
    if (!image.matches?.('#relatedDirectoriesGrid img')) return;
    const fallback = image.dataset.relatedFallback;
    delete image.dataset.relatedFallback;
    if (fallback) image.src = fallback;
    else image.remove();
  }

  const guideExtras = { renderComparison, renderRelated };
  if (typeof module === 'object' && module.exports) module.exports = guideExtras;
  else {
    root.top10GuideExtras = guideExtras;
    root.document.addEventListener('error', handleRelatedImageError, true);
  }
})(typeof window === 'object' ? window : null);
