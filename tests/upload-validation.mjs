import assert from "node:assert/strict";
import { build } from "esbuild";
import { zipSync, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
const bundle = await build({ entryPoints: ["src/lib/upload-validation.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { validateStorageUpload, validateCbz, validateImageUpload } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const image = Object.values(unzipSync(readFileSync("tests/fixtures/nook-original.cbz")))[0];
const webp = new Uint8Array(30);
webp.set(new TextEncoder().encode("RIFF"), 0);
webp.set(new TextEncoder().encode("WEBP"), 8);
webp.set(new TextEncoder().encode("VP8X"), 12);
const cbz = (entries) => new File([zipSync(entries)], "test.cbz", { type: "application/zip" });
await validateCbz(cbz({ "chapter/1.png": image }));
await validateCbz(cbz({ "chapter/3.webp": webp }));
for (const name of ["../evil.png", "C:/evil.png", "/evil.png", "a/../../evil.png", "bad\u0000.png"]) {
  await assert.rejects(validateCbz(cbz({ [name]: image })), name);
}
assert.equal(await validateCbz(cbz({ "1.png": image, "page.html": new TextEncoder().encode("ignored"), "__MACOSX/._1.png": image, ".DS_Store": image, "thumb.png": image })), 1);
await assert.rejects(validateCbz(new File([new Uint8Array([1, 2, 3])], "bad.cbz")));
await assert.rejects(validateCbz(cbz({ "1.png": new TextEncoder().encode("not an image") })));
await validateStorageUpload(new File(["%PDF-1.7\n"], "test.pdf"), "novels");
await assert.rejects(validateStorageUpload(new File(["wrong"], "test.pdf"), "novels"));
await assert.rejects(validateStorageUpload(new File(["0000ftyp"], "test.mp4", { type: "text/html" }), "novels"));
await assert.rejects(validateStorageUpload(new File(["console.log(1)"], "test.js", { type: "text/javascript" }), "novels"));
await validateImageUpload(new File([image], "image.png", { type: "image/png" }));
await assert.rejects(validateImageUpload(new File(["bad"], "image.png", { type: "image/png" })));
const huge = image.slice();
new DataView(huge.buffer).setUint32(16, 10000);
await assert.rejects(validateImageUpload(new File([huge], "huge.png", { type: "image/png" })));
console.log("PASS: upload signatures, image dimensions, CBZ integrity and unsafe names.");

await validateCbz(cbz(Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`chapter/${i + 1}.png`, image]))));
await assert.rejects(validateCbz(cbz(Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`${i}.png`, image])))));
await validateCbz(cbz({ "capitulo/\u65e5\u672c-1.png": image }));
const corrupt = zipSync({ "1.png": image }, { level: 0 });
corrupt[35] ^= 0xff;
await assert.rejects(validateCbz(new File([corrupt], "corrupt.cbz")));
new DataView(huge.buffer).setUint32(16, 100000);
await assert.rejects(validateCbz(cbz({ "huge.png": huge })));
console.log("PASS: CBZ 400/401 pages, Unicode folders, corrupted content and huge image.");

const padded = new Uint8Array(100000);
padded.set(image);
const bomb = zipSync(Object.fromEntries(Array.from({length: 14}, (_, i) => [`${i}.png`, padded])), { level: 0 });
const bombView = new DataView(bomb.buffer);
for (let i = 0; i < bomb.length - 46; i++) if (bombView.getUint32(i, true) === 0x02014b50) bombView.setUint32(i + 24, 12 * 1024 * 1024, true);
await assert.rejects(validateCbz(new File([bomb], "limit.cbz")), /160 MB/);
console.log("PASS: declared decompressed total is rejected before decompression.");

let validationReads = 0;
const sharedFile = cbz({ "1.png": image });
const slice = sharedFile.slice.bind(sharedFile);
sharedFile.slice = (...args) => { validationReads++; return slice(...args); };
await Promise.all([validateStorageUpload(sharedFile, "novels"), validateStorageUpload(sharedFile, "novels")]);
await validateStorageUpload(sharedFile, "novels");
assert.equal(validationReads, 2, "One header and one archive read, shared by concurrent preflight/transport validation");
await assert.rejects(validateStorageUpload(sharedFile, "profiles"), /JPEG/);
console.log("PASS: immutable file validation is deduplicated without bypassing bucket-specific checks.");
