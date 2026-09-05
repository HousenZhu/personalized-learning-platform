// src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Progress, Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";

interface CoursePageProps {
  params: { courseId: string };
}

export default async function CoursePage({ params }: CoursePageProps) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { id: string; role?: string };
  const isTeacher = user.role === "TEACHER";

  const course = await db.course.findUnique({
    where: { id: params.courseId },
    include: {
      teacher: { select: { id: true, name: true } },
      modules: {
        include: {
          contents: true,
          quizzes: {
            include: {
              attempts: {
                where: { studentId: user.id },
                select: { passed: true },
              },
            },
          },
          assignments: {
            include: {
              submissions: {
                where: { studentId: user.id },
                select: { status: true },
              },
            },
          },
        },
        orderBy: { order: "asc" },
      },
      enrollments: {
        where: { studentId: user.id },
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });

  if (!course) {
    notFound();
  }

  const isOwner = course.teacher.id === user.id;
  const isEnrolled = course.enrollments.length > 0;
  const enrollment = course.enrollments[0];

  // If student is not enrolled and course is published, redirect to public course page
  if (!isOwner && !isEnrolled) {
    redirect(`/courses/${params.courseId}`);
  }

  if (isOwner) {
    const courseAnalytics = await db.course.findFirst({
      where: {
        id: params.courseId,
        teacherId: user.id,
      },
      include: {
        enrollments: {
          select: {
            completed: true,
            progress: true,
          },
        },
        modules: {
          include: {
            contents: { select: { id: true } },
            assignments: {
              select: {
                id: true,
                maxScore: true,
                submissions: {
                  select: {
                    status: true,
                    grade: true,
                  },
                },
              },
            },
            quizzes: {
              select: {
                id: true,
                attempts: {
                  select: {
                    passed: true,
                  },
                },
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    return <TeacherCourseView course={course} analytics={courseAnalytics} />;
  }

  return <StudentCourseView course={course} enrollment={enrollment} userId={user.id} />;
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  teacher: { id: string; name: string };
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    contents: Array<{ id: string; title: string; type: string }>;
    quizzes: Array<{ id: string; title: string; attempts: Array<{ passed: boolean }> }>;
    assignments: Array<{ id: string; title: string; deadline: Date; submissions: Array<{ status: string }> }>;
  }>;
  _count: { enrollments: number };
}

function TeacherCourseView({ course, analytics }: { course: CourseData; analytics: any }) {
  const totalStudents = analytics?.enrollments?.length ?? 0;
  const completedStudents = analytics?.enrollments?.filter((e: any) => e.completed).length ?? 0;
  const avgProgress =
    totalStudents > 0
      ? Math.round(
          analytics.enrollments.reduce((sum: number, e: any) => sum + (e.progress ?? 0), 0) /
            totalStudents
        )
      : 0;

  const allAssignments = analytics?.modules?.flatMap((m: any) => m.assignments) ?? [];
  const allQuizzes = analytics?.modules?.flatMap((m: any) => m.quizzes) ?? [];
  const allSubmissions = allAssignments.flatMap((a: any) => a.submissions ?? []);
  const allAttempts = allQuizzes.flatMap((q: any) => q.attempts ?? []);

  const gradedSubmissions = allSubmissions.filter((s: any) => s.status === "GRADED").length;
  const passedAttempts = allAttempts.filter((a: any) => a.passed).length;

  const completionRate = totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0;
  const gradingRate = allSubmissions.length > 0 ? Math.round((gradedSubmissions / allSubmissions.length) * 100) : 0;
  const quizPassRate = allAttempts.length > 0 ? Math.round((passedAttempts / allAttempts.length) * 100) : 0;

  let gradePctSum = 0;
  let gradedCount = 0;
  for (const assignment of allAssignments) {
    for (const submission of assignment.submissions ?? []) {
      if (submission.status === "GRADED" && submission.grade !== null) {
        gradePctSum += (submission.grade / assignment.maxScore) * 100;
        gradedCount += 1;
      }
    }
  }
  const avgGradePct = gradedCount > 0 ? Math.round(gradePctSum / gradedCount) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/courses" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Courses
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">{course.title}</h2>
          <p className="text-gray-600">{course._count.enrollments} students enrolled</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={course.published ? "success" : "secondary"}>
            {course.published ? "Published" : "Draft"}
          </Badge>
          <Link href={`/dashboard/courses/${course.id}/edit`}>
            <Button variant="outline">Edit Course</Button>
          </Link>
        </div>
      </div>

      {course.description && (
        <p className="text-gray-600">{course.description}</p>
      )}

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Course Modules</h3>
            <Link href={`/dashboard/courses/${course.id}/modules/create`}>
              <Button>Add Module</Button>
            </Link>
          </div>

          {course.modules.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500 mb-4">No modules yet. Start building your course content.</p>
                <Link href={`/dashboard/courses/${course.id}/modules/create`}>
                  <Button>Add First Module</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {course.modules.map((module, index) => (
                <Card key={module.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        Module {index + 1}: {module.title}
                      </CardTitle>
                      {module.description && (
                        <p className="text-sm text-gray-500">{module.description}</p>
                      )}
                    </div>
                    <Link href={`/dashboard/courses/${course.id}/modules/${module.id}`}>
                      <Button variant="outline" size="sm">Manage</Button>
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <span>{module.contents.length} contents</span>
                      <span>{module.quizzes.length} quizzes</span>
                      <span>{module.assignments.length} assignments</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle>Enrolled Students</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/dashboard/courses/${course.id}/students`}>
                <Button variant="outline">View All Students</Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="space-y-4">
            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
                  <p className="text-sm text-gray-500">Enrolled Students</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-2xl font-bold text-green-600">{completionRate}%</p>
                  <p className="text-sm text-gray-500">Completion Rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-2xl font-bold text-blue-600">{avgProgress}%</p>
                  <p className="text-sm text-gray-500">Average Progress</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-2xl font-bold text-purple-600">{avgGradePct !== null ? `${avgGradePct}%` : "N/A"}</p>
                  <p className="text-sm text-gray-500">Average Grade</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">{allSubmissions.length}</p>
                  <p className="text-sm text-gray-500 mt-1">{gradedSubmissions} graded ({gradingRate}%)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quiz Attempts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">{allAttempts.length}</p>
                  <p className="text-sm text-gray-500 mt-1">{passedAttempts} passed ({quizPassRate}%)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Course Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">{completedStudents}</p>
                  <p className="text-sm text-gray-500 mt-1">students completed</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Module Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.modules?.length === 0 ? (
                  <p className="text-gray-500">No modules available.</p>
                ) : (
                  <div className="space-y-4">
                    {analytics.modules.map((module: any, index: number) => {
                      const moduleSubmissions = module.assignments.flatMap((a: any) => a.submissions ?? []);
                      const moduleAttempts = module.quizzes.flatMap((q: any) => q.attempts ?? []);
                      const moduleGraded = moduleSubmissions.filter((s: any) => s.status === "GRADED").length;
                      const modulePassed = moduleAttempts.filter((a: any) => a.passed).length;
                      const moduleTotal = moduleSubmissions.length + moduleAttempts.length;
                      const moduleDone = moduleGraded + modulePassed;
                      const modulePct = moduleTotal > 0 ? Math.round((moduleDone / moduleTotal) * 100) : 0;

                      return (
                        <div key={module.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-gray-900">Module {index + 1}: {module.title}</p>
                            <span className="text-sm font-medium text-gray-600">{modulePct}%</span>
                          </div>
                          <Progress value={modulePct} />
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm text-gray-500">
                            <span>{module.contents.length} contents</span>
                            <span>{module.assignments.length} assignments</span>
                            <span>{module.quizzes.length} quizzes</span>
                            <span>{moduleDone}/{moduleTotal} completed</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface EnrollmentData {
  id: string;
  progress: number;
  completed: boolean;
}

async function StudentCourseView({ 
  course, 
  enrollment,
  userId 
}: { 
  course: CourseData; 
  enrollment: EnrollmentData;
  userId: string;
}) {
  const totalItems =
    course.modules.length +
    course.modules.reduce(
      (sum, module) => sum + module.assignments.length + module.quizzes.length,
      0
    );

  const completedItems =
    course.modules.filter((module) =>
      module.quizzes.some((quiz) => quiz.attempts.some((attempt) => attempt.passed))
    ).length +
    course.modules.reduce((sum, module) => {
      const completedAssignments = module.assignments.filter((assignment) =>
        assignment.submissions.some((submission) => submission.status === "GRADED")
      ).length;
      const completedQuizzes = module.quizzes.filter((quiz) =>
        quiz.attempts.some((attempt) => attempt.passed)
      ).length;
      return sum + completedAssignments + completedQuizzes;
    }, 0);

  const completionPct =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/courses" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to My Courses
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">{course.title}</h2>
          <p className="text-gray-500">by {course.teacher.name || 'Unknown Instructor'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Progress</p>
          <p className="text-2xl font-bold text-blue-600">{completionPct}%</p>
        </div>
      </div>

      <Progress value={completionPct} className="h-3" />

      {course.description && (
        <p className="text-gray-600">{course.description}</p>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Course Content</h3>
        
        {course.modules.map((module, index) => (
          <Card key={module.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                Module {index + 1}: {module.title}
              </CardTitle>
              {module.description && (
                <p className="text-sm text-gray-500">{module.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Contents */}
              {module.contents.map((content) => {
                // The current LMS schema tracks course progress, not per-content completion.
                const isCompleted = false;
                return (
                  <Link
                    key={content.id}
                    href={`/dashboard/courses/${course.id}/modules/${module.id}/contents/${content.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <ContentTypeIcon type={content.type} />
                      )}
                    </div>
                    <span className="flex-1">{content.title}</span>
                    <Badge variant="secondary">{content.type}</Badge>
                  </Link>
                );
              })}

              {/* Quizzes */}
              {module.quizzes.map((quiz) => (
                <Link
                  key={quiz.id}
                  href={`/dashboard/quizzes/${quiz.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="flex-1">{quiz.title}</span>
                  <Badge variant="default">Quiz</Badge>
                </Link>
              ))}

              {/* Assignments */}
              {module.assignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`/dashboard/assignments/${assignment.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="flex-1">{assignment.title}</span>
                  <span className="text-sm text-gray-500">
                    Due {(() => {
                      const date = assignment.deadline ? new Date(assignment.deadline) : null;
                      return date && !isNaN(date.getTime())
                        ? date.toLocaleDateString()
                        : "No due date";
                    })()}
                  </span>
                  <Badge variant="secondary">Assignment</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "VIDEO":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "PDF":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
  }
}
