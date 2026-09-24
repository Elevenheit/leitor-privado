"use client";

import { AuthGate } from "@/components/auth-gate";
import { LibraryManager } from "@/components/library/library-manager";

export default function ManagePage() {
  return <AuthGate>{user => <LibraryManager user={user}/>}</AuthGate>;
}
