import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import jwt


def create_token(user_id: str) -> str:
    secret = os.environ["AGENT_INTERNAL_SECRET"]
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user_id,
            "role": "STUDENT",
            "iss": os.getenv("AGENT_JWT_ISSUER", "learnhub-web"),
            "aud": os.getenv("AGENT_JWT_AUDIENCE", "coursepilot-agent"),
            "iat": now,
            "exp": now + timedelta(seconds=60),
            "jti": uuid4().hex,
        },
        secret,
        algorithm="HS256",
    )


async def run_case(client: httpx.AsyncClient, case: dict[str, Any], token: str) -> dict[str, Any]:
    course_id = case.get("course_id")
    if course_id == "${COURSE_ID}":
        course_id = os.getenv("EVAL_COURSE_ID")
    observed_tools: set[str] = set()
    final: dict[str, Any] = {}
    error: dict[str, Any] | None = None

    async with client.stream(
        "POST",
        "/v1/agent/runs/stream",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": case["prompt"], "course_id": course_id},
    ) as response:
        response.raise_for_status()
        event = "message"
        async for line in response.aiter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if event == "tool_status" and payload["status"] == "started":
                    observed_tools.add(payload["name"])
                elif event == "final":
                    final = payload
                elif event == "error":
                    error = payload

    expected_tools = set(case.get("expected_tools", []))
    tool_pass = expected_tools.issubset(observed_tools)
    citation_pass = not case.get("citation_required", False) or bool(final.get("citations"))
    forbidden_pass = all(
        phrase.lower() not in final.get("answer_markdown", "").lower()
        for phrase in case.get("forbidden_phrases", [])
    )
    return {
        "id": case["id"],
        "category": case["category"],
        "passed": tool_pass and citation_pass and forbidden_pass and error is None,
        "expected_tools": sorted(expected_tools),
        "observed_tools": sorted(observed_tools),
        "citation_pass": citation_pass,
        "forbidden_pass": forbidden_pass,
        "error": error,
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--cases", type=Path, default=Path(__file__).with_name("cases.jsonl"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("results.json"))
    args = parser.parse_args()

    cases = [json.loads(line) for line in args.cases.read_text().splitlines() if line.strip()]
    token = create_token(os.environ["EVAL_USER_ID"])
    async with httpx.AsyncClient(base_url=args.base_url, timeout=90) as client:
        results = [await run_case(client, case, token) for case in cases]
    passed = sum(result["passed"] for result in results)
    report = {
        "total": len(results),
        "passed": passed,
        "pass_rate": round(passed / len(results), 4) if results else 0,
        "results": results,
    }
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("total", "passed", "pass_rate")}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
