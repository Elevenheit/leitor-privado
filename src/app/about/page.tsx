"use client";
import { AuthGate } from "@/components/auth-gate";
import { About } from "@/components/about";
export default function Page() {
  return <AuthGate>{() => <About />}</AuthGate>;
}
