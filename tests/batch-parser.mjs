import assert from "node:assert/strict";
import { parseBatchFilename } from "../src/lib/batch-parser.ts";

assert.equal(parseBatchFilename("Vol 1.cbz").volumeNumber, 1);
assert.equal(parseBatchFilename("Volume 01.pdf").volumeNumber, 1);
assert.equal(parseBatchFilename("v2.pdf").volumeNumber, 2);
assert.equal(parseBatchFilename("Capítulo 12.pdf").chapterNumber, 12);
assert.equal(parseBatchFilename("cap 12.5.pdf").chapterNumber, 12.5);
assert.equal(parseBatchFilename("Prólogo.pdf").special, "prologue");
assert.equal(parseBatchFilename("Epílogo.pdf").special, "epilogue");
assert.equal(parseBatchFilename("bonus-content.pdf").chapterNumber, null);

const named = parseBatchFilename("Wind-Breaker_cap_12.5.cbz", ["Wind Breaker"]);
assert.equal(named.chapterNumber, 12.5);
assert.equal(named.title, "Capítulo 12.5");

const underscored = parseBatchFilename("The_Quiet-Library_Volume-01_Capitulo-3.cbz");
assert.equal(underscored.volumeNumber, 1);
assert.equal(underscored.chapterNumber, 3);
assert.equal(underscored.title, "The Quiet-Library");

console.log("PASS: batch filename parsing for volumes, chapters, special parts and titles.");
