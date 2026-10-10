"use client";
import { AuthGate } from "@/components/auth-gate";
import { Catalog } from "@/components/catalog";
export default function LibraryPage() {
  return <AuthGate>{(user) => <Catalog user={user} library />}</AuthGate>;
}
