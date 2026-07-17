import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { getServerBackendMode } from "@/lib/backend/server";
import { redirect } from "next/navigation";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (getServerBackendMode() !== "appwrite") {
    redirect("/admin/login");
  }
  const query = await searchParams;
  return (
    <main className="login-shell">
      <ResetPasswordForm ready={query.state === "ready"} />
    </main>
  );
}
