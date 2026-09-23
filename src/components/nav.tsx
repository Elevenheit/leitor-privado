"use client";

import Link from "next/link";
import { BookOpen, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Nav({ back = false }: { back?: boolean }) {
  return <header className="site-nav"><div className="nav-inner">
    <Link className="logo" href="/"><span className="logo-icon"><BookOpen size={19} /></span><span>nook<span className="logo-dot">.</span></span></Link>
    <div className="nav-actions">{back && <Link className="nav-link" href="/">Biblioteca</Link>}<button className="icon-button" title="Sair" aria-label="Sair" onClick={() => supabase().auth.signOut()}><LogOut size={18} /></button></div>
  </div></header>;
}
