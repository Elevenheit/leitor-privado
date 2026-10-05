# Browser headers

All Next routes send nosniff, no-referrer, DENY framing and a Permissions-Policy restricting device features. CSP starts in Report-Only so violations can be reviewed before enforcement.

The CSP allows the configured Supabase origin, its websocket origin, blob images/media/workers, data images/fonts and Next inline styles/scripts. Production does not allow unsafe-eval. Next fonts are served locally. No reporting endpoint collects URLs or private request data.

Before enforcement, exercise authenticated PDF and CBZ, signed URL renewal, profile images, mobile and production Next navigation. Review the browser's CSP diagnostics privately; reports can contain private URLs. The unauthenticated browser suite and header unit tests do not prove the full authenticated CSP is ready for enforcement.
