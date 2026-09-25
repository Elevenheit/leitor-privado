import assert from "node:assert/strict";
import {
  calculateReadingProgress,
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
  calculateReadingProgress({ mediaType: "pdf", pageNumber: 1, totalPages: 10, scrollRatio: 0.1 }),
  { percent: 10, completed: false },
);
assert.equal(
  calculateReadingProgress({ mediaType: "pdf", pageNumber: 10, totalPages: 10, scrollRatio: 0.8 }).completed,
  false,
);
assert.equal(
  calculateReadingProgress({ mediaType: "pdf", pageNumber: 10, totalPages: 10, scrollRatio: 0.96 }).completed,
  true,
);
assert.equal(
  calculateReadingProgress({ mediaType: "cbz", pageNumber: 1, totalPages: 10 }).completed,
  false,
);
assert.equal(
  calculateReadingProgress({ mediaType: "cbz", pageNumber: 10, totalPages: 10 }).completed,
  true,
);
assert.equal(
  calculateReadingProgress({ mediaType: "cbz", pageNumber: 10, totalPages: 10, scrollRatio: 0.9 }).completed,
  false,
);
assert.equal(
  calculateReadingProgress({ mediaType: "cbz", pageNumber: 10, totalPages: 10, scrollRatio: 0.96 }).completed,
  true,
);
assert.equal(
  calculateReadingProgress({ mediaType: "video", positionSeconds: 10, durationSeconds: 100 }).completed,
  false,
);
assert.equal(
  calculateReadingProgress({ mediaType: "video", positionSeconds: 95, durationSeconds: 100 }).completed,
  true,
);
assert.equal(
  calculateReadingProgress({ mediaType: "video", positionSeconds: 95 }).completed,
  false,
);
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
