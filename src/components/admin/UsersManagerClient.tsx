'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Sucursal, UserRoleType } from '@/types/database';

interface UserEntry {
  user_id: string;
  email: string;
  rol: UserRoleType;
  sucursal_id: string | null;
  created_at: string;
}

interface UsersManagerClientProps {
  sucursales: Sucursal[];
  hasServiceKey: boolean;
}

export function UsersManagerClient({
  sucursales,
  hasServiceKey,
}: UsersManagerClientProps) {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(hasServiceKey);
  const [error, setError] = useState<string | null>(null);

  // Modal nuevo encargado
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id || '');
  const [creating, setCreating] = useState(false);
  const [createdBanner, setCreatedBanner] = useState<{
    email: string;
    password: string;
    branchName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal cambiar contraseña
  const [pwdTarget, setPwdTarget] = useState<UserEntry | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (!hasServiceKey) return;
    let cancelled = false;

    fetch('/api/admin/usuarios')
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error || 'Error al cargar usuarios');
        } else {
          setUsers(data.users || []);
        }
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo conectar con el servidor.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasServiceKey]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          sucursal_id: sucursalId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo crear el usuario');
      } else {
        const branchName =
          sucursales.find((s) => s.id === sucursalId)?.nombre || 'Sucursal';
        setUsers((prev) => [data.user as UserEntry, ...prev]);
        setCreatedBanner({ email: email.trim(), password, branchName });
        setEmail('');
        setPassword('');
        setShowCreate(false);
      }
    } catch {
      setError('Error de red al crear usuario.');
    } finally {
      setCreating(false);
    }
  }

  async function handleChangeBranch(userId: string, nextSucursalId: string) {
    setError(null);
    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, sucursal_id: nextSucursalId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'No se pudo cambiar la sucursal');
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId ? { ...u, sucursal_id: nextSucursalId } : u
        )
      );
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwdTarget) return;
    setSavingPwd(true);
    setError(null);

    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: pwdTarget.user_id, password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'No se pudo actualizar la contraseña');
    } else {
      setPwdTarget(null);
      setNewPassword('');
    }
    setSavingPwd(false);
  }

  async function handleDeleteUser(u: UserEntry) {
    if (!confirm(`¿Eliminar definitivamente la cuenta "${u.email}"?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/usuarios?user_id=${encodeURIComponent(u.user_id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'No se pudo eliminar');
    } else {
      setUsers((prev) => prev.filter((item) => item.user_id !== u.user_id));
    }
  }

  function copyCredentials() {
    if (!createdBanner) return;
    const text = `Acceso Cartelería Digital (${createdBanner.branchName})\nURL: ${window.location.origin}/login\nEmail: ${createdBanner.email}\nContraseña: ${createdBanner.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Credenciales y Encargados de Sucursal
            </h1>
            <p className="text-sm text-slate-400">
              Crea, visualiza y administra los accesos de cada sucursal sin entrar a Supabase.
            </p>
          </div>
        </div>

        <button
          disabled={!hasServiceKey || sucursales.length === 0}
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo Encargado
        </button>
      </div>

      {!hasServiceKey && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">
              Falta configurar <code>SUPABASE_SERVICE_ROLE_KEY</code> en Vercel
            </div>
            <p className="text-xs text-amber-200/80">
              Para crear y administrar usuarios desde este panel, copia tu clave secreta{' '}
              <strong>service_role / Secret key</strong> de Supabase (Project Settings → API) y
              agrégala en Vercel (Settings → Environment Variables) como{' '}
              <code>SUPABASE_SERVICE_ROLE_KEY</code> (como tipo <strong>Secret</strong>) y haz
              Redeploy.
            </p>
          </div>
        </div>
      )}

      {sucursales.length === 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 text-sm">
          Primero crea al menos una sucursal en <strong>Monitoreo → + Nueva Sucursal</strong> para
          poder asignarle un encargado.
        </div>
      )}

      {createdBanner && (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-emerald-200">
            <div className="font-semibold">
              Usuario creado para {createdBanner.branchName}
            </div>
            <div className="text-xs text-emerald-300/90 mt-1 font-mono">
              Email: {createdBanner.email} · Contraseña: {createdBanner.password}
            </div>
          </div>
          <button
            onClick={copyCredentials}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar acceso para enviar'}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Lista de usuarios */}
      {loading ? (
        <div className="p-10 flex items-center justify-center text-slate-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando usuarios...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {users.map((u) => {
              const isSuper = u.rol === 'superadmin';
              return (
                <div
                  key={u.user_id}
                  className="p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-white">{u.email}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          isSuper
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {isSuper ? (
                          <>
                            <Shield className="w-3 h-3" /> Super Admin
                          </>
                        ) : (
                          <>
                            <Building2 className="w-3 h-3" /> Encargado
                          </>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      ID: {u.user_id}
                    </div>
                  </div>

                  {!isSuper && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={u.sucursal_id || ''}
                        onChange={(e) => handleChangeBranch(u.user_id, e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        {sucursales.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => {
                          setPwdTarget(u);
                          setNewPassword('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Cambiar clave
                      </button>

                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {users.length === 0 && hasServiceKey && (
              <div className="p-8 text-center text-sm text-slate-400">
                No hay usuarios registrados todavía.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Nuevo Encargado */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">Nuevo Encargado de Sucursal</h3>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Sucursal</label>
              <select
                required
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Email de acceso
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sucursal.centro@empresa.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Contraseña (mín. 6 caracteres)
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Clave temporal o definitiva"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer"
              >
                {creating ? 'Creando...' : 'Crear Acceso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Cambiar Contraseña */}
      {pwdTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePassword}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-white">Cambiar contraseña</h3>
            <p className="text-xs text-slate-400">Usuario: {pwdTarget.email}</p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nueva contraseña (mín. 6 caracteres)
              </label>
              <input
                type="text"
                required
                minLength={6}
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPwdTarget(null)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPwd}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer"
              >
                {savingPwd ? 'Guardando...' : 'Guardar clave'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
