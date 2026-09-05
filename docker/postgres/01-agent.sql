CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS agent;

-- In production use a separate login with SELECT on public LMS tables and
-- read/write privileges only on the agent schema. The local Docker user owns
-- the database to keep the demo setup reproducible.
