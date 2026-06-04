import React from 'react';
import { Asset, InventoryStats } from '../types';
import { 
  Database, 
  UserCheck, 
  AlertCircle, 
  Activity, 
  Cpu, 
  Server, 
  Network, 
  Laptop, 
  Printer, 
  ShieldAlert,
  HardDrive
} from 'lucide-react';

interface StatsDashboardProps {
  stats: InventoryStats;
  totalBeforeFilter: number;
}

export default function StatsDashboard({ stats, totalBeforeFilter }: StatsDashboardProps) {
  // Percentage of assets that have cargo, responsable, and ubicacion fully filled
  const completionRate = totalBeforeFilter > 0 
    ? Math.round(((totalBeforeFilter - stats.pendingClassification) / totalBeforeFilter) * 100) 
    : 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* CARD 1: TOTAL ASSETS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg hover:border-slate-700 transition">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Total Infraestructura</p>
            <h3 className="text-3xl font-sans font-bold text-white mt-1">{totalBeforeFilter}</h3>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              Equipos registrados en base de datos
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-lg text-emerald-400 border border-slate-700">
            <Cpu className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CARD 2: ASSIGNED vs STOCK */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg hover:border-slate-700 transition">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Asignados vs Stock</p>
            <h3 className="text-3xl font-sans font-bold text-white mt-1">
              {stats.assignedCount} <span className="text-sm font-medium text-slate-400">/ {stats.unassignedCount} stock</span>
            </h3>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-sky-400" />
              Equipos con custodio y cargo activo
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-lg text-sky-450 border border-slate-700 text-sky-400">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CARD 3: COMPLETION / MANUAL COLUMNS FILL */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg hover:border-slate-700 transition">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Clasificación de Usuario</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-3xl font-sans font-bold text-white">{completionRate}%</h3>
              <span className="text-xs text-amber-400 font-mono">
                ({totalBeforeFilter - stats.pendingClassification} de {totalBeforeFilter})
              </span>
            </div>
            
            {/* Custom mini progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  completionRate === 100 
                    ? 'bg-emerald-500' 
                    : completionRate > 50 
                      ? 'bg-sky-500' 
                      : 'bg-amber-500'
                }`}
                style={{ width: `${completionRate}%` }}
              ></div>
            </div>
          </div>
          <div className={`p-3 bg-slate-800/80 rounded-lg border border-slate-700 ${
            stats.pendingClassification > 0 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CARD 4: OPERATIONAL HEALTH */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg hover:border-slate-700 transition">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Disponibilidad TI</p>
            <h3 className="text-3xl font-sans font-bold text-white mt-1">
              {stats.byStatus['Operativo'] || 0} <span className="text-sm font-medium text-slate-400">operativos</span>
            </h3>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {stats.byStatus['En Mantenimiento'] || 0} en mantenimiento técnico
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-lg text-emerald-400 border border-slate-700">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
