import React, { useState } from 'react';
import { 
  Asset, 
  SoftwareItem 
} from '../types';
import { 
  Layers, 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Plus, 
  X, 
  Trash2, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Info, 
  CornerDownRight,
  ClipboardCheck,
  Clipboard
} from 'lucide-react';

interface AssetSoftwareManagerProps {
  asset: Asset;
  onAddSoftware: (assetId: string, software: SoftwareItem) => void;
  onToggleLicense: (assetId: string, softwareName: string) => void;
  onRemoveSoftware: (assetId: string, softwareName: string) => void;
  onAutoProvision: (assetId: string, category: string) => void;
}

export default function AssetSoftwareManager({
  asset,
  onAddSoftware,
  onToggleLicense,
  onRemoveSoftware,
  onAutoProvision
}: AssetSoftwareManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSoftwareName, setNewSoftwareName] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newLicensed, setNewLicensed] = useState(true);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [newLicenseType, setNewLicenseType] = useState<SoftwareItem['licenseType']>('Comercial/Licencia Activa');
  
  // Track visible license keys by name
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const softwareList = asset.software || [];
  const isComputerOrServer = ['Computador', 'Portátil', 'Servidor'].includes(asset.category);

  const toggleKeyVisibility = (name: string) => {
    setVisibleKeys(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const copyToClipboard = (keyText: string, softwareName: string) => {
    navigator.clipboard.writeText(keyText);
    setCopiedKey(softwareName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSoftwareName.trim()) return;

    const newSoftware: SoftwareItem = {
      name: newSoftwareName.trim(),
      version: newVersion.trim() || 'v1.0',
      licensed: newLicensed,
      licenseKey: newLicenseKey.trim() || undefined,
      licenseType: newLicensed ? newLicenseType : 'Sin Licenciar/Demo'
    };

    onAddSoftware(asset.id, newSoftware);
    
    // Reset form
    setNewSoftwareName('');
    setNewVersion('');
    setNewLicensed(true);
    setNewLicenseKey('');
    setNewLicenseType('Comercial/Licencia Activa');
    setShowAddForm(false);
  };

  return (
    <div className="mt-5 pt-5 border-t border-slate-800/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        
        {/* Header Title with Soft Indicator */}
        <div className="flex items-center gap-2">
          <div className="p-1 px-2 text-[10px] uppercase font-mono font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded">
            SW-AUDIT-LOG
          </div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-350 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Software Instalado & Licenciamiento Corporativo</span>
          </h3>
        </div>

        {/* Action Controls */}
        {isComputerOrServer && (
          <div className="flex items-center gap-2">
            {softwareList.length === 0 && (
              <button
                type="button"
                onClick={() => onAutoProvision(asset.id, asset.category)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-slate-950 transition active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Autodetectar Software Recomendado</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                showAddForm 
                  ? 'bg-slate-800 text-slate-300 border border-slate-700' 
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-600'
              }`}
            >
              {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{showAddForm ? 'Cancelar' : 'Registrar Software'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 1. SECCIÓN PRINCIPAL: LISTA O MOCK DE SOFTWARE INSTALADO */}
      {!isComputerOrServer ? (
        <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 text-xs text-slate-500 flex items-start gap-2.5 leading-relaxed">
          <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
          <span>La auditoría automatizada de software solo está disponible para dispositivos tipo <strong>Computador, Portátil, o Servidor</strong>. Este dispositivo ({asset.category}) no registra ejecuciones de SO en red corporativa de manera directa.</span>
        </div>
      ) : softwareList.length === 0 ? (
        <div className="bg-slate-950/40 border border-slate-850 border-dashed rounded-xl p-6 text-center animate-fade-in">
          <Layers className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-300">No hay registros de software auditados en este equipo</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-normal">
            No se han registrado licencias para este equipo. Puede autogenerar las suites estándar de {asset.category === 'Servidor' ? 'servidores' : 'estaciones de trabajo'} o añadir programas manualmente.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => onAutoProvision(asset.id, asset.category)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-550 text-slate-950 hover:bg-emerald-650 rounded-lg transition active:scale-95 shadow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autodetectar / Cargar Recomendados</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-950/60 rounded-xl border border-slate-850 overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-850 font-mono text-[10px] uppercase tracking-wider">
                <th className="py-2.5 px-4 font-bold">Programa / Aplicación</th>
                <th className="py-2.5 px-3 font-bold">Versión</th>
                <th className="py-2.5 px-3 font-bold">Estado Licencia</th>
                <th className="py-2.5 px-3 font-bold">Tipo de Licencia</th>
                <th className="py-2.5 px-4 font-bold">Clave de Activación / Key</th>
                <th className="py-2.5 px-4 font-bold text-right">Pasivación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60">
              {softwareList.map((software, idx) => {
                const isKeyVisible = visibleKeys[software.name] || false;
                const isCopied = copiedKey === software.name;
                
                return (
                  <tr key={idx} className="hover:bg-slate-900/40 transition">
                    <td className="py-2.5 px-4 font-sans font-medium text-white flex items-center gap-2">
                      <CornerDownRight className="w-3 h-3 text-slate-600" />
                      <span>{software.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                      {software.version}
                    </td>
                    <td className="py-2.5 px-3">
                      {software.licensed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase">
                          <ShieldCheck className="w-3 h-3 shrink-0 text-emerald-400" />
                          <span>Licenciado</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 uppercase">
                          <ShieldAlert className="w-3 h-3 shrink-0 text-rose-400" />
                          <span>Sin Licencia (Demo)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {software.licenseType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">
                      {software.licenseKey ? (
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] bg-slate-900/80 border border-slate-800 px-1.5 py-0.5 rounded text-amber-500 font-mono">
                            {isKeyVisible ? software.licenseKey : '••••-••••-••••-' + software.licenseKey.slice(-5)}
                          </code>
                          
                          {/* Toggle visibility */}
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(software.name)}
                            className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                            title={isKeyVisible ? "Ocultar clave" : "Mostrar clave completa"}
                          >
                            {isKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>

                          {/* Copy key */}
                          <button
                            type="button"
                            onClick={() => copyToClipboard(software.licenseKey || '', software.name)}
                            className="p-1 hover:bg-slate-800 text-slate-500 hover:text-emerald-400 rounded transition"
                            title="Copiar Clave"
                          >
                            {isCopied ? <ClipboardCheck className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">N/A - Libre/Autogestionado</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Toggle license state */}
                        <button
                          type="button"
                          onClick={() => onToggleLicense(asset.id, software.name)}
                          className={`p-1 px-1.5 rounded text-[10px] font-mono font-semibold transition ${
                            software.licensed 
                              ? 'bg-slate-850 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                          }`}
                          title={software.licensed ? "Revocar/Pasivar licencia" : "Activar Licenciamiento"}
                        >
                          {software.licensed ? 'Revocar' : 'Licenciar'}
                        </button>
                        
                        {/* Uninstall / Delete */}
                        <button
                          type="button"
                          onClick={() => onRemoveSoftware(asset.id, software.name)}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-850 rounded transition"
                          title="Eliminar de esta máquina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. FORMULARIO EN LÍNEA: REGISTRAR UN SOFTWARE (COLLAPSIBLE) */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="mt-4 p-4 border border-slate-800 bg-slate-900/40 rounded-xl space-y-4 animate-slide-up select-none">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1">
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>Ingresar Software a Sincronizar</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">Dispositivo ID: {asset.id}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            {/* Nombre */}
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-mono block">Nombre de Aplicación *</label>
              <input
                type="text"
                required
                placeholder="Ej: SAP gui 7.7, FortiClient, Office"
                value={newSoftwareName}
                onChange={(e) => setNewSoftwareName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
            </div>

            {/* Versión */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-mono block">Versión</label>
              <input
                type="text"
                placeholder="Ej: 23H2, v12.0"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
            </div>

            {/* Licenciado (S/N) */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-mono block">¿Tiene Licencia?</label>
              <select
                value={newLicensed ? 'true' : 'false'}
                onChange={(e) => {
                  const state = e.target.value === 'true';
                  setNewLicensed(state);
                  if (!state) {
                    setNewLicenseKey('');
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="true">Sí (Licenciado)</option>
                <option value="false">No (Demo / Free)</option>
              </select>
            </div>

            {/* Tipo de Licencia */}
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] text-slate-400 uppercase font-mono block">Tipo de Contrato / Licencia</label>
              <select
                value={newLicenseType}
                disabled={!newLicensed}
                onChange={(e) => setNewLicenseType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              >
                <option value="Comercial/Licencia Activa">Comercial / Licencia Activa</option>
                <option value="Suscripción Corp">Suscripción Corporativa (O365, etc)</option>
                <option value="OEM/Bios">OEM / Integrada en Hardware</option>
                <option value="Libre/Gratuito">Libre / Gratuito / Open-Source</option>
                <option value="Sin Licenciar/Demo">Sin Licencia / Versión Demo</option>
              </select>
            </div>
          </div>

          {/* Fila de Key de Licencia */}
          {newLicensed && (
            <div className="space-y-1 animate-fade-in">
              <label className="text-[10px] text-slate-400 uppercase font-mono block flex items-center gap-1">
                <Key className="w-3 h-3 text-amber-500" />
                <span>Clave de Licencia / Key (Opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: AAAAA-BBBBB-CCCCC-DDDDD-EEEEE o Enterprise-ID-99"
                value={newLicenseKey}
                onChange={(e) => setNewLicenseKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2.5 border-t border-slate-850 pt-3">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg transition"
            >
              Confirmar Registro e Instalar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
