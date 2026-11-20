import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Permitir rutas públicas (/play, /play/*, /login) sin bloquear si faltan env vars
  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: roleRow } = await supabase
      .from('usuarios_roles')
      .select('rol, sucursal_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleRow) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('error', 'sin_rol');
      return NextResponse.redirect(loginUrl);
    }

    // Solo Super Admin puede acceder a /admin/monitoreo, /admin/global y /admin/usuarios
    if (
      (pathname.startsWith('/admin/monitoreo') ||
        pathname.startsWith('/admin/global') ||
        pathname.startsWith('/admin/usuarios')) &&
      roleRow.rol !== 'superadmin'
    ) {
      const branchUrl = request.nextUrl.clone();
      branchUrl.pathname = `/admin/sucursal/${roleRow.sucursal_id}`;
      return NextResponse.redirect(branchUrl);
    }

    // Encargado de sucursal solo puede acceder a su propia sucursal
    if (pathname.startsWith('/admin/sucursal/') && roleRow.rol === 'sucursal') {
      const requestedId = pathname.split('/')[3];
      if (requestedId && requestedId !== roleRow.sucursal_id) {
        const branchUrl = request.nextUrl.clone();
        branchUrl.pathname = `/admin/sucursal/${roleRow.sucursal_id}`;
        return NextResponse.redirect(branchUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
