import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { GlobalMediaClient } from '@/components/admin/GlobalMediaClient';
import type { MediaItem } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function GlobalMediaPage() {
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

  const { data: items } = await supabase
    .from('media_items')
    .select('*')
    .is('sucursal_id', null)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNavbar role="superadmin" userEmail={user.email} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <GlobalMediaClient initialItems={(items as MediaItem[]) || []} />
      </main>
    </div>
  );
}
