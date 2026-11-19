// Source-level regressions only, not a replacement for a real browser suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'public/app.js'), 'utf8');
const match = source.match(/const reviewScoreLabel = \(product\) => \{[\s\S]*?\n    \};/);
assert.ok(match, 'Comparison score formatter exists');
const label = vm.runInNewContext(`${match[0]}; reviewScoreLabel`);
assert.equal(label({}), 'No reviews · Not rated');
assert.equal(label({rank: 1, upvotes: 1000}), 'No reviews · Not rated');
assert.equal(label({editorialScore: '9.2', reviewsCount: 4}), '4 reviews · 9.2/10');
assert.equal(label({editorialScore: 0, reviewsCount: 0}), 'No reviews · 0.0/10');
for (const score of [null, '', 'invalid', Infinity, -1, 11]) {
  assert.equal(label({editorialScore: score}), 'No reviews · Not rated');
}
assert.ok(!source.includes('4.95 -'), 'No rank-derived ratings');
assert.ok(!source.includes('(prod.upvotes || 80) * 4'), 'No upvote-derived review counts');
assert.ok(!source.includes('editorialScore || 9.4'), 'No manufactured comparison score');
console.log('UI data integrity checks passed (source-level only).');
