import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion · CSM" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { suite } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
          Client Solutions Management
        </p>
        <h1 className="text-3xl font-bold">CSM</h1>
      </header>
      <LoginForm next={suite} />
    </main>
  );
}
