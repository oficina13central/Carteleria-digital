import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminSupabaseClient } from '@/lib/supabase/admin';
import { getStorageSummary } from '@/lib/storage/storageManager';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { StorageManagerClient } from '@/components/admin/StorageManagerClient';

export const dynamic = 'force-dynamic';

export default async function StorageAdminPage() {
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

  const admin = getAdminSupabaseClient();
  if (!admin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <AdminNavbar role="superadmin" userEmail={user.email} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-red-950/60 border border-red-500/40 text-red-200 rounded-xl p-6 text-sm">
            Falta configurar la variable de entorno <code>SUPABASE_SERVICE_ROLE_KEY</code> en el
            servidor para consultar y administrar Supabase Storage.
          </div>
        </main>
      </div>
    );
  }

  const summary = await getStorageSummary(admin);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNavbar role="superadmin" userEmail={user.email} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <StorageManagerClient initialSummary={summary} />
      </main>
    </div>
  );
}
