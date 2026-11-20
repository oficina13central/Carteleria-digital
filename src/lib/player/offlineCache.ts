import type { MediaItem, Pantalla } from '@/types/database';

const CACHE_NAME = 'signage-media-v1';
const STORAGE_PREFIX = 'signage_playlist_';

export interface CachedPlaylistPayload {
  screen: Pantalla;
  items: MediaItem[];
  savedAt: number;
}

export function loadLocalPlaylistSnapshot(codigo: string): CachedPlaylistPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${codigo.toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPlaylistPayload;
  } catch {
    return null;
  }
}

export function saveLocalPlaylistSnapshot(
  codigo: string,
  screen: Pantalla,
  items: MediaItem[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedPlaylistPayload = {
      screen,
      items,
      savedAt: Date.now(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}${codigo.toUpperCase()}`, JSON.stringify(payload));
  } catch {
    // Ignorar errores de cuota en localStorage
  }
}

/**
 * Sincroniza los archivos multimedia de la playlist en Cache API y devuelve un mapa
 * `url_archivo -> blobUrl` para reproducción 100% offline sin cortes ni pantallas negras.
 */
export async function syncMediaToCacheAndGetBlobUrls(
  items: MediaItem[],
  previousBlobUrls: Record<string, string>
): Promise<{
  blobUrls: Record<string, string>;
  allCached: boolean;
  usedOfflineFallback: boolean;
}> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    // Fallback sin Cache API: usar URLs remotas directamente
    const direct: Record<string, string> = {};
    for (const item of items) {
      direct[item.url_archivo] = item.url_archivo;
    }
    return { blobUrls: direct, allCached: false, usedOfflineFallback: false };
  }

  const cache = await window.caches.open(CACHE_NAME);
  const nextBlobUrls: Record<string, string> = {};
  const neededUrls = new Set(items.map((i) => i.url_archivo));
  let allCached = true;
  let usedOfflineFallback = false;

  for (const url of neededUrls) {
    // Reutilizar Blob URL si ya está en memoria para evitar parpadeos y fugas
    if (previousBlobUrls[url]) {
      nextBlobUrls[url] = previousBlobUrls[url];
      continue;
    }

    try {
      let cachedResponse = await cache.match(url);

      if (!cachedResponse) {
        const networkResponse = await fetch(url, { mode: 'cors' });
        if (!networkResponse.ok) {
          throw new Error(`HTTP ${networkResponse.status}`);
        }
        await cache.put(url, networkResponse.clone());
        cachedResponse = networkResponse;
      }

      const blob = await cachedResponse.blob();
      nextBlobUrls[url] = URL.createObjectURL(blob);
    } catch {
      allCached = false;
      usedOfflineFallback = true;
      // Si falló la descarga, intentar una última vez desde caché o usar URL original
      const fallbackCached = await cache.match(url);
      if (fallbackCached) {
        const blob = await fallbackCached.blob();
        nextBlobUrls[url] = URL.createObjectURL(blob);
      } else {
        nextBlobUrls[url] = url;
      }
    }
  }

  // Revocar Blob URLs que ya no están en la playlist
  for (const [oldUrl, oldBlobUrl] of Object.entries(previousBlobUrls)) {
    if (!neededUrls.has(oldUrl) && oldBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(oldBlobUrl);
    }
  }

  // Limpiar entradas huérfanas en Cache API si tenemos conexión
  if (navigator.onLine) {
    try {
      const keys = await cache.keys();
      for (const req of keys) {
        if (!neededUrls.has(req.url)) {
          await cache.delete(req);
        }
      }
    } catch {
      // Ignorar errores de limpieza
    }
  }

  return { blobUrls: nextBlobUrls, allCached, usedOfflineFallback };
}
