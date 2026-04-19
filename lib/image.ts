export async function resizeImageBeforeUpload(file: File, maxDimension = 1600, quality = 0.75): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longestSide = Math.max(width, height);

  if (longestSide <= maxDimension && file.size <= 700 * 1024) {
    return file;
  }

  const scale = Math.min(1, maxDimension / longestSide);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    return file;
  }

  const basename = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${basename}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像の読み込みに失敗しました。"));
    };

    img.src = objectUrl;
  });
}
