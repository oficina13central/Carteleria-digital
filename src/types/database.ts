export type UserRoleType = 'superadmin' | 'sucursal';
export type Orientacion = 'horizontal' | 'vertical';
export type AjusteMedia = 'contain' | 'cover';
export type Transicion = 'none' | 'fade' | 'slide' | 'zoom';
export type EstadoRed = 'online' | 'offline_cache';
export type TipoMedia = 'image' | 'video';

export interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
  created_at: string;
}

export interface UsuarioRol {
  user_id: string;
  rol: UserRoleType;
  sucursal_id: string | null;
  created_at: string;
}

export interface Pantalla {
  id: string;
  sucursal_id: string | null;
  nombre: string;
  codigo_vinculacion: string;
  resolucion: string;
  orientacion: Orientacion;
  ajuste_media: AjusteMedia;
  transicion: Transicion;
  duracion_transicion_ms: number;
  ultimo_ping: string | null;
  item_actual_titulo: string | null;
  item_actual_miniatura: string | null;
  estado_red: EstadoRed;
  version_playlist: number;
  created_at: string;
}

export interface MediaItem {
  id: string;
  sucursal_id: string | null;
  pantalla_id: string | null;
  titulo: string;
  tipo: TipoMedia;
  url_archivo: string;
  url_miniatura: string | null;
  duracion_seg: number;
  orden: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
  created_at: string;
}

export type ScreenHealth = 'online' | 'offline_cache' | 'disconnected';

/**
 * Calcula el estado visual de una pantalla según su último ping y estado de red:
 * - Verde ('online'): ultimo_ping < 2 min y estado_red === 'online'
 * - Amarillo ('offline_cache'): reporta uso de caché local (o ping reciente con offline_cache)
 * - Rojo ('disconnected'): sin ping o >= 2 min sin señal
 */
export function getScreenHealth(pantalla: Pick<Pantalla, 'ultimo_ping' | 'estado_red'>, nowMs = Date.now()): ScreenHealth {
  if (!pantalla.ultimo_ping) return 'disconnected';
  const diffMs = nowMs - new Date(pantalla.ultimo_ping).getTime();
  const twoMinutesMs = 2 * 60 * 1000;

  if (diffMs < twoMinutesMs) {
    return pantalla.estado_red === 'offline_cache' ? 'offline_cache' : 'online';
  }
  return 'disconnected';
}

export function isMediaItemScheduledNow(item: Pick<MediaItem, 'activo' | 'fecha_inicio' | 'fecha_fin'>, nowMs = Date.now()): boolean {
  if (!item.activo) return false;
  if (item.fecha_inicio && new Date(item.fecha_inicio).getTime() > nowMs) return false;
  if (item.fecha_fin && new Date(item.fecha_fin).getTime() < nowMs) return false;
  return true;
}

export function parseResolution(resolucion: string): { width: number; height: number } {
  const parts = resolucion.toLowerCase().split('x');
  const width = parseInt(parts[0] || '1920', 10);
  const height = parseInt(parts[1] || '1080', 10);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1920,
    height: Number.isFinite(height) && height > 0 ? height : 1080,
  };
}
