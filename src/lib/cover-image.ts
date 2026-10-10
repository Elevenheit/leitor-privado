/** Resize future cover uploads in the browser, preserving supported MIME and aspect ratio. */
export async function prepareCoverImage(file: File) {
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap !== "function"
  )
    return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 720 / bitmap.width, 1080 / bitmap.height);
    if (scale === 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, 0.86),
    );
    if (!blob || blob.type !== file.type) return file;
    return new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
