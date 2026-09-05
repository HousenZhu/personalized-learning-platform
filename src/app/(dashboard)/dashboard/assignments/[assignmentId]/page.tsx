import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { SubmitAssignmentForm } from "./submit-form";

interface AssignmentPageProps {
  params: { assignmentId: string };
}

export default async function AssignmentPage({ params }: AssignmentPageProps) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user as { id: string; role?: string };

  const assignment = await db.assignment.findUnique({
    where: { id: params.assignmentId },
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
      submissions: {
        where: { studentId: user.id },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!assignment) {
    notFound();
  }

  const isTeacher = assignment.module.course.teacher.id === user.id;
  const submission = assignment.submissions[0];
  const isPastDue = new Date(assignment.deadline) < new Date();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="mb-6">
        <Link href="/dashboard/assignments" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Assignments
        </Link>
      </div>

      {/* Student submission/resubmission block */}
      {!isTeacher && (
        <>
          {submission && submission.status === "GRADED" ? (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Your Submission</h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Submitted on</p>
                  <p>{new Date(submission.submittedAt).toLocaleString()}</p>
                </div>
                {submission.content && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Your Answer</p>
                    <p className="whitespace-pre-wrap">{submission.content}</p>
                  </div>
                )}
                {submission.fileUrl && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Attached File</p>
                    <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View File
                    </a>
                  </div>
                )}
                {submission.feedback && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-800 font-medium mb-1">Instructor Feedback</p>
                    <p className="text-green-700 whitespace-pre-wrap">{submission.feedback}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">{submission ? "Edit & Resubmit Your Work" : "Submit Your Work"}</h3>
              {isPastDue ? (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-700">This assignment is past due and cannot be submitted.</p>
                </div>
              ) : (
                <SubmitAssignmentForm
                  assignmentId={assignment.id}
                  initialContent={submission?.content ?? undefined}
                  initialFileUrl={submission?.fileUrl ?? undefined}
                />
              )}
            </div>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{assignment.module.course.title} {assignment.module?.title ? `| ${assignment.module.title}` : ''}</p>
              <CardTitle>{assignment.title}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isPastDue && <Badge variant="destructive">Past Due</Badge>}
              {submission && (
                <Badge variant={submission.status === "GRADED" ? "success" : "secondary"}>
                  {submission.status === "GRADED" ? "Graded" : "Submitted"}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">Due Date</p>
              <p className="font-medium">{
                (() => {
                  const date = assignment.deadline ? new Date(assignment.deadline) : null;
                  return date && !isNaN(date.getTime())
                    ? date.toLocaleString()
                    : "No due date";
                })()
              }</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Max Score</p>
              <p className="font-medium">{assignment.maxScore} points</p>
            </div>
            {submission?.grade !== null && submission?.grade !== undefined && (
              <div>
                <p className="text-sm text-gray-500">Your Grade</p>
                <p className="font-medium text-green-600">{submission.grade}/{assignment.maxScore}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Instructions</h3>
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-600 whitespace-pre-wrap">{assignment.description}</p>
            </div>
          </div>

          {isTeacher && (
            <div className="border-t pt-6">
              <Link href={`/dashboard/assignments/${assignment.id}/submissions`}>
                <Button>View All Submissions</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

