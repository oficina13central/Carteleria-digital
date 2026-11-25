import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminSupabaseClient } from '@/lib/supabase/admin';
import {
  deleteMediaAndOrphans,
  getStorageConfig,
  getStorageSummary,
  saveStorageConfig,
  type StorageConfig,
} from '@/lib/storage/storageManager';

async function getAuthenticatedRole() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const { data: roleRow } = await supabase
    .from('usuarios_roles')
    .select('rol, sucursal_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!roleRow) {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }

  return { user, role: roleRow.rol as 'superadmin' | 'sucursal' };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedRole();
  if (auth.error) return auth.error;

  const admin = getAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const summary = await getStorageSummary(admin);

    if (mode === 'status' || auth.role !== 'superadmin') {
      return NextResponse.json({
        totalBytes: summary.totalBytes,
        limitBytes: summary.limitBytes,
        usedPercent: summary.usedPercent,
        status: summary.status,
        config: summary.config,
        totalObjects: summary.totalObjects,
        mediaCount: summary.mediaItems.length,
        orphanCount: summary.orphanObjects.length,
      });
    }

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al consultar Storage' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedRole();
  if (auth.error) return auth.error;

  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Solo Super Admin puede modificar esta configuración' }, { status: 403 });
  }

  const admin = getAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as Partial<StorageConfig>;
    const current = await getStorageConfig(admin);

    const nextConfig: StorageConfig = {
      limitMb: typeof body.limitMb === 'number' ? body.limitMb : current.limitMb,
      warningPercent:
        typeof body.warningPercent === 'number' ? body.warningPercent : current.warningPercent,
      criticalPercent:
        typeof body.criticalPercent === 'number' ? body.criticalPercent : current.criticalPercent,
      targetSafePercent:
        typeof body.targetSafePercent === 'number'
          ? body.targetSafePercent
          : current.targetSafePercent,
      autoCleanupEnabled:
        typeof body.autoCleanupEnabled === 'boolean'
          ? body.autoCleanupEnabled
          : current.autoCleanupEnabled,
      lastCleanup: current.lastCleanup,
    };

    const saved = await saveStorageConfig(admin, nextConfig);
    return NextResponse.json({ config: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al guardar configuración' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedRole();
  if (auth.error) return auth.error;

  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Solo Super Admin puede eliminar archivos desde aquí' }, { status: 403 });
  }

  const admin = getAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      mediaItemIds?: string[];
      orphanPaths?: string[];
    };

    const mediaItemIds = Array.isArray(body.mediaItemIds) ? body.mediaItemIds : [];
    const orphanPaths = Array.isArray(body.orphanPaths) ? body.orphanPaths : [];

    if (mediaItemIds.length === 0 && orphanPaths.length === 0) {
      return NextResponse.json({ error: 'No se seleccionaron elementos' }, { status: 400 });
    }

    const result = await deleteMediaAndOrphans(admin, mediaItemIds, orphanPaths);
    const summary = await getStorageSummary(admin);

    return NextResponse.json({
      ...result,
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al eliminar archivos' },
      { status: 500 }
    );
  }
}
