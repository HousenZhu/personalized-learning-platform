// src/app/courses/[courseId]/enroll-button.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enrollInCourse } from "@/actions/enrollment";
import { Button, Alert, AlertDescription } from "@/components/ui";

interface EnrollButtonProps {
  courseId: string;
}

export function EnrollButton({ courseId }: EnrollButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEnroll = async () => {
    setLoading(true);
    setError("");

    try {
      await enrollInCourse(courseId);

      router.push(`/dashboard/courses/${courseId}`);
      router.refresh();
    } catch {
      setError("Failed to enroll. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={handleEnroll} loading={loading} className="w-full">
        Enroll Now
      </Button>
    </div>
  );
}
