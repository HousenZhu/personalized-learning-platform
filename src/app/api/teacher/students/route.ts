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
    const user = session.user as { id: string; role?: string };
    if (user.role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Find all courses taught by this teacher
    const courses = await db.course.findMany({
      where: { teacherId: user.id },
      include: {
        enrollments: {
          include: {
            student: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    // Flatten students and annotate with course info
    const students = courses.flatMap((course) =>
      course.enrollments.map((enrollment) => ({
        courseId: course.id,
        courseTitle: course.title,
        studentId: enrollment.student.id,
        studentName: enrollment.student.name,
        studentEmail: enrollment.student.email,
      }))
    );
    return NextResponse.json({ students });
  } catch (error) {
    console.error("Failed to fetch teacher's students:", error);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
