import React, { useState, useEffect } from 'react';
import {
  Brain,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  ShoppingCart,
  ChevronRight,
  Zap,
  Shield,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { Asset, ObsolescenceReport } from '../types';

interface ObsolescencePanelProps {
  asset: Asset;
  onClose: () => void;
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
  apiBase: string;
  onReportGenerated?: () => void;
}

// ── Score → Color/Label ──────────────────────────────────────────────────────
const LEVEL_CONFIG = {
  optimo:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Óptimo',    icon: '✅' },
  aceptable:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Aceptable', icon: '🔵' },
  'atención': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Atención',  icon: '⚠️' },
  'crítico':  { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'Crítico',   icon: '🟠' },
  obsoleto:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Obsoleto',  icon: '🔴' },
} as const;

const PRIORITY_CONFIG = {
  alta:  { color: '#ef4444', label: 'Prioridad Alta'  },
  media: { color: '#f59e0b', label: 'Prioridad Media' },
  baja:  { color: '#3b82f6', label: 'Prioridad Baja'  },
};

// ── Circular score meter ─────────────────────────────────────────────────────
function ScoreMeter({ score, level }: { score: number; level: keyof typeof LEVEL_CONFIG }) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG['atención'];
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="110" height="110" viewBox="0 0 110 110">
        {/* Track */}
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
        {/* Progress */}
        <circle
          cx="55" cy="55" r={radius}
          fill="none"
          stroke={cfg.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          strokeDashoffset={circumference * 0.25}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        {/* Score text */}
        <text x="55" y="52" textAnchor="middle" fontSize="22" fontWeight="bold" fill={cfg.color} fontFamily="monospace">
          {score.toFixed(1)}
        </text>
        <text x="55" y="66" textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="sans-serif">
          /10
        </text>
      </svg>
      <span
        className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide"
        style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}40` }}
      >
        {cfg.icon} {cfg.label}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ObsolescencePanel({ asset, onClose, authenticatedFetch, apiBase, onReportGenerated }: ObsolescencePanelProps) {
  const [report, setReport]         = useState<ObsolescenceReport | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(asset.aiReportDate || null);

  // Intentar cargar reporte guardado si existe en el activo
  useEffect(() => {
    if (asset.aiReport) {
      try {
        const parsed = JSON.parse(asset.aiReport);
        setReport(parsed);
      } catch (err) {
        console.warn('Error parseando reporte inicial del activo:', err);
      }
    }
  }, [asset]);

  function safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  }

  const runAnalysis = async (forceUpdate = false) => {
    setLoading(true);
    setError(null);
    if (forceUpdate) {
      setReport(null);
    }
    try {
      const body = safeStringify({
        assetId:      asset.id,
        brand:        asset.brand,
        model:        asset.model,
        category:     asset.category,
        specification: asset.specification ? asset.specification.substring(0, 1500) : '',
        purchaseDate: asset.purchaseDate,
        notes:        asset.notes,
        force:        forceUpdate,
      });
      const res = await authenticatedFetch(`${apiBase}/ai/obsolescence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error en el análisis de IA');
      }
      const data = await res.json();
      setReport(data.report);
      setReportDate(data.date);
      if (onReportGenerated) {
        onReportGenerated();
      }
    } catch (e: any) {
      console.error('[ObsolescencePanel] Error en runAnalysis:', e);
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const levelCfg = report ? (LEVEL_CONFIG[report.level] || LEVEL_CONFIG['atención']) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/70 backdrop-blur-sm">
      {/* Drawer panel */}
      <div
        className="relative h-full w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideInRight 0.25s ease' }}
      >
        {/* ── Header ── */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <Brain className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Análisis de Obsolescencia IA</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {asset.brand} {asset.model} <span className="text-slate-600">·</span> {asset.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Asset summary bar ── */}
        <div className="px-5 py-3 bg-slate-950/50 border-b border-slate-800 shrink-0">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Categoría:</span>{' '}
              <span className="text-slate-300">{asset.category}</span>
            </div>
            <div>
              <span className="text-slate-500">Adquirido:</span>{' '}
              <span className="text-slate-300">{asset.purchaseDate || 'Desconocido'}</span>
            </div>
            <div className="col-span-2 truncate">
              <span className="text-slate-500">Specs:</span>{' '}
              <span className="text-slate-300">{asset.specification || 'No especificadas'}</span>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Initial CTA */}
          {!loading && !report && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-10">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center">
                  <Brain className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="text-white font-semibold text-base">Análisis con IA Gemini</h3>
                <p className="text-slate-400 text-xs max-w-xs leading-relaxed">
                  Gemini evaluará las especificaciones técnicas del equipo y generará un diagnóstico
                  de obsolescencia con recomendaciones de reemplazo actualizadas.
                </p>
              </div>
              <button
                onClick={runAnalysis}
                className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition text-sm shadow-lg shadow-violet-900/40 active:scale-95"
              >
                <Zap className="w-4 h-4" />
                Analizar con IA
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
              <p className="text-slate-300 text-sm font-medium">Consultando a Gemini AI...</p>
              <p className="text-slate-500 text-xs text-center max-w-xs">
                Analizando especificaciones técnicas y comparando con el mercado actual
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 text-sm font-medium">Error en el análisis</p>
                  <p className="text-red-400/70 text-xs mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={runAnalysis}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-sm"
              >
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
            </div>
          )}

          {/* Report */}
          {report && !loading && levelCfg && (
            <div className="space-y-5">
              {/* Score + nivel */}
              {/* Score + nivel */}
              <div
                className="rounded-xl p-5 border flex flex-col sm:flex-row items-center gap-5"
                style={{ backgroundColor: levelCfg.bg, borderColor: `${levelCfg.color}30` }}
              >
                <ScoreMeter score={report.score} level={report.level} />
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-400">Vida útil restante:</span>
                    <span className="text-sm font-bold" style={{ color: levelCfg.color }}>
                      {report.estimatedLifeLeft}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{report.diagnosis}</p>
                  
                  {reportDate && (
                    <div className="flex items-center gap-1.5 justify-center sm:justify-start text-[10px] text-slate-500 pt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Último análisis: {new Date(reportDate).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Recomendación principal */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Acción Recomendada</span>
                </div>
                <p className="text-sm text-emerald-300 font-semibold">{report.recommendation}</p>
              </div>

              {/* Fortalezas y debilidades */}
              {((report.strengths?.length ?? 0) > 0 || (report.weaknesses?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.strengths && report.strengths.length > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Fortalezas</span>
                      </div>
                      <ul className="space-y-1">
                        {report.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.weaknesses && report.weaknesses.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-bold text-red-400 uppercase tracking-wide">Limitaciones</span>
                      </div>
                      <ul className="space-y-1">
                        {report.weaknesses.map((w, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                            <span className="text-red-500 mt-0.5 shrink-0">•</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Alternativas de reemplazo */}
              {report.replacements && report.replacements.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                      Alternativas de Reemplazo
                    </span>
                  </div>
                  <div className="space-y-2">
                    {report.replacements.map((r, i) => {
                      const pc = PRIORITY_CONFIG[r.priority] || PRIORITY_CONFIG.media;
                      return (
                        <div
                          key={i}
                          className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 hover:border-slate-600 transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white">{r.brand} {r.model}</span>
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                                  style={{ color: pc.color, backgroundColor: `${pc.color}18`, border: `1px solid ${pc.color}30` }}
                                >
                                  {pc.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{r.reason}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-sm font-bold text-emerald-400">{r.estimatedPrice}</span>
                              <p className="text-[10px] text-slate-500">est. USD</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Re-analyze forcing update */}
              <button
                onClick={() => runAnalysis(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Volver a analizar con IA
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
