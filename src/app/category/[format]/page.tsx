"use client";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { Catalog } from "@/components/catalog";
import { formats, type Format } from "@/lib/catalog";
export default function Page() {
  const { format } = useParams<{ format: string }>();
  return (
    <AuthGate>
      {(user) =>
        format in formats ? (
          <Catalog key={format} user={user} format={format as Format} />
        ) : (
          <p>Categoria não encontrada.</p>
        )
      }
    </AuthGate>
  );
}
