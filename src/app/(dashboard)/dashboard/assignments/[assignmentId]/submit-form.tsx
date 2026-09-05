// src/app/(dashboard)/dashboard/assignments/[assignmentId]/submit-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAssignment } from "@/actions/submission";
import { Button, Textarea, Alert, AlertDescription } from "@/components/ui";


interface SubmitAssignmentFormProps {
  assignmentId: string;
  initialContent?: string;
  initialFileUrl?: string;
}

export function SubmitAssignmentForm({ assignmentId, initialContent = "", initialFileUrl }: SubmitAssignmentFormProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim() && !file) {
      setError("Please provide your answer or upload a file.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      let fileUrl = "";

      // Upload file if present
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "submissions");

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file");
        }

        const uploadData = await uploadRes.json();
        fileUrl = uploadData.url;
      }

      await submitAssignment({
        assignmentId,
        content,
        fileUrl: fileUrl || undefined,
      });

      setSuccess(true);
      setLoading(false);
      // Optionally reset form or refresh
      // setContent("");
      // setFile(null);
      router.refresh();
    } catch {
      setError("Failed to submit assignment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <AlertDescription>Submission successful!</AlertDescription>
        </Alert>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Your Answer
        </label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your answer here..."
          rows={6}
        />
      </div>


      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Attach File (optional)
        </label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {file && (
          <p className="mt-1 text-sm text-gray-500">Selected: {file.name}</p>
        )}
        {!file && initialFileUrl && (
          <div className="mt-1 text-sm text-gray-500">
            <a href={initialFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              View previously uploaded file
            </a>
          </div>
        )}
      </div>

      <Button type="submit" loading={loading}>
        Submit Assignment
      </Button>
    </form>
  );
}
