// src/app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

import Chatbot from "@/components/chatbot/chatbot";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    role: (session.user as { role?: string }).role || "STUDENT",
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar role={user.role as "STUDENT" | "TEACHER"} />
      <div className="flex-1 flex flex-col">
        <Header user={user} />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>

      {user.role === "STUDENT" && <Chatbot />}
    </div>
  );
}
