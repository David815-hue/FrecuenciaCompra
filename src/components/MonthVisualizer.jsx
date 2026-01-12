import React, { useMemo, useState } from 'react';
import { format, parseISO, isValid, addMonths, startOfMonth, isSameMonth, differenceInMonths } from 'date-fns';
import { es } from 'date-fns/locale';

const MonthVisualizer = ({ orders, minDate, maxDate }) => {
    const [hoveredMonth, setHoveredMonth] = useState(null);

    // Generate linear timeline of months from minDate to maxDate
    const timeline = useMemo(() => {
        if (!minDate || !maxDate || !isValid(minDate) || !isValid(maxDate)) return [];

        const months = [];
        let current = startOfMonth(minDate);
        const end = startOfMonth(maxDate);

        // Safety cap: max 36 months to prevent infinite loops if dates are crazy
        let count = 0;
        while (current <= end && count < 36) {
            months.push(new Date(current));
            current = addMonths(current, 1);
            count++;
        }
        return months;
    }, [minDate, maxDate]);

    // Map data by "YYYY-MM"
    const monthData = useMemo(() => {
        const map = {};
        orders.forEach(order => {
            if (!order.orderDate) return;
            // Parse robustly
            const d = new Date(order.orderDate);
            if (!isValid(d)) return;

            const key = format(d, 'yyyy-MM');

            if (!map[key]) map[key] = { count: 0, items: [], date: d };

            map[key].count += 1;
            // Aggregate items for tooltip
            if (order.items && order.items.length > 0) {
                map[key].items.push(...order.items);
            } else {
                map[key].items.push({ description: 'Sin detalle', quantity: 1, sku: 'N/A' });
            }
        });
        return map;
    }, [orders]);

    if (timeline.length === 0) return <span className="text-slate-300 text-xs">Sin rango</span>;

    // Helper for heatmap color
    const getIntensityClass = (count) => {
        if (!count) return 'bg-slate-50 text-slate-300 border-r border-slate-100 hover:bg-slate-100';

        // 1 purchase: Green (Good start)
        if (count === 1) return 'bg-emerald-300 text-emerald-900 font-bold border-r border-emerald-400/20';

        // 2-3 purchases: Orange/Amber (Getting interesting)
        if (count <= 3) return 'bg-amber-400 text-amber-950 font-bold border-r border-amber-500/20';

        // 4+ purchases: Red/Rose (Hot/High Frequency - "Compro bastante")
        return 'bg-rose-600 text-white font-bold shadow-inner border-r border-rose-700/20';
    };

    return (
        <div className="flex w-full min-w-[200px] border border-slate-200 rounded-lg divide-x divide-slate-100 bg-slate-50">
            {timeline.map((dateObj, idx) => {
                const key = format(dateObj, 'yyyy-MM');
                const data = monthData[key];
                const count = data ? data.count : 0;

                const monthLabel = format(dateObj, 'MMM', { locale: es });
                const yearLabel = format(dateObj, 'yy');
                const firstChar = monthLabel[0].toUpperCase();

                const isJan = dateObj.getMonth() === 0;
                const isHovered = hoveredMonth === key;

                return (
                    <div
                        key={key}
                        className={`
                            relative flex-1 h-8 flex items-center justify-center text-[10px] transition-all cursor-default group first:rounded-l-lg last:rounded-r-lg
                            ${getIntensityClass(count)}
                            ${isHovered ? 'z-20 scale-110 shadow-lg ring-2 ring-indigo-500 rounded-lg' : 'z-0'}
                        `}
                        onMouseEnter={() => setHoveredMonth(key)}
                        onMouseLeave={() => setHoveredMonth(null)}
                    >
                        {/* Label */}
                        <span className="relative z-10 flex flex-col items-center leading-none">
                            {firstChar}
                        </span>

                        {/* Year Marker (Small Overlay if Jan) */}
                        {isJan && (
                            <span className="absolute -top-3.5 left-0 text-[9px] font-bold text-slate-500 z-10">
                                {yearLabel}
                            </span>
                        )}

                        {/* Tooltip */}
                        {count > 0 && isHovered && (
                            <div className="absolute bottom-full right-0 mb-2 w-72 p-4 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl z-[100] pointer-events-none transform origin-bottom-right border border-white/10 animate-in fade-in zoom-in-95 duration-150 text-left">
                                <div className="font-bold mb-3 border-b border-white/10 pb-2 flex justify-between items-center">
                                    <span className="text-base text-emerald-400 capitalize">{format(dateObj, 'MMMM yyyy', { locale: es })}</span>
                                    <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{count} pedidos</span>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    <ProductSummary items={data.items} />
                                </div>
                                {/* Arrow */}
                                <div className="absolute top-full right-4 border-8 border-transparent border-t-slate-900/95"></div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const ProductSummary = ({ items }) => {
    // Group items by SKU to sum quantities
    const grouped = items.reduce((acc, item) => {
        const key = item.sku || item.description;
        if (!acc[key]) acc[key] = { ...item, quantity: 0 };
        acc[key].quantity += (item.quantity || 1);
        return acc;
    }, {});

    const sorted = Object.values(grouped).sort((a, b) => b.quantity - a.quantity);
    const topItems = sorted.slice(0, 5); // Show top 5

    return (
        <>
            {topItems.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3 border-b border-white/5 pb-1 last:border-0">
                    <span className="truncate opacity-90 min-w-0 flex-1 text-[11px] leading-tight" title={item.description}>{item.description}</span>
                    <span className="font-mono text-emerald-400 opacity-100 whitespace-nowrap text-[11px] bg-emerald-400/10 px-1.5 rounded">x{item.quantity}</span>
                </div>
            ))}
            {sorted.length > 5 && (
                <div className="text-center pt-1 text-slate-500 italic">
                    + {sorted.length - 5} más...
                </div>
            )}
        </>
    );
};

export default MonthVisualizer;
