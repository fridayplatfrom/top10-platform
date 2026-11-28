> **Quick answer.** The useful comparison here is deployment cost for the same dataset. Use your own vector count, index dimensions, query rate, recall target and replica count. Compare search load, storage and embedding charges separately.

## How we compared

We used published vendor plans, product pages, support documentation and official storefronts. Where we could verify a price, we noted the applicable plan, market or model. Quote-only, variable and older listings have pricing notes that explain what to check.

## At a glance

| Pick | Pricing or availability | Official source |
| --- | --- | --- |
| Pinecone | Starter is free; Standard has a US$50 monthly minimum with usage-based charges | [Check source](https://www.pinecone.io/pricing/) |
| Qdrant | Open-source self-hosting or managed Qdrant Cloud plans | [Check source](https://qdrant.tech/pricing/) |
| Weaviate | Managed tiers and usage-specific pricing; self-hosting is a separate option | [Check source](https://weaviate.io/pricing) |
| Zilliz Cloud | Managed Milvus-based plans, with different serverless and dedicated meters | [Check source](https://zilliz.com/pricing) |
| Amazon OpenSearch Service | Published AWS resource rates; price provisioned versus serverless separately | [Check source](https://aws.amazon.com/opensearch-service/pricing/) |
| Elastic Cloud | Hosted and serverless prices depend on deployment and usage | [Check source](https://www.elastic.co/pricing/) |
| Azure AI Search | Tiers are priced by capacity and region, with optional features separately priced | [Check source](https://azure.microsoft.com/en-us/pricing/details/search/) |
| pgvector | Open-source Postgres extension; pay for your database, storage and operations | [Check source](https://github.com/pgvector/pgvector) |
| MongoDB Atlas Vector Search | Atlas deployment costs and dedicated search capacity depend on setup | [Check source](https://www.mongodb.com/products/platform/atlas-vector-search) |
| Redis | Managed cloud plans or a self-managed deployment; capacity depends on your data | [Check source](https://redis.io/pricing/) |

## Who each pick suits

### 1. Pinecone

**Best for** — Teams that want a managed service focused on vector retrieval.

**Trade-off** — Filter use, storage and read volume can change the unit economics. [Official source](https://www.pinecone.io/pricing/)

### 2. Qdrant

**Best for** — Teams that need payload filters and want a choice of hosting models.

**Trade-off** — Self-hosted capacity and backups need an owner; managed clusters have resource costs. [Official source](https://qdrant.tech/pricing/)

### 3. Weaviate

**Best for** — Teams comparing semantic, keyword and hybrid retrieval.

**Trade-off** — Budget separately for any external embedding or reranking model. [Official source](https://weaviate.io/pricing)

### 4. Zilliz Cloud

**Best for** — Teams that want managed vector infrastructure with Milvus compatibility.

**Trade-off** — A serverless pricing unit does not map directly to a fixed-cluster bill. [Official source](https://zilliz.com/pricing)

### 5. Amazon OpenSearch Service

**Best for** — AWS teams combining vector retrieval with search and filtering.

**Trade-off** — Baseline capacity and storage can dominate a small workload. [Official source](https://aws.amazon.com/opensearch-service/pricing/)

### 6. Elastic Cloud

**Best for** — Teams that already use Elasticsearch for text search and need hybrid retrieval.

**Trade-off** — Size the vector index and retention together instead of assuming spare text-search capacity. [Official source](https://www.elastic.co/pricing/)

### 7. Azure AI Search

**Best for** — Teams deploying within Azure who want a managed search layer.

**Trade-off** — Identify minimum supported tier and compute replica needs for a production SLA. [Official source](https://azure.microsoft.com/en-us/pricing/details/search/)

### 8. pgvector

**Best for** — Teams that want vector similarity near existing relational records.

**Trade-off** — High search traffic and index memory can compete with transactional workloads. [Official source](https://github.com/pgvector/pgvector)

### 9. MongoDB Atlas Vector Search

**Best for** — Teams that already store documents in Atlas.

**Trade-off** — Benchmark isolation and index rebuild time when scaling search nodes. [Official source](https://www.mongodb.com/products/platform/atlas-vector-search)

### 10. Redis

**Best for** — Teams already operating Redis that want to test low-latency vector queries.

**Trade-off** — Memory sizing and persistence can materially change the cost per indexed vector. [Official source](https://redis.io/pricing/)
