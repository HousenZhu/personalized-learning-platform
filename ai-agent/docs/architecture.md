# Architecture and Engineering Decisions

## Request path

1. A signed-in browser sends a message to the Next.js `/api/chatbot` BFF.
2. Next.js verifies the Better Auth session and signs a 60-second internal JWT.
3. FastAPI validates the JWT and creates an immutable `AuthContext`.
4. A request-scoped tool set closes over that context; no tool exposes `user_id` to the LLM.
5. LangGraph chooses tools, limits the loop, synthesizes an answer, and checks grounding.
6. Tokens and tool lifecycle events stream through the BFF as SSE.
7. Checkpoints, display messages, study plans, and run metadata are persisted separately.

## Data ownership

Prisma continues to own the public LMS schema. Alembic owns only the `agent` schema. Python
reads LMS tables through fixed SQLAlchemy statements because duplicating Prisma's schema in a
second ORM would create migration ownership ambiguity.

Checkpoints are runtime state. `messages` are product display/audit history. Keeping both is
intentional: checkpoint serialization may evolve with LangGraph, while the product history
contract remains stable.

## RAG decisions

- Scope retrieval by enrollment before vector ranking; filtering after retrieval could leak
  another course's text into model context.
- Store content ID, title, page, excerpt, and hash alongside every vector.
- Re-index by deleting and replacing one content item's chunks in a transaction.
- Use exact cosine search for the initial corpus. Approximate HNSW adds tuning and recall
  tradeoffs that are unjustified without scale measurements.
- Treat retrieved text as untrusted. Document instructions never override the system policy.

## Failure handling

- Invalid or expired BFF tokens return 401 before Agent execution.
- Unknown request fields, including `user_id`, return 422.
- Provider calls time out after 25 seconds and retry transient failures at most twice.
- The graph allows at most four model/tool rounds.
- Client disconnects cancel the stream and mark the run failed.
- Error events expose a trace ID, not internal exceptions or prompts.

## Scale path

The first scale step is additional Agent replicas because API and graph construction are
stateless outside PostgreSQL. If vector corpus size makes exact search slow, add HNSW and
measure recall. If ingestion blocks API workers, move only ingestion to a queue; conversational
requests should remain synchronous and bounded.
