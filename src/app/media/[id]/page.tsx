"use client";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { CbzReader } from "@/components/reader/cbz-reader";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AuthGate>{user => <CbzReader key={id} id={id} user={user} />}</AuthGate>;
}
