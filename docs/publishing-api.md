# Publishing API integration guide

Source-reviewed against `server.js` on 2026-11-19, including authenticated detail reads and optional list pagination added during this audit. This is an application API, not a claim of production deployment or a versioned compatibility guarantee. Examples contain placeholders only and have not been sent to a live service.

## Two different content models

- **Directory/editorial articles** live in `db.categories`, contain ranked products, and render at `/list/:slug`. The `/api/publish/*` routes below operate on these records. A taxonomy category is a separate topic, not a directory article.
- **Blog posts** live in `db.articles` and use `/api/blog`. They are not returned by `/api/publish/articles`, and a publishing key does not authorize their writes. Do not mix the two models in a client.

## Authentication and transport

Use HTTPS and a server-to-server client. Supply the configured EDITORIAL_PUBLISH_KEY as an X-API-Key header. Authorization: Bearer also accepts the publishing key. If both headers are present, X-API-Key takes precedence.

An authenticated editor can also publish with the top10_session cookie. POST /api/auth/login accepts the configured editor email and password and sets the cookie. Sessions are stored durably, expire after eight hours, and are invalidated when the editor password is changed. GET /api/auth/me reads the current session. POST /api/auth/logout revokes it.

Keys are broad editorial credentials, **not read-only or per-article scoped credentials**. Keep them out of browser bundles, URLs, analytics, logs and public repositories. A separate backend is the appropriate integration boundary. General cross-origin browser API support is not established; the public SSE endpoint's wildcard CORS header is not a general API CORS policy.

Send JSON with `Content-Type: application/json`. The parser accepts an empty body as `{}`, returns 400 for malformed JSON, and destroys the request when its accumulated text exceeds approximately two million characters; do not depend on a structured 413 response. Ordinary validation failures return `{ "error": "..." }`. Authentication denial is currently 401, missing resources 404, and duplicate-slug conflicts 409. Unexpected failures may return 500. Validate response status and content type before parsing; an unsupported API route/method is not guaranteed to produce a JSON API error.

## Article endpoints

All endpoints in this table require a publishing key or admin session.

| Method | Preferred path | Result / notes |
|---|---|---|
| GET | `/api/publish/articles` | List enriched directory articles, including non-public records, optionally filtered/paginated. |
| GET | `/api/publish/article/:slug` | `{ "article": { ... } }`, or 404. Read a draft without publishing it. |
| POST | `/api/publish/article` | Create, or upsert with `upsert: true`; 201 created, 200 updated. |
| PUT / PATCH | `/api/publish/article/:slug` | Partial update semantics for both verbs; 200. |
| POST | `/api/publish/article/:slug/publish-now` | Publish immediately, clear scheduledAt, set publishedAt; 200. |
| DELETE | `/api/publish/article/:slug` | Remove the directory article; 200. No restore endpoint is provided. |
| POST | `/api/admin/scheduler/run` | Process due scheduled directory articles; returns success, promotedCount, promotedSlugs and state. Despite the admin prefix, accepts a publishing key. |

Aliases: listing also supports `/api/admin/articles`. Creation also supports `/api/admin/publish/article` and `/api/articles`. Detail/update/delete/publish-now support either `publish` or `admin` prefix and singular `article` or plural `articles` segment. Prefer one canonical spelling in clients.

Create/update/publish-now responses include `success`, enriched `article`, and `state`; create additionally includes `url`, `status`, `scheduledAt`. Delete returns `success` and `state`. The returned state is generated from the **session**, not the key: a key-only request receives public-state visibility, not the complete editorial inventory. Use the explicit article/list result, not state, to verify a draft.

### List filters and pagination

Supported query parameters, combined with AND:

- `status`: exact status match (`draft`, `scheduled`, `published`). Unknown values match no records rather than producing an enum-validation error.
- `topic`: exact normalized topic slug.
- `authorId`: exact author identifier.
- `tag`: compared after lowercasing the query value.
- `limit`: decimal integer 1–100.
- `offset`: nonnegative safe integer.

Without either pagination parameter, the legacy response remains `{ "count": N, "articles": [...] }` for **all** matching records. With either parameter, defaults are limit 50 and offset 0, and the result is `{ "count": N, "total": T, "limit": L, "offset": O, "nextOffset": null, "articles": [...] }`. `nextOffset` is the next offset or null when exhausted. Invalid pagination yields 400. Ordering follows database array order, not a documented date sort. Offset pagination can shift under concurrent edits; there is no snapshot or cursor guarantee.

```sh
BASE_URL='https://<YOUR_HOST>'
# Provision PUBLISHING_KEY in your secret manager/environment, not in source control.
curl --fail-with-body --get "$BASE_URL/api/publish/articles" \
  -H "X-API-Key: $PUBLISHING_KEY" \
  --data-urlencode 'status=draft' --data-urlencode 'topic=software' \
  --data-urlencode 'limit=25' --data-urlencode 'offset=0'

curl --fail-with-body "$BASE_URL/api/publish/article/<ARTICLE_SLUG>" \
  -H "X-API-Key: $PUBLISHING_KEY"
```

### Create payload

Required: nonempty `title` or `editorialTitle`. Use an explicit stable ASCII `slug` for reliable retries. Slugs are lowercased, non-alphanumeric runs become hyphens, and edge hyphens are removed. An unusable generated slug falls back to a timestamp. Existing slug returns 409 unless `upsert: true`.

Supported fields:

- Presentation: `title`, `editorialTitle`, `subtitle`, `tagline`, `description`, `editorialIntro`, `methodology`, `icon`, `iconText`, `iconBg`, `iconColor`, `coverImage`, `monthlyViews`.
- Structure: `criteria` array, `faqs` array, `products` array (creation also accepts `items`).
- Attribution: `authorId`, `authorName`, or `author` (string or object with name/role/avatar/bio); overrides `authorRole`, `authorAvatar`, `authorBio`.
- Classification: `topic` or `categoryGroup`; optional `topicName`/`categoryName`, `topicIcon`, `topicDescription` when creating a previously unknown topic; `tags` array or comma-delimited string.
- SEO: `seo.metaTitle`, `seo.metaDescription`, `seo.focusKeyword`.
- Workflow: `status`, `scheduledAt`, `upsert`.

Creation prefixes the directory title with “Top 10” when absent. Server defaults generate presentation text and engagement metrics; those defaults are not evidence of real reviews, traffic or verification. Supply verified editorial content and measured metrics rather than presenting generated defaults as factual claims.

Product objects support `id`, `name` (or `title`), `companyName` (or `company`), `tagline` (or `summary`), `website` (or `url`), `pricingTag` (or `pricing`/`startingPrice`), `highlightTag` (or `badge`), `editorialSummary` (or `description`), `pros`, `cons`, `specs`, `media` (or `image`/`heroImage`), logo fields, `amountPaid`, `ownerEmail`, `clicks`, `upvotes`. String items are also accepted but generate substantial defaults. Use objects with stable IDs. Do not use editorial ingestion to represent payment collection: amountPaid is an accepted field, not proof of payment processing.

Example draft payload (`draft.json`):

```json
{
  "slug": "example-tool-guide",
  "title": "Example Tool Guide",
  "status": "draft",
  "topic": "software",
  "tags": ["example"],
  "editorialIntro": "<REVIEWED_INTRODUCTION>",
  "methodology": "<ACTUAL_EVALUATION_METHOD>",
  "products": [{
    "id": "example-product",
    "name": "Example Product",
    "website": "https://example.com",
    "tagline": "<FACT_CHECKED_SUMMARY>",
    "clicks": 0,
    "upvotes": 0
  }]
}
```

```sh
# Writes a draft. Run only against your authorized environment.
curl --fail-with-body "$BASE_URL/api/publish/article" \
  -H "X-API-Key: $PUBLISHING_KEY" -H 'Content-Type: application/json' \
  --data-binary @draft.json
```

PUT/PATCH update a subset of creation fields: title, tagline, subtitle, description, icon, monthlyViews, criteria, faqs, products, and the shared editorial/author/topic/tags/SEO/workflow fields. They do not rename the slug. An empty products array does **not** clear products; zero monthlyViews does not replace an existing nonzero value. Cover image cannot be cleared with an empty string through the shared handler. SEO missing/empty values fall back to existing values. Do not treat these operations as JSON Merge Patch or full replacement. Upsert is likewise not identical to PATCH. No ETag, If-Match, revision check or idempotency-key contract is implemented.

### Publication lifecycle

Always specify `status: "draft"` while preparing content: default creation is **published**. Allowed statuses are draft, scheduled and published. Invalid status returns 400.

A parseable `scheduledAt` is normalized to UTC ISO format. Prefer RFC3339 with explicit timezone (for example `<FUTURE_ISO_TIMESTAMP>`), never an ambiguous local date. A future timestamp makes the item scheduled unless status explicitly says draft; a past timestamp publishes it unless explicitly draft. `status: "scheduled"` requires a new or existing scheduledAt. The parser uses JavaScript Date.parse, not a strict ISO validator. Sending null/empty scheduledAt does not reliably clear an existing schedule through the shared field updater; publish-now explicitly clears it.

The scheduler runs at startup and approximately every 15 seconds. A running process is needed; it is not an external durable job queue. Verify the resulting article status with the authenticated detail read before assuming publication. Publish-now is a deliberate immediate publication action, not a preview endpoint.

## Authors, topics and tags

| Read | Write (publishing key/admin) | Delete (publishing key/admin) |
|---|---|---|
| GET `/api/authors` | POST `/api/publish/authors` | DELETE `/api/admin/authors/:id` |
| GET `/api/taxonomy/categories` | POST `/api/publish/categories` | DELETE `/api/admin/taxonomy/categories/:slug` |
| GET `/api/tags` | POST `/api/publish/tags` | DELETE `/api/admin/tags/:slug` |

Reads are public. Authors include email and counts across all publication states only for an authorized key/admin; public author responses omit email and count public articles. Topic/tag read counts remain public-only. POST aliases are `/api/admin/authors`, `/api/admin/taxonomy/categories`, `/api/admin/tags`.

Author POST requires name and accepts id, role/jobTitle, avatar/image, bio, location, email, expertise, twitter, linkedin, verified. Same id updates; omitted fields can be replaced with defaults, so send the full intended author profile. Returns 201 with success, author, state for both creation and update.

Topic POST requires name/title; accepts slug, icon, description, upsert. Duplicate without upsert is 409; success is 201 with success, category, state. Tag POST accepts tags/tag/name, normalizes names, and returns 201 with success, added, tags, state. Tag deletion also removes that tag from directory articles. Built-in authors and topics cannot be deleted (409). Before deleting a custom author or topic, review dependent articles; deletion does not migrate them.

## Blog and auxiliary reads

`GET /api/blog` returns a bare array `[...]`; `GET /api/blog/:slug` returns the bare article object `{...}` (unlike publishing endpoint envelopes). Blog POST/PUT/DELETE require **admin sessions**, not publishing keys. Blog creation requires title, uses an independent slug namespace, and returns 409 for an existing slug. It accepts content/contentHtml, excerpt, subtitle, author fields, category/categorySlug, readTime, cover fields, takeaways/keyTakeaways and status. This is a separate contract with no unified scheduler or editorial-key support.

Use the directory publishing API for draft or scheduled workflows, not the legacy blog API.

`GET /api/state` is a broad application bootstrap, not a compact search API. Public categories are publication-filtered; admin session state includes additional administration data. `GET /api/events/live-bids` is public SSE, not an authenticated webhook or replayable change feed. Public sitemap, RSS and LLM discovery documents are presentation/discovery surfaces rather than administrative inventory APIs.

## Key management and recommended safe access model

Rotate the publishing key by replacing EDITORIAL_PUBLISH_KEY in the hosting environment and restarting the app. Update the publisher integration to use the new secret. Stored keys from earlier application versions are ignored.

For production integrations, provision a unique admin credential, assign secrets through the server environment, and rotate them without sharing them in chat. Use dedicated least-privilege credentials when scoped keys become available; do not give today's publishing key to a read-only client. Keep audit logs free of credentials, and validate requests before forwarding them.

Useful future read/API ergonomics, **not currently implemented**:

- Public read-only directory detail/list with compact field projection, search, sort and taxonomy/product filters, distinct from privileged inventory.
- `updatedSince`, date-range and cursor pagination for incremental synchronization; stable sort and deleted-record tombstones.
- Narrow author/topic/tag detail reads and editorial counts with explicit visibility semantics.
- Versioned OpenAPI schema, API capability/version endpoint, optimistic concurrency and idempotency for creation.
- Authenticated publication preview and durable authenticated webhook/change feed with delivery IDs and retry semantics.

## Audit validation boundary

This document was checked against route dispatch and handlers, not against a live production host. No production credentials were copied, no live writes were performed, and no exploit requests were made. Lifecycle tests maintained alongside the server should validate the new authenticated read and pagination behavior in an isolated fixture. Deploy the matching server changes before relying on those additions.
