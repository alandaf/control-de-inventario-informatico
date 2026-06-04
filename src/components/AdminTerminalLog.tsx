import React, { useEffect, useRef } from 'react';
import { Terminal, Shield, Trash2, Cpu } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface AdminTerminalLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

export default function AdminTerminalLog({ logs, onClear }: AdminTerminalLogProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom of terminal
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs shadow-inner">
      {/* Header bar */}
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300 font-semibold text-xs tracking-wide">ADMINISTRATOR TERMINAL SHELL (ACTIVE RUNTIME)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
            <Shield className="w-3 h-3 text-emerald-500" />
            <span>SECURE ROOT ACCESS</span>
          </div>
          <button 
            type="button"
            onClick={onClear}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-800"
            title="Limpiar Consola"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Area */}
      <div 
        ref={terminalRef}
        className="p-4 h-32 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 bg-slate-950/90 text-slate-300 leading-relaxed"
      >
        <div className="text-slate-500 text-[10px] pb-1 border-b border-slate-900 mb-2">
          -- SESSION AUDIT REPORT / SYSTEM INITIALIZED @ {new Date().toLocaleTimeString('es-CL', { hour12: false })} CLT --
        </div>
        
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">No se han registrado operaciones en esta sesión.</div>
        ) : (
          logs.map((log) => {
            const levelColors = {
              info: 'text-sky-400',
              success: 'text-emerald-400',
              warning: 'text-amber-400',
              error: 'text-rose-500'
            };

            const levelPrefix = {
              info: '[INFO]',
              success: '[SUCCESS]',
              warning: '[WARN]',
              error: '[ERR]'
            };

            return (
              <div key={log.id} className="flex gap-2 items-start hover:bg-slate-900/30 py-0.5 px-1 rounded transition-colors">
                <span className="text-slate-600 select-none text-[10px] pt-0.5">{log.timestamp}</span>
                <span className={`font-bold shrink-0 text-[10px] ${levelColors[log.level]}`}>
                  {levelPrefix[log.level]}
                </span>
                <span className="break-all text-slate-300">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
