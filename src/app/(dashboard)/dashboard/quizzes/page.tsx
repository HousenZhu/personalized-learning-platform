// src/app/(dashboard)/dashboard/quizzes/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";

export default async function QuizzesPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { id: string; role?: string };
  const isTeacher = user.role === "TEACHER";

  if (isTeacher) {
    // Teacher view
    const quizzes = await db.quiz.findMany({
      where: {
        module: {
          course: { teacherId: user.id },
        },
      },
      include: {
        module: {
          include: {
            course: { select: { title: true } },
          },
        },
        _count: { select: { attempts: true, questions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quizzes</h2>
          <p className="text-gray-600">View and manage quizzes across your courses.</p>
        </div>

        {quizzes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No quizzes yet. Create quizzes in your course modules.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((quiz: {
              id: string;
              title: string;
              passingScore: number;
              module: { course: { title: string } };
              _count: { attempts: number; questions: number };
            }) => (
              <Card key={quiz.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <p className="text-sm text-gray-500">{quiz.module.course.title}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span>{quiz._count.questions} questions</span>
                    <span>{quiz._count.attempts} attempts</span>
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    Passing score: {quiz.passingScore}%
                  </div>
                  <Link href={`/dashboard/quizzes/${quiz.id}`}>
                    <Button variant="outline" className="w-full">View Details</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Student view
  const quizAttempts = await db.quizAttempt.findMany({
    where: { studentId: user.id },
    include: {
      quiz: {
        include: {
          module: {
            include: {
              course: { select: { title: true } },
            },
          },
          _count: { select: { questions: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  // Get available quizzes from enrolled courses
  const availableQuizzes = await db.quiz.findMany({
    where: {
      module: {
        course: {
          enrollments: {
            some: { studentId: user.id },
          },
        },
      },
    },
    include: {
      module: {
        include: {
          course: { select: { title: true } },
        },
      },
      _count: { select: { questions: true } },
      attempts: {
        where: { studentId: user.id },
        select: { id: true, score: true, passed: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Quizzes</h2>
        <p className="text-gray-600">View available quizzes and your past attempts.</p>
      </div>

      {availableQuizzes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">No quizzes available. Enroll in courses to access quizzes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableQuizzes.map((quiz: {
            id: string;
            title: string;
            passingScore: number;
            module: { course: { title: string } };
            _count: { questions: number };
            attempts: Array<{ id: string; score: number | null; passed: boolean }>;
          }) => {
            const scoredAttempts = quiz.attempts.filter(
              (attempt): attempt is { id: string; score: number; passed: boolean } =>
                attempt.score !== null
            );
            const bestAttempt = scoredAttempts.reduce<(typeof scoredAttempts)[number] | null>(
              (best, attempt) => !best || attempt.score > best.score ? attempt : best,
              null
            );
            
            return (
              <Card key={quiz.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{quiz.title}</CardTitle>
                      <p className="text-sm text-gray-500">{quiz.module.course.title}</p>
                    </div>
                    {bestAttempt && (
                      <Badge variant={bestAttempt.passed ? "success" : "secondary"}>
                        {bestAttempt.passed ? "Passed" : `${bestAttempt.score}%`}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-500 mb-4">
                    <p>{quiz._count.questions} questions</p>
                    <p>Passing score: {quiz.passingScore}%</p>
                    {quiz.attempts.length > 0 && (
                      <p>{quiz.attempts.length} attempt(s)</p>
                    )}
                  </div>
                  <Link href={`/dashboard/quizzes/${quiz.id}`}>
                    <Button className="w-full">
                      {quiz.attempts.length > 0 ? "Retake Quiz" : "Start Quiz"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
