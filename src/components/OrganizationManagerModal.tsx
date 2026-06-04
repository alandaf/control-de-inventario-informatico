import React, { useState } from 'react';
import { X, Plus, Trash2, Edit, Save, Building2, AlertCircle } from 'lucide-react';
import { Organization } from '../types';

interface OrganizationManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizations: Organization[];
  onRefreshOrgs: () => Promise<void>;
  onRefreshAssets: () => Promise<void>;
  apiUrl: string;
  token: string;
  addLog: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void;
}

export default function OrganizationManagerModal({
  isOpen,
  onClose,
  organizations,
  onRefreshOrgs,
  onRefreshAssets,
  apiUrl,
  token,
  addLog
}: OrganizationManagerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const authenticatedFetch = async (input: string, init?: RequestInit) => {
    return fetch(input, {
      ...init,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers
      }
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la organización es requerido.');
      return;
    }
    if (!username.trim()) {
      setError('El nombre de usuario para el login es requerido.');
      return;
    }
    if (!password.trim()) {
      setError('La contraseña de login es requerida.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`${apiUrl}/organizations`, {
        method: 'POST',
        body: JSON.stringify({ 
          name: name.trim(), 
          description: description.trim(),
          username: username.trim(),
          password: password.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setName('');
        setDescription('');
        setUsername('');
        setPassword('');
        await onRefreshOrgs();
        addLog(`Organización "${name.trim()}" creada con éxito.`, 'success');
      } else {
        setError(data.error || 'Error creando organización.');
      }
    } catch (err) {
      setError('Error de conexión al crear organización.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) {
      setError('El nombre de la organización es requerido.');
      return;
    }
    if (!editUsername.trim()) {
      setError('El nombre de usuario administrador es requerido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: any = { 
        name: editName.trim(), 
        description: editDescription.trim(),
        username: editUsername.trim()
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      const res = await authenticatedFetch(`${apiUrl}/organizations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingId(null);
        setEditPassword('');
        await onRefreshOrgs();
        await onRefreshAssets(); // Name changes impact joined columns
        addLog(`Organización ID ${id} modificada con éxito.`, 'info');
      } else {
        setError(data.error || 'Error modificando organización.');
      }
    } catch (err) {
      setError('Error de conexión al modificar organización.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, orgName: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la organización "${orgName}"?\nATENCIÓN: Se borrarán permanentemente TODOS los equipos y licencias asociados a esta organización.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`${apiUrl}/organizations/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await onRefreshOrgs();
        await onRefreshAssets(); // Assets deleted in cascade must be removed from state
        addLog(`Organización "${orgName}" y todo su inventario eliminados con éxito.`, 'warning');
      } else {
        setError(data.error || 'Error eliminando organización.');
      }
    } catch (err) {
      setError('Error de conexión al eliminar organización.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (org: Organization) => {
    setEditingId(org.id);
    setEditName(org.name);
    setEditDescription(org.description || '');
    setEditUsername(org.username || '');
    setEditPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <h2 className="text-base font-sans font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <span>Panel de Gestión de Organizaciones (Super Admin)</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2.5 text-xs text-rose-450 animate-fade-in">
              <AlertCircle className="w-4.5 h-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Create */}
          <form onSubmit={handleCreate} className="bg-slate-955 p-4 rounded-xl border border-slate-800/80 space-y-4">
            <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              Registrar Nueva Organización
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Nombre *</label>
                <input
                  type="text"
                  placeholder="Ej: Sucursal Valparaíso, Corporativo Central"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Descripción</label>
                <input
                  type="text"
                  placeholder="Detalles u observaciones..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Usuario de Login *</label>
                <input
                  type="text"
                  placeholder="Ej: admin_valparaiso"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Contraseña de Login *</label>
                <input
                  type="password"
                  placeholder="Contraseña del login"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-1 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-955 font-semibold rounded-lg text-xs transition cursor-pointer"
                disabled={loading}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          </form>

          {/* Organizations List */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Organizaciones Registradas
            </h3>
            
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/40 overflow-hidden">
              {organizations.map((org) => {
                const isEditing = editingId === org.id;

                return (
                  <div key={org.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    {isEditing ? (
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/20 p-3 rounded-lg border border-slate-800">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono mb-1">NOMBRE</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono mb-1">DESCRIPCIÓN</label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-350 rounded px-2 py-1 outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono mb-1">USUARIO LOGIN</label>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono mb-1">NUEVA CONTRASEÑA (OPCIONAL)</label>
                          <input
                            type="password"
                            placeholder="Dejar en blanco para mantener"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-sm">{org.name}</span>
                          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                            ID: {org.id}
                          </span>
                          <span className="text-[10px] font-mono bg-slate-800 text-emerald-450 px-1.5 py-0.5 rounded border border-slate-700">
                            Usuario: {org.username}
                          </span>
                        </div>
                        {org.description && (
                          <p className="text-slate-400 text-[11px] leading-relaxed">{org.description}</p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0 justify-end">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdate(org.id)}
                            className="p-1 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded flex items-center gap-1 transition cursor-pointer"
                            disabled={loading}
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Guardar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 px-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded transition cursor-pointer"
                            disabled={loading}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(org)}
                            className="p-1.5 text-slate-450 hover:bg-slate-800 hover:text-white rounded transition cursor-pointer"
                            title="Editar organización"
                            disabled={loading}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(org.id, org.name)}
                            className="p-1.5 text-slate-450 hover:bg-slate-800 hover:text-rose-500 rounded transition cursor-pointer"
                            title="Eliminar organización (Borrará todo su inventario)"
                            disabled={loading}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
          >
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>
  );
}
