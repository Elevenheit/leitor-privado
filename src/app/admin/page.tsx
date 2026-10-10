"use client";

import type { User } from "@supabase/supabase-js";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AuthGate } from "@/components/auth-gate";
import { BetaAccess } from "@/components/beta-access";

export default function AdminPage() {
  return (
    <AuthGate>
      {(user: User) => (
        <BetaAccess admin>
          <AdminDashboard user={user} />
        </BetaAccess>
      )}
    </AuthGate>
  );
}
