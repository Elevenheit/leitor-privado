// Comparable local benchmark; all setup and permission assertions use the security fixture.
process.env.NOOK_CATALOG_BENCH = "1";
await import("./security.mjs");
