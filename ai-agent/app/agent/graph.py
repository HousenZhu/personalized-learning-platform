import json
import re
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from app.agent.prompts import SYSTEM_PROMPT
from app.config import get_settings
from app.tools import ToolContext, build_learning_tools


class AgentState(MessagesState):
    course_id: str | None
    turn_start_index: int
    tool_iterations: int
    answer: str
    citations: list[dict[str, Any]]
    study_plan: dict[str, Any] | None
    grounded: bool


def _message_text(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(block.get("text", "")) if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content)


def _extract_tool_artifacts(
    messages: list[BaseMessage],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    citations: list[dict[str, Any]] = []
    study_plan: dict[str, Any] | None = None
    seen: set[tuple[str, int | None, str]] = set()
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        try:
            payload = json.loads(_message_text(message))
        except (json.JSONDecodeError, TypeError):
            continue
        for citation in payload.get("citations", []):
            key = (citation["content_id"], citation.get("page"), citation["excerpt"])
            if key not in seen:
                citations.append(citation)
                seen.add(key)
        if payload.get("study_plan"):
            study_plan = payload["study_plan"]
    return citations, study_plan


def _tool_kinds(messages: list[BaseMessage]) -> set[str]:
    kinds: set[str] = set()
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        try:
            payload = json.loads(_message_text(message))
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(payload.get("kind"), str):
            kinds.add(payload["kind"])
    return kinds


def build_agent_graph(context: ToolContext, checkpointer: Any) -> Any:
    settings = get_settings()
    tools = build_learning_tools(context)
    model = ChatOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=2,
        streaming=True,
        temperature=0.2,
    ).bind_tools(tools)

    async def validate_node(state: AgentState) -> dict[str, Any]:
        return {
            "course_id": state.get("course_id"),
            "turn_start_index": max(len(state["messages"]) - 1, 0),
            "tool_iterations": 0,
            "citations": [],
            "study_plan": None,
            "grounded": False,
        }

    async def agent_node(state: AgentState) -> dict[str, Any]:
        response = await model.ainvoke([SystemMessage(content=SYSTEM_PROMPT), *state["messages"]])
        return {
            "messages": [response],
            "tool_iterations": state.get("tool_iterations", 0) + 1,
        }

    def route_after_agent(state: AgentState) -> Literal["tools", "verify"]:
        last = state["messages"][-1]
        has_tool_calls = isinstance(last, AIMessage) and bool(last.tool_calls)
        if has_tool_calls and state.get("tool_iterations", 0) <= settings.max_tool_iterations:
            return "tools"
        return "verify"

    async def verify_node(state: AgentState) -> dict[str, Any]:
        turn_messages = state["messages"][state.get("turn_start_index", 0) :]
        citations, study_plan = _extract_tool_artifacts(turn_messages)
        last_ai = next(
            (message for message in reversed(turn_messages) if isinstance(message, AIMessage)),
            None,
        )
        answer = _message_text(last_ai) if last_ai else ""
        kinds = _tool_kinds(turn_messages)
        required_kinds: list[set[str]] = []
        if re.search(r"(?:\bscore\b|\bgrade\b|\bquiz\b)", answer, re.I):
            required_kinds.append({"assessment_performance", "study_plan"})
        if re.search(r"(?:\bprogress\b|\benrolled\b|\bcourse completion\b)", answer, re.I):
            required_kinds.append({"student_profile", "study_plan"})
        if re.search(r"(?:\bdue\b|\bdeadline\b)", answer, re.I):
            required_kinds.append({"deadlines", "study_plan"})
        grounded = all(bool(kinds & allowed) for allowed in required_kinds)

        if not answer:
            answer = "I could not complete that request within the safe tool-call limit. Please narrow the question."
        elif not grounded:
            answer = (
                "I do not have verified learning records for that claim, so I will not guess. "
                "Please ask me to check your progress, assessments, or deadlines explicitly."
            )
        elif citations and "[Source" not in answer:
            source_labels = ", ".join(
                f"[Source {index}] {citation['title']}"
                for index, citation in enumerate(citations, start=1)
            )
            answer = f"{answer}\n\nSources: {source_labels}"

        return {
            "answer": answer,
            "citations": citations,
            "study_plan": study_plan,
            "grounded": grounded,
        }

    builder = StateGraph(AgentState)
    builder.add_node("validate", validate_node)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", ToolNode(tools, handle_tool_errors=True))
    builder.add_node("verify", verify_node)
    builder.add_edge(START, "validate")
    builder.add_edge("validate", "agent")
    builder.add_conditional_edges(
        "agent",
        route_after_agent,
        {"tools": "tools", "verify": "verify"},
    )
    builder.add_edge("tools", "agent")
    builder.add_edge("verify", END)
    return builder.compile(checkpointer=checkpointer)
