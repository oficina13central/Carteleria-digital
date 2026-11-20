import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const { data: roleRow } = await supabase
    .from('usuarios_roles')
    .select('rol')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!roleRow || roleRow.rol !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  const [{ data: roles, error: rolesErr }, { data: usersPage, error: usersErr }] =
    await Promise.all([
      admin
        .from('usuarios_roles')
        .select('user_id, rol, sucursal_id, created_at')
        .order('created_at', { ascending: false }),
      admin.auth.admin.listUsers({ perPage: 500 }),
    ]);

  if (rolesErr || usersErr) {
    return NextResponse.json(
      { error: rolesErr?.message || usersErr?.message || 'Error al listar usuarios' },
      { status: 500 }
    );
  }

  const emailMap = new Map(
    (usersPage?.users || []).map((u) => [u.id, u.email || 'Sin email'])
  );

  const enriched = (roles || []).map((r) => ({
    ...r,
    email: emailMap.get(r.user_id) || 'Usuario eliminado',
  }));

  return NextResponse.json({ users: enriched });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    sucursal_id?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const sucursalId = body.sucursal_id;

  if (!email || !password || password.length < 6 || !sucursalId) {
    return NextResponse.json(
      { error: 'Email, contraseña (mín. 6 caracteres) y sucursal son obligatorios.' },
      { status: 400 }
    );
  }

  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !createdUser.user) {
    return NextResponse.json(
      { error: createErr?.message || 'No se pudo crear el usuario en Auth.' },
      { status: 400 }
    );
  }

  const { error: roleErr } = await admin.from('usuarios_roles').insert({
    user_id: createdUser.user.id,
    rol: 'sucursal',
    sucursal_id: sucursalId,
  });

  if (roleErr) {
    // Rollback del usuario en Auth si falla la asignación de rol
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }

  return NextResponse.json({
    user: {
      user_id: createdUser.user.id,
      email: createdUser.user.email,
      rol: 'sucursal',
      sucursal_id: sucursalId,
      created_at: new Date().toISOString(),
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    user_id?: string;
    password?: string;
    sucursal_id?: string;
  };

  if (!body.user_id) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }

  if (body.password) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }
    const { error: pwdErr } = await admin.auth.admin.updateUserById(body.user_id, {
      password: body.password,
    });
    if (pwdErr) {
      return NextResponse.json({ error: pwdErr.message }, { status: 400 });
    }
  }

  if (body.sucursal_id) {
    const { error: branchErr } = await admin
      .from('usuarios_roles')
      .update({ sucursal_id: body.sucursal_id })
      .eq('user_id', body.user_id)
      .eq('rol', 'sucursal');
    if (branchErr) {
      return NextResponse.json({ error: branchErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }
  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: 'No puedes eliminar tu propio usuario Super Admin.' },
      { status: 400 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
