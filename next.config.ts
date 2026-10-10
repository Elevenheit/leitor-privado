import { securityHeaders } from "./src/lib/security-headers";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NOOK_UI_BUILD === "1" ? ".next-ui" : ".next",
  devIndicators: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV === "development") }];
  },
};
export default nextConfig;
