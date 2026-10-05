import { useId, useState } from 'react';
import { Calendar, ChevronDown, Plus, X } from 'lucide-react';
import { emptyPurchaseFilter, formatPurchaseMonth, getPurchaseMonth,
    previousMonthFilter, purchaseFilterError } from '../utils/purchaseActivity';

const controlClass = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const buttonClass = 'min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

function MonthSelection({ title, months, oppositeMonths, onChange, currentMonth, optional }) {
    const id = useId();
    const [month, setMonth] = useState(optional ? previousMonthFilter().boughtMonths[0] : currentMonth);
    const duplicate = oppositeMonths.includes(month);
    return (
        <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</legend>
            <div className="flex flex-wrap gap-2">
                <label htmlFor={id} className="sr-only">Mes para {title.toLowerCase()}</label>
                <input id={id} type="month" value={month} max={currentMonth}
                    onChange={event => setMonth(event.target.value)} className={`${controlClass} min-w-0 flex-1 [color-scheme:light] dark:[color-scheme:dark]`} />
                <button type="button" aria-label={`Agregar mes: ${title.toLowerCase()}`}
                    disabled={!month || month > currentMonth || duplicate || months.includes(month)}
                    onClick={() => onChange([...months, month].sort())}
                    className={`${buttonClass} flex items-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}>
                    <Plus size={16} /> Agregar
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {months.map(key => (
                    <button key={key} type="button" onClick={() => onChange(months.filter(m => m !== key))}
                        aria-label={`Quitar ${formatPurchaseMonth(key)} de ${title.toLowerCase()}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-50 px-3 text-sm font-medium text-indigo-800 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900">
                        {formatPurchaseMonth(key)} <X size={14} />
                    </button>
                ))}
            </div>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">
                {duplicate ? 'Este mes ya está en la otra selección.' : optional
                    ? 'Cualquiera de estos meses. Sin selección: compras anteriores a los meses sin compra.'
                    : 'Sin compras en ninguno de estos meses.'}
            </p>
        </fieldset>
    );
}

export default function PurchaseActivityFilter({ value, onChange }) {
    const [expanded, setExpanded] = useState(false);
    const id = useId();
    const currentMonth = getPurchaseMonth(new Date());
    const error = purchaseFilterError(value);
    const update = patch => onChange({ ...value, ...patch });
    return (
        <section aria-label="Clientes sin recompra" className="min-w-0 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    <Calendar size={18} className="text-indigo-600 dark:text-indigo-400" /> Clientes sin recompra
                </h2>
                <button type="button" onClick={() => onChange(previousMonthFilter())}
                    className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}>
                    Mes anterior → este mes
                </button>
                <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}
                    className={`${buttonClass} flex items-center gap-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800`}>
                    Personalizar meses <ChevronDown size={16} className={expanded ? 'rotate-180' : ''} />
                </button>
                {value.enabled && <button type="button" onClick={() => onChange(emptyPurchaseFilter())}
                    className={`${buttonClass} flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}>
                    <X size={15} /> Limpiar filtro
                </button>}
            </div>
            {value.enabled && !error && <p aria-live="polite" className="mt-3 text-sm leading-6 text-indigo-800 dark:text-indigo-200">
                Compraron en {value.boughtMonths.length ? value.boughtMonths.map(formatPurchaseMonth).join(' o ') : 'meses anteriores'};
                {' '}sin {value.scope === 'product' ? `compras de «${value.productQuery}»` : 'ninguna compra'} en {value.missingMonths.map(formatPurchaseMonth).join(', ')}.
            </p>}
            {expanded && <div id={id} className="mt-4 space-y-4">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <input type="checkbox" checked={value.enabled} className="h-4 w-4 accent-indigo-600"
                        onChange={event => update({ enabled: event.target.checked,
                            missingMonths: value.missingMonths.length ? value.missingMonths : [currentMonth] })} />
                    Activar comparación de meses
                </label>
                <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                    <MonthSelection title="Compraron en" months={value.boughtMonths} oppositeMonths={value.missingMonths}
                        onChange={boughtMonths => update({ boughtMonths, enabled: true })} currentMonth={currentMonth} optional />
                    <MonthSelection title="No han comprado en" months={value.missingMonths} oppositeMonths={value.boughtMonths}
                        onChange={missingMonths => update({ missingMonths, enabled: true })} currentMonth={currentMonth} />
                </div>
            </div>}
            {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </section>
    );
}
