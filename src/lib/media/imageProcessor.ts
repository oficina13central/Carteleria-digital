import imageCompression from 'browser-image-compression';

export interface ProcessedMediaResult {
  file: Blob;
  thumbnail: Blob;
  contentType: string;
  extension: string;
}

/**
 * Comprime una imagen en el cliente a formato WebP optimizado para la resolución de la TV,
 * y genera una miniatura ligera en WebP para el Wallboard y gestor de playlist.
 */
export async function processImageToWebP(
  inputFile: File,
  targetWidth: number,
  targetHeight: number,
  onProgress?: (percent: number) => void
): Promise<ProcessedMediaResult> {
  const maxDimension = Math.max(targetWidth, targetHeight, 1280);

  onProgress?.(10);

  const compressedMain = await imageCompression(inputFile, {
    maxSizeMB: 2.5,
    maxWidthOrHeight: maxDimension,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.85,
    onProgress: (p) => {
      // Mapea 0-100 a 10-75%
      onProgress?.(Math.round(10 + p * 0.65));
    },
  });

  onProgress?.(80);

  const thumbnail = await imageCompression(inputFile, {
    maxSizeMB: 0.12,
    maxWidthOrHeight: 400,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.72,
  });

  onProgress?.(100);

  return {
    file: compressedMain,
    thumbnail,
    contentType: 'image/webp',
    extension: 'webp',
  };
}
