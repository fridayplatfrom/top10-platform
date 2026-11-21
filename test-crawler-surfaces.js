// Isolated crawler regression audit. Never touches the deployment DB or a live server.
// Port override is deliberately not supported; this worker owns localhost:3474.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert/strict');
const ROOT = __dirname, PORT = 3474, BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'top10-crawler-'));
const dbPath = path.join(dir, 'db.json');
const key = 'crawler-test-only-not-a-production-key';
const cat = (slug, status) => ({id: slug, slug, title: `Top 10 ${slug}`, shortName: slug, status,
  scheduledAt: status === 'scheduled' ? '2099-01-01T00:00:00.000Z' : undefined,
  updatedAt: '2026-11-19T00:00:00Z', products: [1,2,3].map(n => ({id:`p${n}`,name:`${slug} pick ${n}`,companyName:'Fixture',website:'https://example.com',tagline:'Fixture only',amountPaid:0})), comments: []});
fs.writeFileSync(dbPath, JSON.stringify({categories:[cat('crawler-public','published'),cat('crawler-private','draft'),cat('crawler-future','scheduled')], users:[], apiKeys:[{id:'test',key,active:true}], platformStats:{minEntryBid:49}, articles:[]}));
const env = {...process.env, PORT:String(PORT), DB_PATH:dbPath, BASE_URL:BASE, EDITORIAL_PUBLISH_KEY:key, NODE_ENV:'test'};
for (const name of Object.keys(env)) if (/^(DB_|MYSQL_)/.test(name) && name !== 'DB_PATH') delete env[name];
const server = spawn(process.execPath, ['server.js'], {cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
let log = '', failed = 0, passed = 0;
server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
async function get(route, options={}) { const r = await fetch(BASE+route,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)});return {status:r.status,headers:r.headers,text:await r.text()}; }
async function check(name, fn) { try {await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,':',e.message);} }
async function excluded(slug) {
 for (const route of ['/', '/api/state','/sitemap.xml','/llms.txt','/llms-full.txt','/feed.xml']) {
  const r = await get(route);assert.equal(r.status,200,route);assert(!r.text.includes(slug),`${route} exposes ${slug}`);
 }
 for(const route of [`/list/${slug}`,`/compare/${slug}/p1-vs-p2`]) assert.equal((await get(route)).status,404,route);
}
(async()=>{
 try {
  let ready = false;
  for(let i=0;i<100;i++){
    if(server.exitCode!==null) throw Error(log);
    if(log.includes(`running at http://localhost:${PORT}`)){await get('/robots.txt');ready=true;break;}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready, 'isolated server did not start; refusing requests to any other process');
  await check('read-only fixture: public SSR/canonical/JSON-LD',async()=>{const r=await get('/list/crawler-public');assert.equal(r.status,200);assert(r.text.includes(`href="${BASE}/list/crawler-public"`));const j=r.text.match(/id="seoJsonLdScript">([\s\S]*?)<\/script>/);assert(j);JSON.parse(j[1]);assert(r.text.includes('crawler-public pick 1'));});
  await check('read-only fixture: private and future exclusions',async()=>{await excluded('crawler-private');await excluded('crawler-future');});
  await check('public sitemap, guides and feed advertise public route',async()=>{for(const route of ['/sitemap.xml','/llms.txt','/llms-full.txt','/feed.xml']) assert((await get(route)).text.includes('/list/crawler-public'),route);});
  await check('intentional legacy sitemap block preserved',async()=>{assert((await get('/robots.txt')).text.includes('Disallow: /sitemap.xml'));assert.equal((await get('/sitemap.xml')).headers.get('x-robots-tag'),'noindex, nofollow');});
  await check('specific AI robots groups also disallow API',async()=>{const text=(await get('/robots.txt')).text;for(const bot of ['GPTBot','PerplexityBot','ClaudeBot']){const group=text.split(`User-agent: ${bot}`)[1]?.split(/User-agent:/)[0];assert(group?.includes('Disallow: /api/'),bot);}});
  await check('draft and future OG images are not public',async()=>{for(const s of ['crawler-private','crawler-future']) assert.equal((await get(`/api/og/${s}.svg`)).status,404,s);});
  await check('index.html redirects or receives canonical SSR',async()=>{const r=await get('/index.html');assert([301,302,307,308].includes(r.status)||r.text.includes(`href="${BASE}/"`),'raw localhost canonical bypass');});
  await check('admin is noindex and missing pages are 404',async()=>{assert((await get('/admin')).text.includes('content="noindex, nofollow"'));assert.equal((await get('/missing-crawler-test')).status,404);});
  await check('query list alias canonicalizes cleanly',async()=>{assert((await get('/?list=crawler-public&utm_source=test')).text.includes(`href="${BASE}/list/crawler-public"`));});
  await check('publishing requires authorization',async()=>{assert.equal((await get('/api/publish/article',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'No auth'})})).status,401);});
  await check('normal API draft remains excluded then published becomes discoverable',async()=>{
    const submit = async status => get('/api/publish/article',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify({title:'Crawler API Created',slug:'crawler-api-created',status,upsert:true,products:[{name:'API product'}]})});
    const draft=await submit('draft');assert([200,201].includes(draft.status),draft.text);await excluded('crawler-api-created');
    const pub=await submit('published');assert([200,201].includes(pub.status),pub.text);
    for(const route of ['/list/crawler-api-created','/sitemap.xml','/llms.txt','/feed.xml']){const r=await get(route);assert.equal(r.status,200);assert(r.text.includes('crawler-api-created'),route);}
  });
 } finally {
  server.kill('SIGTERM'); await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
  fs.rmSync(dir,{recursive:true,force:true});console.log(`Crawler audit: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
