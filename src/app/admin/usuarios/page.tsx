import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { UsersManagerClient } from '@/components/admin/UsersManagerClient';
import type { Sucursal } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function UsuariosAdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: roleRow } = await supabase
    .from('usuarios_roles')
    .select('rol, sucursal_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!roleRow) redirect('/login?error=sin_rol');
  if (roleRow.rol !== 'superadmin') {
    redirect(`/admin/sucursal/${roleRow.sucursal_id}`);
  }

  const { data: sucursales } = await supabase
    .from('sucursales')
    .select('*')
    .order('nombre', { ascending: true });

  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNavbar role="superadmin" userEmail={user.email} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <UsersManagerClient
          sucursales={(sucursales as Sucursal[]) || []}
          hasServiceKey={hasServiceKey}
        />
      </main>
    </div>
  );
}
