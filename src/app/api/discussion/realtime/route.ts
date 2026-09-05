// src/app/api/discussion/realtime/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Store active connections (in production, use Redis or similar)
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId");

  if (!courseId) {
    return new Response("Course ID required", { status: 400 });
  }

  // Verify access to course
  const course = await db.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    return new Response("Course not found", { status: 404 });
  }

  const isTeacher = course.teacherId === session.user.id;
  const enrollment = await db.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId: session.user.id,
        courseId,
      },
    },
  });

  if (!isTeacher && !enrollment) {
    return new Response("Access denied", { status: 403 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Add to connections
      if (!connections.has(courseId)) {
        connections.set(courseId, new Set());
      }
      connections.get(courseId)!.add(controller);

      // Send initial connection message
      const data = JSON.stringify({ type: "connected", courseId });
      controller.enqueue(`data: ${data}\n\n`);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        connections.get(courseId)?.delete(controller);
        if (connections.get(courseId)?.size === 0) {
          connections.delete(courseId);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Helper to broadcast to all connections for a course
function broadcastToCourseTopic(courseId: string, message: unknown) {
  const courseConnections = connections.get(courseId);
  if (!courseConnections) return;

  const data = JSON.stringify(message);
  const controllersArray = Array.from(courseConnections);
  for (const controller of controllersArray) {
    try {
      controller.enqueue(`data: ${data}\n\n`);
    } catch {
      // Connection closed, remove it
      courseConnections.delete(controller);
    }
  }
}

// POST to broadcast a new message
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { courseId, type, payload } = await request.json();

    if (!courseId || !type) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Verify access
    const course = await db.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return new Response("Course not found", { status: 404 });
    }

    const isTeacher = course.teacherId === session.user.id;
    const enrollment = await db.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: session.user.id,
          courseId,
        },
      },
    });

    if (!isTeacher && !enrollment) {
      return new Response("Access denied", { status: 403 });
    }

    // Broadcast the message
    broadcastToCourseTopic(courseId, {
      type,
      payload,
      userId: session.user.id,
      userName: session.user.name,
      timestamp: new Date().toISOString(),
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Broadcast error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
