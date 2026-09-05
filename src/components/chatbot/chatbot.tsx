"use client";

import { useEffect, useRef, useState } from "react";

type Citation = { content_id: string; title: string; page?: number | null; excerpt: string };
type StudyPlan = {
  id: string;
  horizon_days: number;
  items: Array<{
    day: string;
    title: string;
    minutes: number;
    priority: "high" | "medium" | "low";
    reason: string;
  }>;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  studyPlan?: StudyPlan | null;
};
type ToolStatus = { id: string; name: string; status: "started" | "completed" };

const CONVERSATION_KEY = "coursepilot-conversation-id";

function renderMessageContent(content: string) {
  return content.replace(/\r\n/g, "\n").split("\n").map((line, index) => {
    const key = `${index}-${line}`;
    if (line.startsWith("### ")) {
      return <h4 key={key} className="mt-2 font-semibold">{line.slice(4)}</h4>;
    }
    if (line.startsWith("## ")) {
      return <h3 key={key} className="mt-2 font-semibold">{line.slice(3)}</h3>;
    }
    if (line.startsWith("- ")) {
      return <div key={key} className="ml-3 before:mr-2 before:content-['•']">{line.slice(2)}</div>;
    }
    return <div key={key} className="min-h-[1.25rem]">{line || "\u00A0"}</div>;
  });
}

function parseEventBlock(block: string) {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join("\n") };
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedId = window.localStorage.getItem(CONVERSATION_KEY);
    if (!storedId) return;
    setConversationId(storedId);
    const controller = new AbortController();
    fetch(`/api/chatbot?conversationId=${encodeURIComponent(storedId)}`, {
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (!Array.isArray(data.messages)) return;
        setMessages(data.messages.map((message: Omit<Message, "id">, index: number) => ({
          ...message,
          id: `history-${index}`,
        })));
      })
      .catch(() => window.localStorage.removeItem(CONVERSATION_KEY));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolStatuses]);

  async function sendMessage() {
    const userInput = input.trim();
    if (!userInput || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: userInput };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setToolStatuses([]);
    setLoading(true);

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, message: userInput }),
      });
      if (!response.ok || !response.body) throw new Error("Assistant request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const result = await reader.read();
        finished = result.done;
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !finished });
        buffer = buffer.replace(/\r\n/g, "\n");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const parsed = parseEventBlock(block);
          const data = JSON.parse(parsed.data);
          if (parsed.event === "token") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + data.delta }
                : message
            ));
          } else if (parsed.event === "tool_status") {
            setToolStatuses((current) => [
              ...current.filter((status) => status.id !== data.id),
              data,
            ]);
          } else if (parsed.event === "final") {
            setConversationId(data.conversation_id);
            window.localStorage.setItem(CONVERSATION_KEY, data.conversation_id);
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: data.answer_markdown,
                    citations: data.citations,
                    studyPlan: data.study_plan,
                  }
                : message
            ));
          } else if (parsed.event === "error") {
            throw new Error(data.message);
          }
        }
      }
    } catch (error) {
      const content = error instanceof Error ? error.message : "The assistant is unavailable.";
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, content } : message
      ));
    } finally {
      setLoading(false);
      setToolStatuses([]);
    }
  }

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xl hover:bg-blue-700"
        aria-label="Expand chatbot"
      >
        AI Assistant
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between bg-blue-600 px-4 py-2">
        <span className="text-sm font-semibold text-white">CoursePilot</span>
        <button onClick={() => setMinimized(true)} className="text-white hover:text-blue-200" aria-label="Minimize chatbot">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        <div ref={scrollRef} className="mb-3 h-80 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-gray-400">Ask about your courses, progress, or study plan.</p>
          )}
          {messages.map((message) => (
            <div key={message.id} className="text-sm">
              <b>{message.role === "user" ? "You" : "AI"}:</b>
              <div className="mt-1 break-words text-gray-700">{renderMessageContent(message.content)}</div>
              {message.studyPlan && (
                <div className="mt-2 space-y-1 rounded-lg border bg-blue-50 p-2">
                  <p className="font-medium">{message.studyPlan.horizon_days}-day plan</p>
                  {message.studyPlan.items.map((item) => (
                    <div key={`${item.day}-${item.title}`} className="text-xs">
                      <b>{item.day}:</b> {item.title} ({item.minutes} min)
                    </div>
                  ))}
                </div>
              )}
              {!!message.citations?.length && (
                <div className="mt-2 space-y-1">
                  {message.citations.map((citation, index) => (
                    <details key={`${citation.content_id}-${citation.page}-${index}`} className="rounded border p-2 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Source {index + 1}: {citation.title}{citation.page ? `, page ${citation.page}` : ""}
                      </summary>
                      <p className="mt-1 text-gray-600">{citation.excerpt}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
          {toolStatuses.map((tool) => (
            <p key={tool.id} className="text-xs text-blue-600">
              {tool.status === "started" ? "Running" : "Completed"}: {tool.name}
            </p>
          ))}
          {loading && toolStatuses.length === 0 && <p className="text-sm text-gray-400">AI is thinking...</p>}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={input}
            placeholder="Type a message..."
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && sendMessage()}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded bg-blue-600 px-3 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
