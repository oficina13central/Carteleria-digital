import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaItem } from '@/types/database';

export const SIGNAGE_BUCKET = 'signage-media';
export const STORAGE_CONFIG_PATH = '.system/storage-config.json';

export interface CleanupRecord {
  at: string;
  deletedMediaCount: number;
  deletedOrphanCount: number;
  freedBytes: number;
  percentBefore: number;
  percentAfter: number;
  reason: string;
}

export interface StorageConfig {
  limitMb: number;
  warningPercent: number;
  criticalPercent: number;
  targetSafePercent: number;
  autoCleanupEnabled: boolean;
  lastCleanup: CleanupRecord | null;
}

export interface BucketObjectInfo {
  path: string;
  size: number;
  createdAt: string | null;
  updatedAt: string | null;
  mimetype: string | null;
}

export interface EnrichedMediaItem extends MediaItem {
  sizeBytes: number;
  storagePath: string | null;
  thumbPath: string | null;
  sucursalNombre?: string | null;
  isExpired: boolean;
}

export interface StorageSummary {
  totalBytes: number;
  limitBytes: number;
  usedPercent: number;
  status: 'ok' | 'warning' | 'critical';
  config: StorageConfig;
  totalObjects: number;
  mediaItems: EnrichedMediaItem[];
  orphanObjects: BucketObjectInfo[];
}

export function getDefaultStorageConfig(): StorageConfig {
  const envLimit = Number(process.env.SUPABASE_STORAGE_LIMIT_MB);
  return {
    limitMb: Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 1024,
    warningPercent: 80,
    criticalPercent: 95,
    targetSafePercent: 65,
    autoCleanupEnabled: true,
    lastCleanup: null,
  };
}

export function extractStoragePath(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${SIGNAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  const rawPath = publicUrl.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

export async function getStorageConfig(admin: SupabaseClient): Promise<StorageConfig> {
  const defaults = getDefaultStorageConfig();
  try {
    const { data, error } = await admin.storage
      .from(SIGNAGE_BUCKET)
      .download(STORAGE_CONFIG_PATH);

    if (error || !data) {
      return defaults;
    }

    const text = await data.text();
    const parsed = JSON.parse(text) as Partial<StorageConfig>;

    return {
      limitMb:
        typeof parsed.limitMb === 'number' && parsed.limitMb >= 50
          ? parsed.limitMb
          : defaults.limitMb,
      warningPercent:
        typeof parsed.warningPercent === 'number' &&
        parsed.warningPercent >= 10 &&
        parsed.warningPercent < 99
          ? parsed.warningPercent
          : defaults.warningPercent,
      criticalPercent:
        typeof parsed.criticalPercent === 'number' &&
        parsed.criticalPercent > 20 &&
        parsed.criticalPercent <= 100
          ? parsed.criticalPercent
          : defaults.criticalPercent,
      targetSafePercent:
        typeof parsed.targetSafePercent === 'number' &&
        parsed.targetSafePercent >= 10 &&
        parsed.targetSafePercent < 95
          ? parsed.targetSafePercent
          : defaults.targetSafePercent,
      autoCleanupEnabled:
        typeof parsed.autoCleanupEnabled === 'boolean'
          ? parsed.autoCleanupEnabled
          : defaults.autoCleanupEnabled,
      lastCleanup: parsed.lastCleanup ?? null,
    };
  } catch {
    return defaults;
  }
}

export async function saveStorageConfig(
  admin: SupabaseClient,
  config: StorageConfig
): Promise<StorageConfig> {
  const sanitized: StorageConfig = {
    limitMb: Math.max(50, Math.round(config.limitMb)),
    warningPercent: Math.min(98, Math.max(10, Math.round(config.warningPercent))),
    criticalPercent: Math.min(100, Math.max(20, Math.round(config.criticalPercent))),
    targetSafePercent: Math.min(90, Math.max(10, Math.round(config.targetSafePercent))),
    autoCleanupEnabled: Boolean(config.autoCleanupEnabled),
    lastCleanup: config.lastCleanup ?? null,
  };

  if (sanitized.warningPercent >= sanitized.criticalPercent) {
    sanitized.warningPercent = Math.max(10, sanitized.criticalPercent - 10);
  }
  if (sanitized.targetSafePercent >= sanitized.warningPercent) {
    sanitized.targetSafePercent = Math.max(10, sanitized.warningPercent - 10);
  }

  const blob = new Blob([JSON.stringify(sanitized, null, 2)], {
    type: 'application/json',
  });

  const { error } = await admin.storage
    .from(SIGNAGE_BUCKET)
    .upload(STORAGE_CONFIG_PATH, blob, {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) {
    throw new Error(`No se pudo guardar la configuración de almacenamiento: ${error.message}`);
  }

  return sanitized;
}

export async function listBucketObjects(
  admin: SupabaseClient,
  prefix = ''
): Promise<BucketObjectInfo[]> {
  const results: BucketObjectInfo[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(SIGNAGE_BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });

    if (error || !data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      if (entry.name === '.system' || entry.name === '.emptyFolderPlaceholder') {
        continue;
      }

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.id === null) {
        // Es una carpeta: recorrer recursivamente
        const nested = await listBucketObjects(admin, fullPath);
        results.push(...nested);
      } else {
        const meta = entry.metadata as { size?: number; mimetype?: string } | null;
        results.push({
          path: fullPath,
          size: typeof meta?.size === 'number' ? meta.size : 0,
          createdAt: entry.created_at ?? null,
          updatedAt: entry.updated_at ?? null,
          mimetype: meta?.mimetype ?? null,
        });
      }
    }

    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return results;
}

export async function getStorageSummary(admin: SupabaseClient): Promise<StorageSummary> {
  const [config, objects, mediaRes, sucursalesRes] = await Promise.all([
    getStorageConfig(admin),
    listBucketObjects(admin),
    admin.from('media_items').select('*').order('created_at', { ascending: true }),
    admin.from('sucursales').select('id, nombre'),
  ]);

  const sucursalMap = new Map<string, string>(
    ((sucursalesRes.data || []) as { id: string; nombre: string }[]).map((s) => [
      s.id,
      s.nombre,
    ])
  );

  const objectMap = new Map<string, BucketObjectInfo>();
  let totalBytes = 0;
  for (const obj of objects) {
    objectMap.set(obj.path, obj);
    totalBytes += obj.size;
  }

  const referencedPaths = new Set<string>();
  const nowMs = Date.now();

  const mediaItems: EnrichedMediaItem[] = ((mediaRes.data || []) as MediaItem[]).map(
    (item) => {
      const storagePath = extractStoragePath(item.url_archivo);
      const thumbPath = extractStoragePath(item.url_miniatura);

      let sizeBytes = 0;
      if (storagePath) {
        referencedPaths.add(storagePath);
        sizeBytes += objectMap.get(storagePath)?.size ?? 0;
      }
      if (thumbPath && thumbPath !== storagePath) {
        referencedPaths.add(thumbPath);
        sizeBytes += objectMap.get(thumbPath)?.size ?? 0;
      }

      const isExpired = Boolean(
        item.fecha_fin && new Date(item.fecha_fin).getTime() < nowMs
      );

      return {
        ...item,
        sizeBytes,
        storagePath,
        thumbPath,
        sucursalNombre: item.sucursal_id ? sucursalMap.get(item.sucursal_id) ?? null : null,
        isExpired,
      };
    }
  );

  const orphanObjects = objects.filter((obj) => !referencedPaths.has(obj.path));
  const limitBytes = config.limitMb * 1024 * 1024;
  const usedPercent = limitBytes > 0 ? Math.round((totalBytes / limitBytes) * 1000) / 10 : 0;

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (usedPercent >= config.criticalPercent) {
    status = 'critical';
  } else if (usedPercent >= config.warningPercent) {
    status = 'warning';
  }

  return {
    totalBytes,
    limitBytes,
    usedPercent,
    status,
    config,
    totalObjects: objects.length,
    mediaItems,
    orphanObjects,
  };
}

export async function deleteMediaAndOrphans(
  admin: SupabaseClient,
  mediaItemIds: string[],
  orphanPaths: string[]
): Promise<{ deletedMediaCount: number; deletedOrphanCount: number; freedBytes: number }> {
  let deletedMediaCount = 0;
  let deletedOrphanCount = 0;
  let freedBytes = 0;

  const objects = await listBucketObjects(admin);
  const sizeByPath = new Map(objects.map((o) => [o.path, o.size]));

  const pathsToRemove = new Set<string>();

  if (mediaItemIds.length > 0) {
    const { data: rows } = await admin
      .from('media_items')
      .select('id, url_archivo, url_miniatura')
      .in('id', mediaItemIds);

    if (rows && rows.length > 0) {
      for (const row of rows as Pick<MediaItem, 'id' | 'url_archivo' | 'url_miniatura'>[]) {
        const mainPath = extractStoragePath(row.url_archivo);
        const thumbPath = extractStoragePath(row.url_miniatura);
        if (mainPath) pathsToRemove.add(mainPath);
        if (thumbPath) pathsToRemove.add(thumbPath);
      }

      const { error: delErr } = await admin
        .from('media_items')
        .delete()
        .in('id', mediaItemIds);

      if (delErr) {
        throw new Error(`Error al eliminar registros de media_items: ${delErr.message}`);
      }
      deletedMediaCount = rows.length;
    }
  }

  for (const orphanPath of orphanPaths) {
    if (orphanPath && !orphanPath.startsWith('.system/')) {
      pathsToRemove.add(orphanPath);
      deletedOrphanCount += 1;
    }
  }

  const allPaths = Array.from(pathsToRemove);
  for (const p of allPaths) {
    freedBytes += sizeByPath.get(p) ?? 0;
  }

  // Supabase Storage remove acepta lotes de archivos
  const chunkSize = 100;
  for (let i = 0; i < allPaths.length; i += chunkSize) {
    const chunk = allPaths.slice(i, i + chunkSize);
    await admin.storage.from(SIGNAGE_BUCKET).remove(chunk);
  }

  return { deletedMediaCount, deletedOrphanCount, freedBytes };
}

export interface CleanupResult {
  triggered: boolean;
  reason: string;
  deletedMediaCount: number;
  deletedOrphanCount: number;
  freedBytes: number;
  percentBefore: number;
  percentAfter: number;
  summary: StorageSummary;
}

export async function runStorageCleanup(
  admin: SupabaseClient,
  options: {
    force?: boolean;
    targetPercent?: number;
    reason?: string;
  } = {}
): Promise<CleanupResult> {
  const summary = await getStorageSummary(admin);
  const { config } = summary;
  const targetPercent = options.targetPercent ?? config.targetSafePercent;
  const targetBytes = Math.floor((summary.limitBytes * targetPercent) / 100);

  if (!options.force) {
    if (!config.autoCleanupEnabled) {
      return {
        triggered: false,
        reason: 'Limpieza automática deshabilitada.',
        deletedMediaCount: 0,
        deletedOrphanCount: 0,
        freedBytes: 0,
        percentBefore: summary.usedPercent,
        percentAfter: summary.usedPercent,
        summary,
      };
    }

    if (summary.usedPercent < config.criticalPercent) {
      return {
        triggered: false,
        reason: `Uso actual (${summary.usedPercent}%) por debajo del umbral crítico (${config.criticalPercent}%).`,
        deletedMediaCount: 0,
        deletedOrphanCount: 0,
        freedBytes: 0,
        percentBefore: summary.usedPercent,
        percentAfter: summary.usedPercent,
        summary,
      };
    }
  }

  if (summary.totalBytes <= targetBytes) {
    return {
      triggered: false,
      reason: `El almacenamiento ya está en un nivel seguro (${summary.usedPercent}% <= ${targetPercent}%).`,
      deletedMediaCount: 0,
      deletedOrphanCount: 0,
      freedBytes: 0,
      percentBefore: summary.usedPercent,
      percentAfter: summary.usedPercent,
      summary,
    };
  }

  let remainingBytes = summary.totalBytes;
  const orphanPathsToDelete: string[] = [];
  const mediaIdsToDelete: string[] = [];

  // Prioridad 1: Archivos huérfanos en Storage (más antiguos primero)
  const sortedOrphans = [...summary.orphanObjects].sort((a, b) => {
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tA - tB;
  });

  for (const orphan of sortedOrphans) {
    if (remainingBytes <= targetBytes) break;
    orphanPathsToDelete.push(orphan.path);
    remainingBytes = Math.max(0, remainingBytes - orphan.size);
  }

  // Prioridad 2: Medios vencidos o inactivos (más antiguos primero)
  const expiredOrInactive = summary.mediaItems
    .filter((m) => m.isExpired || !m.activo)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const item of expiredOrInactive) {
    if (remainingBytes <= targetBytes) break;
    mediaIdsToDelete.push(item.id);
    remainingBytes = Math.max(0, remainingBytes - item.sizeBytes);
  }

  // Prioridad 3: Medios más antiguos activos (para garantizar bajar al porcentaje seguro)
  const selectedSet = new Set(mediaIdsToDelete);
  const oldestActive = summary.mediaItems
    .filter((m) => !selectedSet.has(m.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const item of oldestActive) {
    if (remainingBytes <= targetBytes) break;
    mediaIdsToDelete.push(item.id);
    remainingBytes = Math.max(0, remainingBytes - item.sizeBytes);
  }

  const percentBefore = summary.usedPercent;
  const { deletedMediaCount, deletedOrphanCount, freedBytes } = await deleteMediaAndOrphans(
    admin,
    mediaIdsToDelete,
    orphanPathsToDelete
  );

  const nextSummary = await getStorageSummary(admin);
  const reason =
    options.reason ||
    (options.force ? 'Limpieza manual ejecutada' : `Limpieza automática (>= ${config.criticalPercent}%)`);

  if (deletedMediaCount > 0 || deletedOrphanCount > 0) {
    const updatedConfig: StorageConfig = {
      ...nextSummary.config,
      lastCleanup: {
        at: new Date().toISOString(),
        deletedMediaCount,
        deletedOrphanCount,
        freedBytes,
        percentBefore,
        percentAfter: nextSummary.usedPercent,
        reason,
      },
    };
    nextSummary.config = await saveStorageConfig(admin, updatedConfig);
  }

  return {
    triggered: true,
    reason,
    deletedMediaCount,
    deletedOrphanCount,
    freedBytes,
    percentBefore,
    percentAfter: nextSummary.usedPercent,
    summary: nextSummary,
  };
}
