"use server";

import { redirect } from "next/navigation";
import { claimGuestDateRequests, createAccount, endSession, signInAccount, startSession } from "@/lib/local-db";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await signInAccount(email, password);
  if (!user) redirect("/login?error=credentials");
  await claimGuestDateRequests(user.id);
  await startSession(user.id);
  redirect("/my-dates");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12) redirect("/login?error=signup");
  const user = createAccount(email, password, name);
  if (!user) redirect("/login?error=signup");
  await claimGuestDateRequests(user.id);
  await startSession(user.id);
  redirect("/my-dates");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}