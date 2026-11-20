import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ProcessedMediaResult } from './imageProcessor';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

const FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
      'text/javascript'
    );
    const wasmURL = await toBlobURL(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
      'application/wasm'
    );

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  }
}

/**
 * Transcodifica y estandariza un video en el cliente usando FFmpeg.wasm:
 * - Contenedor MP4 con faststart
 * - Códec H.264 (libx264), perfil baseline/main, 30fps, yuv420p
 * - Escalado proporcional a la resolución objetivo de la pantalla (dimensiones pares)
 * - Sin audio (por defecto, ideal para TV Box en mute) o AAC estándar
 * - Extrae además una miniatura JPEG/WebP para el panel de monitoreo
 */
export async function processVideoToMP4(
  inputFile: File,
  targetWidth: number,
  targetHeight: number,
  options?: {
    keepAudio?: boolean;
    onProgress?: (percent: number) => void;
    onStage?: (stage: string) => void;
  }
): Promise<ProcessedMediaResult> {
  const { keepAudio = false, onProgress, onStage } = options ?? {};

  onStage?.('Cargando motor FFmpeg.wasm...');
  onProgress?.(2);

  const ffmpeg = await getFFmpeg();

  const ext = inputFile.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `input_${Date.now()}.${ext}`;
  const outputName = `output_${Date.now()}.mp4`;
  const thumbName = `thumb_${Date.now()}.jpg`;

  const progressHandler = ({ progress }: { progress: number }) => {
    const clamped = Math.max(0, Math.min(1, progress));
    // Mapea progreso de transcodificación a 10% - 92%
    onProgress?.(Math.round(10 + clamped * 82));
  };

  ffmpeg.on('progress', progressHandler);

  try {
    onStage?.('Leyendo archivo de video...');
    await ffmpeg.writeFile(inputName, await fetchFile(inputFile));
    onProgress?.(10);

    onStage?.(`Convirtiendo a MP4 H.264 (${targetWidth}x${targetHeight}, 30fps)...`);

    // Escala manteniendo proporción sin agrandar si es menor, asegurando ancho/alto pares para libx264
    const vf = `scale='min(${targetWidth},iw)':'min(${targetHeight},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;

    const args: string[] = [
      '-i',
      inputName,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-profile:v',
      'main',
      '-level',
      '3.1',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-preset',
      'veryfast',
      '-crf',
      '26',
      '-movflags',
      '+faststart',
    ];

    if (keepAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
    } else {
      args.push('-an');
    }

    args.push('-y', outputName);

    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg finalizó con código ${exitCode}`);
    }

    onStage?.('Generando miniatura del video...');
    onProgress?.(94);

    // Extraer frame para miniatura (en t=1s o fallback a t=0s)
    let thumbBlob: Blob;
    try {
      let thumbCode = await ffmpeg.exec([
        '-ss',
        '00:00:01',
        '-i',
        outputName,
        '-frames:v',
        '1',
        '-vf',
        'scale=400:-1',
        '-q:v',
        '4',
        '-y',
        thumbName,
      ]);

      if (thumbCode !== 0) {
        thumbCode = await ffmpeg.exec([
          '-ss',
          '00:00:00',
          '-i',
          outputName,
          '-frames:v',
          '1',
          '-vf',
          'scale=400:-1',
          '-q:v',
          '4',
          '-y',
          thumbName,
        ]);
      }

      const thumbData = await ffmpeg.readFile(thumbName);
      thumbBlob = new Blob([new Uint8Array(thumbData as Uint8Array)], {
        type: 'image/jpeg',
      });
    } catch {
      // Fallback: miniatura vacía transparente si no se pudo extraer frame
      thumbBlob = new Blob([], { type: 'image/jpeg' });
    }

    const outputData = await ffmpeg.readFile(outputName);
    const videoBlob = new Blob([new Uint8Array(outputData as Uint8Array)], {
      type: 'video/mp4',
    });

    onProgress?.(100);

    return {
      file: videoBlob,
      thumbnail: thumbBlob,
      contentType: 'video/mp4',
      extension: 'mp4',
    };
  } finally {
    ffmpeg.off('progress', progressHandler);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
      ffmpeg.deleteFile(thumbName),
    ]);
  }
}
