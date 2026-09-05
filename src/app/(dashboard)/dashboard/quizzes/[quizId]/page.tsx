// src/app/(dashboard)/dashboard/quizzes/[quizId]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { TakeQuizForm } from "./take-quiz-form";

interface QuizPageProps {
  params: { quizId: string };
}

export default async function QuizPage({ params }: QuizPageProps) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { id: string; role?: string };

  const quiz = await db.quiz.findUnique({
    where: { id: params.quizId },
    include: {
      module: {
        include: {
          course: {
            include: {
              teacher: { select: { id: true, name: true } },
            },
          },
        },
      },
      questions: {
        orderBy: { order: "asc" },
      },
      attempts: {
        where: { studentId: user.id },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!quiz) {
    notFound();
  }

  const isTeacher = quiz.module.course.teacher.id === user.id;
  const hasAttempts = quiz.attempts.length > 0;
  const scoredAttempts = quiz.attempts.filter(
    (attempt): attempt is typeof attempt & { score: number } => attempt.score !== null
  );
  const bestAttempt = scoredAttempts.reduce<(typeof scoredAttempts)[number] | null>(
    (best, attempt) => !best || attempt.score > best.score ? attempt : best,
    null
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="mb-6">
        <Link href="/dashboard/quizzes" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Quizzes
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{quiz.module.course.title}</p>
              <CardTitle>{quiz.title}</CardTitle>
            </div>
            {bestAttempt && (
              <Badge variant={bestAttempt.score >= quiz.passingScore ? "success" : "secondary"}>
                Best: {bestAttempt.score}%
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg mb-6">
            <div>
              <p className="text-sm text-gray-500">Questions</p>
              <p className="font-medium">{quiz.questions.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Passing Score</p>
              <p className="font-medium">{quiz.passingScore}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Your Attempts</p>
              <p className="font-medium">{quiz.attempts.length}</p>
            </div>
          </div>

          {quiz.description && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-gray-600">{quiz.description}</p>
            </div>
          )}

          {!isTeacher && (
            <TakeQuizForm 
              quizId={quiz.id}
              questions={quiz.questions.map((q: {
                id: string;
                text: string;
                options: unknown;
              }) => {
                const options = typeof q.options === 'string' 
                  ? JSON.parse(q.options) 
                  : q.options;
                return {
                  id: q.id,
                  text: q.text,
                  options: (options as Array<{ id: string; text: string }>).map(opt => ({
                    id: opt.id,
                    text: opt.text,
                  })),
                };
              })}
            />
          )}

          {isTeacher && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Quiz Questions</h3>
              <div className="space-y-4">
                {quiz.questions.map((question: {
                  id: string;
                  text: string;
                  options: unknown;
                  order: number;
                }, index: number) => {
                  const options = typeof question.options === 'string' 
                    ? JSON.parse(question.options) 
                    : question.options;
                  return (
                    <div key={question.id} className="p-4 bg-gray-50 rounded-lg">
                      <p className="font-medium mb-2">
                        {index + 1}. {question.text}
                      </p>
                      <ul className="space-y-1">
                        {(options as Array<{ id: string; text: string; isCorrect: boolean }>).map((option, optIndex: number) => (
                          <li 
                            key={option.id} 
                            className={`text-sm ${option.isCorrect ? 'text-green-600 font-medium' : 'text-gray-600'}`}
                          >
                            {String.fromCharCode(65 + optIndex)}. {option.text}
                            {option.isCorrect && ' ?'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasAttempts && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quiz.attempts.map((attempt: {
                id: string;
                score: number | null;
                passed: boolean;
                submittedAt: Date | null;
              }, index: number) => (
                <div key={attempt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">Attempt {quiz.attempts.length - index}</p>
                    <p className="text-sm text-gray-500">
                      {attempt.submittedAt
                        ? new Date(attempt.submittedAt).toLocaleString()
                        : 'In progress'}
                    </p>
                  </div>
                  <Badge variant={attempt.passed ? "success" : "secondary"}>
                    {attempt.score !== null ? `${attempt.score}%` : "In progress"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
