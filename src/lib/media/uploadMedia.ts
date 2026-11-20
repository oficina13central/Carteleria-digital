import { createClient } from '@/lib/supabase/client';
import { parseResolution, type MediaItem, type TipoMedia } from '@/types/database';
import { processImageToWebP } from './imageProcessor';
import { processVideoToMP4 } from './videoProcessor';

export interface UploadMediaParams {
  file: File;
  titulo: string;
  sucursalId: string | null; // null = Global (Casa Central)
  pantallaId: string | null; // null = todas las pantallas del ámbito
  targetResolution: string;
  duracionSeg: number;
  orden: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  keepAudio?: boolean;
  onProgress?: (percent: number, stage: string) => void;
}

function uploadBlobWithProgress(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  bucket: string,
  objectPath: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Error al subir archivo (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al subir el archivo a Storage.'));
    xhr.send(blob);
  });
}

export async function processAndUploadMedia(params: UploadMediaParams): Promise<MediaItem> {
  const {
    file,
    titulo,
    sucursalId,
    pantallaId,
    targetResolution,
    duracionSeg,
    orden,
    fechaInicio,
    fechaFin,
    keepAudio = false,
    onProgress,
  } = params;

  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name);
  const tipo: TipoMedia = isVideo ? 'video' : 'image';
  const { width, height } = parseResolution(targetResolution);

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1. Procesamiento en cliente (0% -> 60% del progreso total)
  let processed;
  if (isVideo) {
    processed = await processVideoToMP4(file, width, height, {
      keepAudio,
      onStage: (stage) => onProgress?.(5, stage),
      onProgress: (p) => onProgress?.(Math.round(p * 0.6), 'Transcodificando video H.264...'),
    });
  } else {
    onProgress?.(5, 'Comprimiendo imagen a WebP...');
    processed = await processImageToWebP(file, width, height, (p) =>
      onProgress?.(Math.round(p * 0.6), 'Comprimiendo imagen a WebP...')
    );
  }

  // 2. Subida a Supabase Storage (60% -> 95%)
  const itemUuid = crypto.randomUUID();
  const baseFolder = sucursalId ? `sucursales/${sucursalId}` : 'global';
  const mainPath = `${baseFolder}/${itemUuid}.${processed.extension}`;
  const thumbExt = processed.thumbnail.type === 'image/webp' ? 'webp' : 'jpg';
  const thumbPath = `${baseFolder}/${itemUuid}_thumb.${thumbExt}`;

  onProgress?.(62, 'Subiendo archivo optimizado a la nube...');
  await uploadBlobWithProgress(
    supabaseUrl,
    anonKey,
    session.access_token,
    'signage-media',
    mainPath,
    processed.file,
    processed.contentType,
    (p) => onProgress?.(Math.round(62 + p * 0.28), 'Subiendo archivo optimizado a la nube...')
  );

  let publicThumbUrl: string | null = null;
  if (processed.thumbnail.size > 0) {
    onProgress?.(92, 'Subiendo miniatura...');
    await uploadBlobWithProgress(
      supabaseUrl,
      anonKey,
      session.access_token,
      'signage-media',
      thumbPath,
      processed.thumbnail,
      processed.thumbnail.type || 'image/webp'
    );
    const { data: thumbUrlData } = supabase.storage
      .from('signage-media')
      .getPublicUrl(thumbPath);
    publicThumbUrl = thumbUrlData.publicUrl;
  }

  const { data: mainUrlData } = supabase.storage
    .from('signage-media')
    .getPublicUrl(mainPath);

  // 3. Registro en PostgreSQL (95% -> 100%)
  onProgress?.(96, 'Guardando en playlist...');
  const { data: inserted, error } = await supabase
    .from('media_items')
    .insert({
      sucursal_id: sucursalId,
      pantalla_id: pantallaId,
      titulo: titulo.trim() || file.name.replace(/\.[^/.]+$/, ''),
      tipo,
      url_archivo: mainUrlData.publicUrl,
      url_miniatura: publicThumbUrl ?? (tipo === 'image' ? mainUrlData.publicUrl : null),
      duracion_seg: Math.max(1, duracionSeg),
      orden,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      activo: true,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Error al guardar en base de datos: ${error.message}`);
  }

  onProgress?.(100, '¡Listo!');
  return inserted as MediaItem;
}
