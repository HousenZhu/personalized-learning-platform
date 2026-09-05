import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8000";

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createAgentToken(user: { id: string; role?: string }) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AGENT_INTERNAL_SECRET must contain at least 32 characters");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: user.id,
    role: user.role || "STUDENT",
    iss: process.env.AGENT_JWT_ISSUER || "learnhub-web",
    aud: process.env.AGENT_JWT_AUDIENCE || "coursepilot-agent",
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
  }));
  const signature = base64Url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

async function authenticatedAgentRequest(path: string, init?: RequestInit) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = session.user as { id: string; role?: string };
  const requestHeaders = new Headers(init?.headers);
  requestHeaders.set("Authorization", `Bearer ${createAgentToken(user)}`);
  const response = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });
  return { response };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const legacyMessages = Array.isArray(body.messages) ? body.messages : [];
    const lastUserMessage = [...legacyMessages]
      .reverse()
      .find((item) => item?.role === "user" && typeof item.content === "string");
    const message = typeof body.message === "string" ? body.message : lastUserMessage?.content;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await authenticatedAgentRequest("/v1/agent/runs/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: body.conversation_id || null,
        message: message.trim(),
        course_id: body.course_id || null,
      }),
      signal: request.signal,
    });
    if (result.error) return result.error;

    const upstream = result.response!;
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      return NextResponse.json(
        { error: "Agent service unavailable", detail },
        { status: upstream.status || 502 }
      );
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Chatbot proxy error", error);
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    const result = await authenticatedAgentRequest(
      `/v1/conversations/${encodeURIComponent(conversationId)}`
    );
    if (result.error) return result.error;
    const upstream = result.response!;
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    console.error("Conversation proxy error", error);
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body.course_id !== "string" || !body.course_id) {
      return NextResponse.json({ error: "course_id is required" }, { status: 400 });
    }
    const result = await authenticatedAgentRequest(
      `/internal/index/courses/${encodeURIComponent(body.course_id)}`,
      { method: "POST" }
    );
    if (result.error) return result.error;
    const upstream = result.response!;
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    console.error("Course indexing proxy error", error);
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }
}
