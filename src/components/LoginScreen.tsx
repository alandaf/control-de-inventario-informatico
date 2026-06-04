import React, { useState, useEffect } from 'react';
import { Lock, User, Key, ArrowRight, ShieldAlert, Sparkles, Building2, ShieldCheck } from 'lucide-react';
import { Organization } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (token: string, role: string, orgId?: number) => void;
  apiUrl: string;
}

export default function LoginScreen({ onLoginSuccess, apiUrl }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginType, setLoginType] = useState<'organization' | 'super_admin'>('organization');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch organizations list for login selection
    const fetchOrgs = async () => {
      try {
        const res = await fetch(`${apiUrl}/organizations`);
        if (res.ok) {
          const data = await res.json();
          setOrganizations(data);
          if (data.length > 0) {
            setSelectedOrgId(String(data[0].id));
          }
        }
      } catch (err) {
        console.error('Error fetching organizations:', err);
      }
    };
    fetchOrgs();
  }, [apiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }
    if (loginType === 'organization' && !selectedOrgId) {
      setError('Debe seleccionar una organización para ingresar.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          loginType,
          organizationId: loginType === 'organization' ? Number(selectedOrgId) : undefined
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.token) {
        onLoginSuccess(data.token, data.role || 'admin', data.orgId);
      } else {
        setError(data.error || 'Credenciales inválidas. Inténtalo de nuevo.');
      }
    } catch (err) {
      setError('No se pudo conectar al servidor. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden font-sans">
      {/* Animated glowing decorative background shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] animate-pulse [animation-delay:2s]" />

      <div className="w-full max-w-md p-8 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl relative z-10 mx-4 animate-fade-in">
        
        {/* Header/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl mb-3 shadow-inner">
            <Lock className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
            <span>Control de Inventario TI</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Ingresa tus credenciales para acceder al panel de administración.
          </p>
        </div>

        {/* Access Type Switcher */}
        <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 mb-6">
          <button
            type="button"
            onClick={() => {
              setLoginType('organization');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              loginType === 'organization'
                ? 'bg-slate-855 text-white shadow-md border border-slate-700/50'
                : 'text-slate-500 hover:text-slate-350'
            }`}
            disabled={loading}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Organización</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginType('super_admin');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              loginType === 'super_admin'
                ? 'bg-slate-855 text-white shadow-md border border-slate-700/50'
                : 'text-slate-500 hover:text-slate-355'
            }`}
            disabled={loading}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Super Admin</span>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-400 animate-fade-in">
            <ShieldAlert className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Organization Select Dropdown */}
          {loginType === 'organization' && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block font-mono">
                Seleccionar Organización
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-sm transition outline-none cursor-pointer"
                disabled={loading}
              >
                {organizations.length === 0 ? (
                  <option value="">Cargando organizaciones...</option>
                ) : (
                  organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block font-mono">
              Nombre de Usuario
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white rounded-lg text-sm transition outline-none"
                disabled={loading}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block font-mono">
                Contraseña
              </label>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                <Key className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white rounded-lg text-sm transition outline-none"
                disabled={loading}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg transition shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer mt-2 text-sm"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Acceder al Sistema</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info notice */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 text-center flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <Sparkles className="w-3 h-3 text-emerald-500/70" />
          <span>Acceso seguro protegido con tokens de sesión criptográficos.</span>
        </div>
      </div>
    </div>
  );
}
