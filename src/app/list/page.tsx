"use client";
import { AuthGate } from "@/components/auth-gate";
import { Catalog } from "@/components/catalog";
export default function Page() {
  return <AuthGate>{(user) => <Catalog user={user} list />}</AuthGate>;
}
