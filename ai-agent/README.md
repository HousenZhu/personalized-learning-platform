# CoursePilot Agent Service

CoursePilot is a permission-scoped learning agent built on top of the LearnHub LMS. It uses
real course, assessment, progress, and deadline data instead of injecting one large context
string into every prompt.

## What makes this an agent

The service runs one bounded LangGraph state machine. The model can select from six typed
tools, but user identity is captured by the trusted runtime and is never part of a tool's
model-visible arguments. The graph collects evidence, verifies factual responses, persists
conversation state, and emits a typed final artifact.

```text
validate -> agent -> tools -> agent -> verify -> persist
                     ^__________|
```

The tool loop is capped at four rounds. Course and assessment queries are fixed repository
queries; the model cannot generate SQL.

## Local setup

1. Copy the root `.env.example` to `.env`.
2. Install Ollama, run `ollama pull qwen3:4b`, and set a random
   `AGENT_INTERNAL_SECRET` containing at least 32 characters.
3. Start the stack with `docker compose up --build`.
4. Open `http://localhost:3000` and sign in as a student. The demo container applies the
   existing Prisma schema before starting Next.js.

### Windows Docker Desktop

Run the commands from the repository root in PowerShell:

```powershell
docker compose up --build -d
docker compose ps
```

The first Agent image build downloads the local embedding model and can take several
minutes. Open `http://localhost:3000` after `web`, `agent`, and `postgres` are healthy or
running. Use `docker compose logs -f agent web` to follow startup, and stop the stack with
`docker compose down`. Add `-v` only when you intentionally want to delete the local
PostgreSQL data.

The root `.env` value of `DATABASE_URL` is used for native commands. Inside Compose, Web
and Agent use the `postgres` service automatically, so no Windows-specific database host
or path is required. S3 variables are optional until file upload or remote PDF indexing is
used.

The Agent container runs `alembic upgrade head` before starting FastAPI. The embedding model
is baked into the Agent image so PDF retrieval does not require a second hosted model API.
The default chat model runs through Ollama on the Docker host. On Windows and macOS Compose
uses `http://host.docker.internal:11434/v1`; direct Python development uses
`http://localhost:11434/v1`.

For direct Python development:

```bash
cd ai-agent
python -m venv .venv
.venv/Scripts/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

## API contract

All protected endpoints require a short-lived HS256 token created by the Next.js BFF.
Browser clients must not call the Python service directly.

`POST /v1/agent/runs/stream`

```json
{
  "conversation_id": null,
  "message": "Use my grades and deadlines to create a study plan",
  "course_id": null
}
```

The response is an SSE stream containing `token`, `tool_status`, `final`, or `error` events.
The `final` event contains the canonical Markdown answer, citations, optional structured study
plan, suggested actions, conversation ID, and trace ID.

`GET /v1/conversations/{conversation_id}` restores display history after a browser refresh.

`POST /internal/index/courses/{course_id}` indexes PDF content and requires a teacher token
whose user owns the course. Text PDFs are supported; OCR is intentionally outside v1.
The authenticated Next.js equivalent is `PUT /api/chatbot` with `{ "course_id": "..." }`.
Remote PDF hosts are allowlisted, files are size/page bounded, local paths cannot escape the
configured upload root, and unchanged file hashes are not re-embedded.

## Security model

- Better Auth remains the source of identity in Next.js.
- The BFF signs a 60-second token with `sub`, `role`, `iss`, `aud`, `iat`, `exp`, and `jti`.
- The Agent ignores user IDs in request data; Pydantic rejects unknown request properties.
- Repository joins enforce student enrollment for all LMS reads and vector retrieval.
- Retrieved PDF text is untrusted data, not instructions.
- Production deployments should use a database role with `SELECT` on LMS tables and write
  access only to the `agent` schema.

See [architecture.md](docs/architecture.md) for the data flow and tradeoffs and
[demo-script.md](docs/demo-script.md) for an interview walkthrough. Ready-to-adapt resume copy
is in [resume.md](docs/resume.md).

## Quality workflow

```bash
ruff check app tests evals
mypy app --ignore-missing-imports
pytest --cov=app
python evals/run.py --base-url http://localhost:8000
```

The evaluation runner requires `EVAL_USER_ID`, `EVAL_COURSE_ID`, and
`AGENT_INTERNAL_SECRET`. It writes `evals/results.json`; do not claim target metrics on a
resume until this report has been generated against seeded data.

## Deliberate limits

CoursePilot does not use multi-agent orchestration, arbitrary SQL, web search, OCR, queues,
or model fine-tuning. Exact pgvector cosine search is appropriate for the demo corpus; HNSW
can be introduced after corpus size and latency measurements justify it.
