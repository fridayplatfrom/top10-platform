'use strict';
// Pure, isolated regression tests: no production DB, network or server writes.
const assert = require('node:assert/strict');
const { buildSeoJsonLd, enrichCategoryEditorial, getCategoryFeatureMeta } = require('./editorial-enrichment');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const raw = { slug: 'example', title: 'Example Directory', shortName: 'Examples', top10: [
  { id: 'a', name: 'A', companyName: 'A Co', rank: 1, website: 'https://a.example', tagline: 'A supplied description', upvotes: 123 },
  { id: 'b', name: 'B', companyName: 'B Co', rank: 2, website: 'https://b.example', tagline: 'B supplied description', rating: 0, editorialScore: 0, reviewsCount: 0 }
], pushedOut: [] };
const graph = (cat, pair, base = 'https://directory.example') => JSON.parse(buildSeoJsonLd(cat, cat ? [cat] : [], base, pair))['@graph'];
const node = (g, type) => g.find(n => n['@type'] === type);
test('missing editorial evidence is not synthesized from placement/upvotes', () => {
 const c = enrichCategoryEditorial(raw); const p = c.top10[0];
 assert.equal(p.rating, null); assert.equal(p.editorialScore, null); assert.equal(p.reviewsCount, null);
 assert.deepEqual(p.pros, []); assert.deepEqual(p.cons, []); assert.equal(p.specs.freeTrial, 'Not specified');
 assert.equal(p.editorialSummary, raw.top10[0].tagline);
 assert(!c.editorialGuide.methodology.includes('hands-on')); assert(c.editorialGuide.methodology.includes('paid placement'));
});
test('explicit zero values survive and aggregate without invented counts', () => {
 const c = enrichCategoryEditorial(raw); assert.equal(c.top10[1].rating, 0);
 assert.equal(c.top10[1].reviewsCount, 0); assert.equal(c.editorialGuide.totalVerifiedReviews, '0');
 assert.equal(c.editorialGuide.avgEditorialScore, '0.0/10');
});
test('empty categories do not acquire scores, reviews, or publication dates', () => {
 const c = enrichCategoryEditorial({...raw, top10: []});
 assert.equal(c.editorialGuide.avgEditorialScore, 'Not rated');
 assert.equal(c.editorialGuide.totalVerifiedReviews, 'Not supplied'); assert.equal(c.publishedAt, null);
 assert.equal(node(graph(c),'Article').datePublished, undefined);
});
test('authored product edits override built-in editorial presets', () => {
 const c = enrichCategoryEditorial({...raw, top10: [{...raw.top10[0], id:'prod_stripe', rating:0, editorialSummary:'Edited summary', pros:[], specs:{freeTrial:'No trial'}}]});
 assert.equal(c.top10[0].editorialSummary,'Edited summary'); assert.equal(c.top10[0].rating,0); assert.deepEqual(c.top10[0].pros,[]); assert.equal(c.top10[0].specs.freeTrial,'No trial');
});
test('all JSON-LD branches prevent script breakout and round-trip text', () => {
 const payload = '</script><script>alert("x")</script>&\u2028\u2029';
 const cat = {...raw, title:payload, description:payload, top10:raw.top10.map(p=>({...p,name:payload,tagline:payload}))};
 for (const [c, cats, pair] of [[null,[cat],null],[cat,[cat],null],[cat,[cat],{prodA:cat.top10[0],prodB:cat.top10[1]}]]) {
  const out = buildSeoJsonLd(c,cats,'https://directory.example',pair);
  assert(!/[<>&\u2028\u2029]/.test(out)); assert(JSON.stringify(JSON.parse(out)).includes('</script>'));
 }
});
test('invalid updated dates do not throw or advertise invented dates', () => {
 const article = node(graph({...raw,updatedAt:'invalid',publishedAt:'invalid'}),'Article');
 assert.equal(article.datePublished,undefined); assert.equal(article.dateModified,undefined);
});
test('valid publication and modification dates are distinct ISO timestamps', () => {
 const c = {...raw,publishedAt:'2026-10-01',updatedAt:'2026-11-01'}; const a=node(graph(c),'Article');
 assert.equal(a.datePublished,'2026-10-01T00:00:00.000Z'); assert.equal(a.dateModified,'2026-11-01T00:00:00.000Z');
 assert.equal(getCategoryFeatureMeta(c).dateText,'01 Nov 2026');
});
test('scheduled dates are not advertised as publication dates', () => {
 const c=enrichCategoryEditorial({...raw,scheduledAt:'2027-01-01'}); assert.equal(c.publishedAt,null);
 assert.equal(node(graph(c),'Article').datePublished,undefined);
});
test('base trailing slash does not duplicate canonical/schema URL separator', () => {
 const a=node(graph(raw,null,'https://directory.example/'),'Article'); assert.equal(a['@id'],'https://directory.example/list/example#article');
});
test('comparison uses selected pair, order, URLs and supplied descriptions', () => {
 const pair={prodA:raw.top10[1],prodB:raw.top10[0]};const g=graph(raw,pair);const page=node(g,'WebPage');const list=node(g,'ItemList');
 assert.equal(page.url,'https://directory.example/compare/example/b-vs-a');
 assert.equal(list.numberOfItems,2); assert.deepEqual(list.itemListElement.map(i=>i.item.name),['B','A']);
 assert.equal(list.itemListElement[0].item.url,'https://b.example'); assert.equal(list.itemListElement[0].item.description,'B supplied description');
 assert(!JSON.stringify(g).includes('AggregateRating')); assert(!JSON.stringify(g).includes('Offer'));
});
test('list item count and positions describe actual visible top ten', () => {
 const list=node(graph(raw),'ItemList');assert.equal(list.numberOfItems,2);assert.deepEqual(list.itemListElement.map(x=>x.position),[1,2]);
});
console.log(`${checks} SEO/enrichment tests passed`);
