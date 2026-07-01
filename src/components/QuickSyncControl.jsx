import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';

const QuickSyncControl = ({ state, onStart }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isRunning = state.status === 'running';
    const isSuccess = state.status === 'success' || state.status === 'up_to_date';
    const progress = isRunning ? Math.max(8, Math.round(((state.step || 1) / 7) * 100)) : (isSuccess ? 100 : 0);

    const handleClick = () => {
        setIsOpen(true);
        if (!isRunning) onStart();
    };

    return (
        <div className="relative">
            <button
                onClick={handleClick}
                disabled={isRunning}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={isRunning ? 'Actualizando datos' : 'Actualizar datos hasta ayer'}
                title="Actualizar automáticamente desde el último pedido hasta ayer"
            >
                <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full z-[80] mt-2 w-[min(310px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                {isRunning && <Loader2 size={14} className="shrink-0 animate-spin text-indigo-600" />}
                                {state.status === 'error' && <AlertCircle size={14} className="shrink-0 text-rose-600" />}
                                {isSuccess && <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />}
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{isRunning ? 'Actualizando' : state.status === 'error' ? 'No se completó' : isSuccess ? 'Datos al día' : 'Actualizar datos'}</p>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{state.text || 'Se actualizará automáticamente hasta ayer.'}</p>
                        </div>
                        {!isRunning && <button onClick={() => setIsOpen(false)} aria-label="Cerrar" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"><X size={14} /></button>}
                    </div>

                    {(state.startDate || state.endDate) && (
                        <div className="mx-4 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <span>{state.startDate || '—'}</span><span aria-hidden="true">→</span><span>{state.endDate || '—'}</span>
                        </div>
                    )}

                    <div className="px-4 pb-3.5 pt-3">
                        <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full transition-all duration-500 ${state.status === 'error' ? 'bg-rose-500' : isSuccess ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} /></div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-slate-400">
                            <span>{isRunning ? `Paso ${state.step || 1} de 7` : isSuccess && state.count !== undefined ? `${state.count} clientes procesados` : state.status === 'error' ? 'Puedes intentarlo nuevamente' : 'Modo incremental'}</span>
                            <span>{progress}%</span>
                        </div>
                        {state.status === 'error' && <button onClick={onStart} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"><RefreshCw size={13} /> Reintentar actualización</button>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuickSyncControl;
