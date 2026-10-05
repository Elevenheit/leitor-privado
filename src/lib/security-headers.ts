export function securityHeaders(supabaseUrl?: string, development = false) {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const websocket = origin.replace(/^http/, "ws");
  const csp = [
    "default-src 'self'",
    `connect-src 'self' blob: ${origin} ${websocket}${development ? " ws: http://localhost:*" : ""}`,
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Content-Security-Policy-Report-Only", value: csp },
  ];
}
