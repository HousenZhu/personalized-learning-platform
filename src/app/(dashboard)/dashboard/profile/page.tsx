// src/app/(dashboard)/dashboard/profile/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { id: string; name?: string; email: string; role?: string; image?: string };

  // Get user stats
  const enrollmentCount = await db.enrollment.count({
    where: { studentId: user.id },
  });

  const certificateCount = await db.certificate.count({
    where: { studentId: user.id },
  });

  const quizAttempts = await db.quizAttempt.findMany({
    where: { 
      studentId: user.id,
      submittedAt: { not: null },
    },
    select: { score: true, passed: true },
  });

  const scoredAttempts = quizAttempts.filter(
    (attempt): attempt is { score: number; passed: boolean } => attempt.score !== null
  );
  const avgQuizScore = scoredAttempts.length > 0
    ? scoredAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / scoredAttempts.length
    : 0;

  const passedQuizzes = quizAttempts.filter((attempt) => attempt.passed).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-gray-600">Manage your account settings</p>
        </div>
        <Badge variant={user.role === "TEACHER" ? "default" : "secondary"}>
          {user.role || "STUDENT"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm 
            initialName={user.name || ""} 
            email={user.email}
          />
        </CardContent>
      </Card>

      {user.role === "STUDENT" && (
        <Card>
          <CardHeader>
            <CardTitle>Learning Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Enrolled Courses</p>
                <p className="text-2xl font-bold text-blue-600">{enrollmentCount}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Certificates Earned</p>
                <p className="text-2xl font-bold text-green-600">{certificateCount}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600">Quizzes Passed</p>
                <p className="text-2xl font-bold text-purple-600">{passedQuizzes}</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-gray-600">Average Quiz Score</p>
                <p className="text-2xl font-bold text-orange-600">{avgQuizScore.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {user.role === "TEACHER" && (
        <TeacherStats userId={user.id} />
      )}
    </div>
  );
}

async function TeacherStats({ userId }: { userId: string }) {
  const courseCount = await db.course.count({
    where: { teacherId: userId },
  });

  const totalStudents = await db.enrollment.count({
    where: { course: { teacherId: userId } },
  });

  const totalAssignments = await db.assignment.count({
    where: { module: { course: { teacherId: userId } } },
  });

  const totalQuizzes = await db.quiz.count({
    where: { module: { course: { teacherId: userId } } },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teaching Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">Courses Created</p>
            <p className="text-2xl font-bold text-blue-600">{courseCount}</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Students</p>
            <p className="text-2xl font-bold text-green-600">{totalStudents}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-gray-600">Assignments</p>
            <p className="text-2xl font-bold text-purple-600">{totalAssignments}</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <p className="text-sm text-gray-600">Quizzes</p>
            <p className="text-2xl font-bold text-orange-600">{totalQuizzes}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
