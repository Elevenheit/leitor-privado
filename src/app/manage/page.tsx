"use client";

import { BetaAccess } from "@/components/beta-access";
import { AuthGate } from "@/components/auth-gate";
import { LibraryManager } from "@/components/library/library-manager";

export default function ManagePage() {
  return (
    <AuthGate>
      {(user) => (
        <BetaAccess admin>
          <LibraryManager user={user} />
        </BetaAccess>
      )}
    </AuthGate>
  );
}
