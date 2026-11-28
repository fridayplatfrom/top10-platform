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

  // Keep article copy aligned with the source-based review while respecting editor changes.
  const articleDescriptionCorrections = new Map([
    ["cloud-hosting", [
      "We evaluate global deployment speed, managed Kubernetes clusters, and predictable bandwidth pricing for modern web applications.",
      "Compare cloud hosting providers by deployment model, usage charges, bandwidth and the infrastructure your team will need to manage."
    ]],
    ["project-management", [
      "Streamline sprint planning, issue tracking, and cross-functional roadmaps with our hands-on review of the best workspace platforms.",
      "Compare project management tools by pricing, issue tracking, planning and how each one fits your team’s workflow."
    ]],
    ["ovens", [
      "From countertop precision ovens to commercial-style induction ranges, discover our tested picks for even baking and smart temperature probes.",
      "Compare countertop ovens, built-in convection models and a dedicated indoor smoker by size, installation and cooking features."
    ]],
    ["smart-tvs", [
      "We tested peak HDR brightness, black-level uniformity, 144Hz gaming input lag, and anti-reflective coatings across flagship displays.",
      "Compare OLED and Mini-LED TVs by room conditions, gaming needs, screen size and current availability."
    ]],
    ["phone-covers", [
      "Compare aramid fiber, full-grain leather, and military-grade shockproof MagSafe cases designed to protect without adding bulk.",
      "Compare phone cases by device fit, bulk, materials and compatibility with your mounts and chargers."
    ]],
    ["gambling-platforms", [
      "Compare licensed sportsbooks across live in-play odds, instant withdrawal speeds, parlay builders, and mobile app reliability.",
      "Compare published fees, payment terms and regional availability for sportsbooks, casinos and prediction markets."
    ]],
    ["vector-search-7084", [
      "Comprehensive benchmarks and verified directory for production vector databases.",
      "Compare managed and self-hosted vector search by pricing, filtering, scaling and infrastructure costs."
    ]]
  ]);

  function getArticleHeader(category, meta) {
    const correction = articleDescriptionCorrections.get(category.slug);
    return {
      title: category.slug === 'vector-search-7084' && category.title === 'Top 10 Vector Search Engines 7084'
        ? 'Top 10 Vector Search Engines' : category.title,
      description: correction && correction[0] === meta.description ? correction[1] : meta.description
    };
  }

  const relatedTitleCorrections = new Map([
    ['How to Protect Your Phone: Top 10 Drop-Tested Cases & Covers', 'How to Protect Your Phone: 10 Cases Compared'],
    ['Top 10 Regulated Sportsbooks & Gaming Apps: Complete Breakdown', 'Top 10 Gambling Platforms: Fees and Availability']
  ]);

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
      return '<li><a href="/list/' + encodeURIComponent(other.slug) + '">' + image + '<span>' + escape(relatedTitleCorrections.get(meta.editorialTitle) || meta.editorialTitle) + '</span></a></li>';
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

  const guideExtras = { getArticleHeader, renderComparison, renderRelated };
  if (typeof module === 'object' && module.exports) module.exports = guideExtras;
  else {
    root.top10GuideExtras = guideExtras;
    root.document.addEventListener('error', handleRelatedImageError, true);
  }
})(typeof window === 'object' ? window : null);
