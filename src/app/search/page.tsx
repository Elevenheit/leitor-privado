"use client";
import { AuthGate } from "@/components/auth-gate";
import { Catalog } from "@/components/catalog";
export default function SearchPage() {
  return <AuthGate>{(user) => <Catalog user={user} search />}</AuthGate>;
}
