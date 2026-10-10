import assert from "node:assert/strict";
import { toDataError, reportDataError } from "../src/lib/data/errors.ts";
const secret = "https://private.invalid/file?token=SECRET service_role=SECRET password=SECRET";
for (const error of [{message: secret}, {message: `Storage ${secret}`}, {message: `JWT expired ${secret}`}]) assert.ok(!toDataError(error, "Tente novamente.").message.includes("SECRET"));
assert.equal(toDataError({status: 403}, "Fallback").kind, "authorization");
assert.equal(toDataError(new TypeError("Failed to fetch"), "Fallback").kind, "network");
const previous = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
const logs = [];
const warn = console.warn;
try {
  console.warn = (...args) => logs.push(args);
  reportDataError({message: secret}, "cbz");
} finally { console.warn = warn; process.env.NODE_ENV = previous; }
assert.ok(!JSON.stringify(logs).includes("SECRET"));
console.log("PASS: classified errors and logs omit raw credentials/URLs.");
