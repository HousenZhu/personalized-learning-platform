// src/app/api/certificates/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const certificateNumber = searchParams.get("number");

    if (!certificateNumber) {
      return NextResponse.json(
        { error: "Certificate number is required" },
        { status: 400 }
      );
    }

    const certificate = await db.certificate.findUnique({
      where: { certificateNumber },
      include: {
        student: {
          select: { name: true },
        },
        course: {
          select: {
            title: true,
            teacher: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!certificate) {
      return NextResponse.json(
        { valid: false, message: "Certificate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      certificate: {
        studentName: certificate.studentName,
        courseName: certificate.courseName,
        completedAt: certificate.completedAt,
        generatedAt: certificate.generatedAt,
        teacherName: certificate.course.teacher.name,
        certificateNumber: certificate.certificateNumber,
      },
    });
  } catch (error) {
    console.error("Certificate verification error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
