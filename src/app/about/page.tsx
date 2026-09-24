"use client";
import { AuthGate } from "@/components/auth-gate";
import { About } from "@/components/about";
import { Nav } from "@/components/nav";
export default function Page() {
  return (
    <AuthGate>
      {() => (
        <>
          <Nav />
          <About />
        </>
      )}
    </AuthGate>
  );
}
