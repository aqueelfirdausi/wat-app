import { AppwriteLoginForm } from "@/components/admin/appwrite-login-form";
import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ passwordReset?: string }>;
}) {
  const backend = getServerBackendMode();
  const query = await searchParams;
  if (backend === "firebase") {
    const { FirebaseLoginForm } = await import(
      "@/components/admin/firebase-login-form"
    );
    return (
      <main className="login-shell">
        <FirebaseLoginForm />
      </main>
    );
  }
  return (
    <main className="login-shell">
      <AppwriteLoginForm passwordResetComplete={query.passwordReset === "complete"} />
    </main>
  );
}
