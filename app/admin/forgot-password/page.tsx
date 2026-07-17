import { ForgotPasswordForm } from "@/components/admin/forgot-password-form";
import { getServerBackendMode } from "@/lib/backend/server";
import { redirect } from "next/navigation";

export default function ForgotPasswordPage() {
  if (getServerBackendMode() !== "appwrite") {
    redirect("/admin/login");
  }
  return (
    <main className="login-shell">
      <ForgotPasswordForm />
    </main>
  );
}
