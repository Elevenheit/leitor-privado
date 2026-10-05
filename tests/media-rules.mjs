import assert from "node:assert/strict";
import { calculateReadingProgress, naturalPages, validateComicImage } from "../src/lib/media-rules.ts";

assert.deepEqual(calculateReadingProgress({ mediaType: "pdf", pageNumber: 1, totalPages: 10, scrollRatio: 0.1 }), { percent: 10, completed: false });
assert.equal(calculateReadingProgress({ mediaType: "pdf", pageNumber: 10, totalPages: 10, scrollRatio: 0.96 }).completed, true);
assert.deepEqual(calculateReadingProgress({ mediaType: "cbz", pageNumber: 2, totalPages: 10, scrollRatio: 0.5 }), { percent: 15, completed: false });
assert.equal(calculateReadingProgress({ mediaType: "cbz", pageNumber: 10, totalPages: 10, scrollRatio: 0.96 }).completed, true);
assert.deepEqual(naturalPages(["10.png", "2.jpg", "3.webp", "1.jpeg", "__MACOSX/1.png", ".DS_Store", "thumb.png", "readme.txt"]), ["1.jpeg", "2.jpg", "3.webp", "10.png"]);

const malicious = new Uint8Array(24);
malicious.set([137, 80, 78, 71]);
const view = new DataView(malicious.buffer);
view.setUint32(16, 100000);
view.setUint32(20, 100000);
assert.throws(() => validateComicImage(malicious));
assert.throws(() => validateComicImage(new Uint8Array([1, 2, 3])));
console.log("PASS: PDF/CBZ progress, natural page order and image limits.");
