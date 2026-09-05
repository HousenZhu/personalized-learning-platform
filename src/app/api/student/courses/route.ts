import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    // Find all courses the student is enrolled in
    const enrollments = await db.enrollment.findMany({
      where: { studentId: userId },
      include: {
        course: {
          include: { teacher: { select: { name: true } } },
        },
      },
    });
    const courses = enrollments.map((e) => ({
      id: e.course.id,
      title: e.course.title,
      description: e.course.description,
      instructor: e.course.teacher,
    }));
    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Failed to fetch student courses:", error);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
