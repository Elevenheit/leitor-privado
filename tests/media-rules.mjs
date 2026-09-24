import assert from "node:assert/strict";
import {
  introTarget,
  naturalPages,
  validateComicImage,
} from "../src/lib/media-rules.ts";
assert.equal(introTarget(true, 90, 180, 0), 90);
assert.equal(introTarget(true, 110, 180, 0), 110);
assert.equal(introTarget(true, 110, 42, 0), 42);
assert.equal(introTarget(false, 90, 180, 0), null);
assert.equal(introTarget(true, 90, 180, 90), null);
assert.equal(introTarget(true, 110, 42, 42), null);
assert.equal(introTarget(true, 90, Infinity, 0), null);
assert.equal(introTarget(true, 89, 180, 0), null);
assert.deepEqual(
  naturalPages([
    "10.png",
    "2.png",
    "1.png",
    "__MACOSX/1.png",
    ".hidden.png",
    "readme.txt",
  ]),
  ["1.png", "2.png", "10.png"],
);
console.log(
  "PASS: intro visible at zero; 90s,110s,short/disabled/ended; numeric CBZ order.",
);

const malicious = new Uint8Array(24);
malicious.set([137, 80, 78, 71]);
const view = new DataView(malicious.buffer);
view.setUint32(16, 100000);
view.setUint32(20, 100000);
assert.throws(() => validateComicImage(malicious));
assert.throws(() => validateComicImage(new Uint8Array([1, 2, 3])));
