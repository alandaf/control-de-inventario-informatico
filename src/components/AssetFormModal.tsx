import React, { useState, useEffect } from 'react';
import { Asset, AssetCategory, AssetStatus, Organization } from '../types';
import { X, Save, AlertCircle } from 'lucide-react';

interface AssetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: Asset) => void;
  editingAsset: Asset | null;
  nextId: string;
  organizations: Organization[];
  userRole?: string;
}

const CATEGORIES: AssetCategory[] = [
  'Computador',
  'Portátil',
  'Servidor',
  'Redes',
  'Impresora',
  'Monitoreo / Seguridad',
  'Otro'
];

const STATUSES: AssetStatus[] = [
  'Operativo',
  'En Mantenimiento',
  'En Stock',
  'Dado de Baja'
];

export default function AssetFormModal({ 
  isOpen, 
  onClose, 
  onSave, 
  editingAsset,
  nextId,
  organizations,
  userRole
}: AssetFormModalProps) {
  const [formData, setFormData] = useState<Omit<Asset, 'id'>>({
    category: 'Computador',
    brand: '',
    model: '',
    serialNumber: '',
    ipAddress: '',
    macAddress: '',
    status: 'Operativo',
    specification: '',
    purchaseDate: new Date().toISOString().substring(0, 10),
    cargo: '',
    responsable: '',
    ubicacion: '',
    organizationId: 1,
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingAsset) {
      setFormData({
        category: editingAsset.category,
        brand: editingAsset.brand,
        model: editingAsset.model,
        serialNumber: editingAsset.serialNumber,
        ipAddress: editingAsset.ipAddress,
        macAddress: editingAsset.macAddress,
        status: editingAsset.status,
        specification: editingAsset.specification,
        purchaseDate: editingAsset.purchaseDate,
        cargo: editingAsset.cargo,
        responsable: editingAsset.responsable,
        ubicacion: editingAsset.ubicacion,
        organizationId: editingAsset.organizationId || 1,
        notes: editingAsset.notes || ''
      });
    } else {
      setFormData({
        category: 'Computador',
        brand: '',
        model: '',
        serialNumber: '',
        ipAddress: '',
        macAddress: '',
        status: 'Operativo',
        specification: '',
        purchaseDate: new Date().toISOString().substring(0, 10),
        cargo: '',
        responsable: '',
        ubicacion: '',
        organizationId: organizations.length > 0 ? organizations[0].id : 1,
        notes: ''
      });
    }
    setErrors({});
  }, [editingAsset, isOpen, organizations]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.brand.trim()) newErrors.brand = 'La marca es requerida';
    if (!formData.model.trim()) newErrors.model = 'El modelo es requerido';
    if (!formData.serialNumber.trim()) newErrors.serialNumber = 'El número de serie es requerido';
    
    // IP validate (optional but format check)
    if (formData.ipAddress.trim()) {
      const ipReg = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      if (!ipReg.test(formData.ipAddress.trim())) {
        newErrors.ipAddress = 'El formato de IP es inválido (Ej: 192.168.1.1)';
      }
    }

    // MAC validate (optional but format check)
    if (formData.macAddress.trim()) {
      const macReg = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
      if (!macReg.test(formData.macAddress.trim())) {
        newErrors.macAddress = 'Formato MAC inválido (Ej: AA:BB:CC:DD:EE:FF)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      ...formData,
      id: editingAsset ? editingAsset.id : nextId,
      software: editingAsset?.software || []
    } as Asset);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear specific field error
    if (errors[name]) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <h2 className="text-lg font-sans font-bold text-white flex items-center gap-2">
            <span className="p-1 px-2.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 rounded">
              {editingAsset ? `EDITANDO: ${editingAsset.id}` : `NUEVO REGISTRO: ${nextId}`}
            </span>
          </h2>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Seccion 1: Identificación Técnica */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 pb-1 border-b border-slate-800">
              ID & Ficha Técnica Básica
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Conditional Organization Select Dropdown (Only for Super Admin) */}
              {userRole === 'super_admin' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-350 mb-1 font-mono uppercase tracking-wider">Organización Propietaria *</label>
                  <select
                    name="organizationId"
                    value={formData.organizationId}
                    onChange={(e) => setFormData(prev => ({ ...prev, organizationId: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Categoría de Activo *</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Estado de Operación *</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {STATUSES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Marca *</label>
                <input
                  type="text"
                  name="brand"
                  placeholder="Ej: Dell, Cisco, Zebra"
                  value={formData.brand}
                  onChange={handleChange}
                  className={`w-full bg-slate-950 border ${
                    errors.brand ? 'border-rose-500' : 'border-slate-800'
                  } rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500`}
                />
                {errors.brand && (
                  <p className="text-rose-500 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.brand}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Modelo *</label>
                <input
                  type="text"
                  name="model"
                  placeholder="Ej: ThinkPad T14, PowerEdge R750"
                  value={formData.model}
                  onChange={handleChange}
                  className={`w-full bg-slate-950 border ${
                    errors.model ? 'border-rose-500' : 'border-slate-800'
                  } rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500`}
                />
                {errors.model && (
                  <p className="text-rose-500 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.model}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Número de Serie (S/N) *</label>
                <input
                  type="text"
                  name="serialNumber"
                  placeholder="Ej: SN-492942-D"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  className={`w-full bg-slate-950 border ${
                    errors.serialNumber ? 'border-rose-500' : 'border-slate-800'
                  } rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500`}
                />
                {errors.serialNumber && (
                  <p className="text-rose-500 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.serialNumber}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Fecha de Adquisición</label>
                <input
                  type="date"
                  name="purchaseDate"
                  value={formData.purchaseDate}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">Especificaciones Técnicas</label>
              <textarea
                name="specification"
                rows={2}
                placeholder="Ej: Intel i7, 32GB RAM, 1TB SSD, Dual GbE"
                value={formData.specification}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              />
            </div>

            {/* Observation Notes Field */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">Observaciones / Notas (Texto Libre)</label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Observaciones de soporte, estado físico, garantías..."
                value={formData.notes}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Seccion 2: Identificación Lógica de Red */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 pb-1 border-b border-slate-800">
              Alineación Lógica (Red)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dirección IP (Opcional)</label>
                <input
                  type="text"
                  name="ipAddress"
                  placeholder="Ej: 192.168.1.50"
                  value={formData.ipAddress}
                  onChange={handleChange}
                  className={`w-full bg-slate-950 border ${
                    errors.ipAddress ? 'border-rose-500' : 'border-slate-800'
                  } rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500`}
                />
                {errors.ipAddress && (
                  <p className="text-rose-500 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.ipAddress}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dirección MAC (Opcional)</label>
                <input
                  type="text"
                  name="macAddress"
                  placeholder="Ej: AA:BB:CC:00:11:22"
                  value={formData.macAddress}
                  onChange={handleChange}
                  className={`w-full bg-slate-950 border ${
                    errors.macAddress ? 'border-rose-500' : 'border-slate-800'
                  } rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500`}
                />
                {errors.macAddress && (
                  <p className="text-rose-500 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.macAddress}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seccion 3: Columnas de Usuario Obligatorias (Llenado Manual) */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-dashed border-slate-800">
            <h3 className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 pb-1 border-b border-slate-800 flex items-center justify-between">
              <span>Campos de Llenado Manual por Usuario</span>
              <span className="text-[10px] text-slate-500 font-sans tracking-normal capitalize font-normal">Requisitos de Control</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-emerald-400/90 mb-1 uppercase tracking-wider font-mono">
                  1. Cargo *
                </label>
                <input
                  type="text"
                  name="cargo"
                  placeholder="Ej: Supervisor de Operaciones"
                  value={formData.cargo}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-400/90 mb-1 uppercase tracking-wider font-mono">
                  2. Responsable *
                </label>
                <input
                  type="text"
                  name="responsable"
                  placeholder="Ej: Juan de Dios Valdés"
                  value={formData.responsable}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-400/90 mb-1 uppercase tracking-wider font-mono">
                  3. Ubicación *
                </label>
                <input
                  type="text"
                  name="ubicacion"
                  placeholder="Ej: Piso 2 - Sala de Rack"
                  value={formData.ubicacion}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 italic">
              * Estos tres campos proveen la custodia física/lógica final del inventariado para fines de auditoría informática.
            </p>
          </div>

        </form>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 rounded-lg transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {editingAsset ? 'Guardar Cambios' : 'Registrar Equipo'}
          </button>
        </div>
      </div>
    </div>
  );
}
