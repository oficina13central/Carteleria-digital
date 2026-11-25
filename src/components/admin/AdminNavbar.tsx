'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Globe, HardDrive, LayoutGrid, LogOut, Monitor, Tv, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { UserRoleType } from '@/types/database';
import { StorageAlertBanner } from './StorageAlertBanner';
import { StorageUsageMonitor } from './StorageUsageMonitor';
import { useStorageStatus } from './useStorageStatus';

interface AdminNavbarProps {
  role: UserRoleType;
  sucursalId?: string | null;
  branchName?: string;
  userEmail?: string;
}

export function AdminNavbar({
  role,
  sucursalId,
  branchName,
  userEmail,
}: AdminNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { statusData, autoNotice, clearAutoNotice, loading, alertKey } = useStorageStatus();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href={role === 'superadmin' ? '/admin/monitoreo' : `/admin/sucursal/${sucursalId}`}
            className="flex items-center gap-2.5 text-white font-semibold"
          >
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
              <Tv className="w-5 h-5" />
            </div>
            <span className="hidden sm:inline">Cartelería Digital</span>
          </Link>

          <nav className="flex items-center gap-1.5">
            {role === 'superadmin' && (
              <>
                <Link
                  href="/admin/monitoreo"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin/monitoreo')
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Monitoreo
                </Link>
                <Link
                  href="/admin/global"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin/global')
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Contenido Global
                </Link>
                <Link
                  href="/admin/usuarios"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin/usuarios')
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Usuarios
                </Link>
                <Link
                  href="/admin/storage"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin/storage')
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  Storage
                </Link>
              </>
            )}

            {sucursalId && (
              <Link
                href={`/admin/sucursal/${sucursalId}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith('/admin/sucursal')
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                {branchName || 'Mi Sucursal'}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <StorageUsageMonitor statusData={statusData} loading={loading} role={role} />

          <span
            className={`hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              role === 'superadmin'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {role === 'superadmin' ? 'Super Admin · Casa Central' : 'Encargado de Sucursal'}
          </span>

          {userEmail && (
            <span className="hidden lg:inline text-xs text-slate-400">{userEmail}</span>
          )}

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
    <StorageAlertBanner
      role={role}
      statusData={statusData}
      autoNotice={autoNotice}
      onClearAutoNotice={clearAutoNotice}
      alertKey={alertKey}
    />
    </>
  );
}
