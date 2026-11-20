import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { BranchManagerClient } from '@/components/admin/BranchManagerClient';
import type { MediaItem, Pantalla, Sucursal, UserRoleType } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function SucursalAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pantalla?: string }>;
}) {
  const { id } = await params;
  const { pantalla: selectedPantallaId } = await searchParams;

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

  const role = roleRow.rol as UserRoleType;

  if (role === 'sucursal' && roleRow.sucursal_id !== id) {
    redirect(`/admin/sucursal/${roleRow.sucursal_id}`);
  }

  const [{ data: sucursal }, { data: pantallas }, { data: mediaItems }] = await Promise.all([
    supabase.from('sucursales').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('pantallas')
      .select('*')
      .eq('sucursal_id', id)
      .order('nombre', { ascending: true }),
    supabase
      .from('media_items')
      .select('*')
      .or(`sucursal_id.is.null,sucursal_id.eq.${id}`)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (!sucursal) notFound();

  // Ordenar: Globales primero, luego Locales por orden
  const sortedItems = ((mediaItems as MediaItem[]) || []).sort((a, b) => {
    if ((a.sucursal_id === null) !== (b.sucursal_id === null)) {
      return a.sucursal_id === null ? -1 : 1;
    }
    return a.orden - b.orden;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNavbar
        role={role}
        sucursalId={id}
        branchName={(sucursal as Sucursal).nombre}
        userEmail={user.email}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <BranchManagerClient
          sucursal={sucursal as Sucursal}
          initialPantallas={(pantallas as Pantalla[]) || []}
          initialMediaItems={sortedItems}
          role={role}
          initialSelectedPantallaId={selectedPantallaId}
        />
      </main>
    </div>
  );
}
