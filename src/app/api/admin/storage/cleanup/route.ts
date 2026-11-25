import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminSupabaseClient } from '@/lib/supabase/admin';
import { runStorageCleanup } from '@/lib/storage/storageManager';

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isValidCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  let role: 'superadmin' | 'sucursal' | 'cron' | null = isValidCron ? 'cron' : null;

  if (!isValidCron) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: roleRow } = await supabase
      .from('usuarios_roles')
      .select('rol')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleRow) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    role = roleRow.rol as 'superadmin' | 'sucursal';
  }

  const admin = getAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  try {
    let body: { mode?: 'auto' | 'manual'; targetPercent?: number } = {};
    try {
      body = (await request.json()) as { mode?: 'auto' | 'manual'; targetPercent?: number };
    } catch {
      body = { mode: 'auto' };
    }

    const isManual = body.mode === 'manual';
    if (isManual && role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Solo Super Admin puede ejecutar limpieza manual forzada' },
        { status: 403 }
      );
    }

    const result = await runStorageCleanup(admin, {
      force: isManual,
      targetPercent: typeof body.targetPercent === 'number' ? body.targetPercent : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al ejecutar limpieza de Storage' },
      { status: 500 }
    );
  }
}
