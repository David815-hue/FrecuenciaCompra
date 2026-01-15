import React, { useState } from 'react';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

const ProductSummary = ({ items }) => {
    // Group by SKU, excluding delivery service
    const grouped = items.reduce((acc, item) => {
        // Skip delivery service SKU
        if (item.sku === '20000025') return acc;

        if (!acc[item.sku]) {
            acc[item.sku] = { ...item, totalQuantity: 0, totalAmount: 0 };
        }
        acc[item.sku].totalQuantity += parseInt(item.quantity) || 0;
        acc[item.sku].totalAmount += parseFloat(item.lineTotal) || 0;
        return acc;
    }, {});

    const topProducts = Object.values(grouped)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 3);

    return (
        <div className="flex flex-col gap-2">
            {topProducts.map(p => (
                <div key={p.sku} className="flex justify-between items-center text-[10px] border-b border-slate-700/50 pb-1 last:border-0 hover:bg-slate-800/50 p-1 rounded transition-colors">
                    <div className="flex flex-col truncate pr-2">
                        <span className="text-slate-200 font-medium truncate w-32" title={p.description}>{p.description}</span>
                        <span className="text-slate-500 font-mono text-[9px]">{p.sku}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <span className="text-indigo-300 font-bold whitespace-nowrap">L. {(p.totalAmount).toLocaleString()}</span>
                        <span className="text-slate-400 font-medium">{p.totalQuantity} un.</span>
                    </div>
                </div>
            ))}
            {Object.keys(grouped).length > 3 && (
                <div className="text-[9px] text-center text-slate-500 font-medium pt-1">
                    + {Object.keys(grouped).length - 3} productos más
                </div>
            )}
        </div>
    );
};

const MonthVisualizer = ({ orders, minDate, maxDate, onClick }) => {
    const [hoveredMonth, setHoveredMonth] = useState(null);
    const [shakingMonth, setShakingMonth] = useState(null);

    const timeline = eachMonthOfInterval({
        start: startOfMonth(minDate || new Date()),
        end: endOfMonth(maxDate || new Date())
    });

    const monthData = {};
    orders.forEach(order => {
        const d = new Date(order.orderDate);
        if (isNaN(d.getTime())) return; // Skip invalid dates

        const key = format(d, 'yyyy-MM');
        if (!monthData[key]) {
            monthData[key] = {
                count: 0,
                items: [],
                total: 0,
                date: new Date(key + '-01') // Add date for formatting
            };
        }
        monthData[key].count++;
        monthData[key].total += parseFloat(order.totalAmount || 0);
        // Add items if available (requires order structure update to include items here if needed for tooltip)
        // Assuming order has items attached or we pass items differently.
        // For now using empty items or if order has items prop.
        if (order.items) monthData[key].items.push(...order.items);
    });

    // Helper for heatmap color
    const getIntensityClass = (count) => {
        if (!count) return 'bg-slate-50/50 dark:bg-slate-900/50 text-slate-300 dark:text-slate-600 border-r border-slate-100/50 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';

        // 1 purchase: Green
        if (count === 1) return 'bg-emerald-300 dark:bg-emerald-500/80 text-emerald-900 dark:text-white font-bold border-r border-emerald-400/20 dark:border-emerald-500/30 hover:bg-emerald-400 dark:hover:bg-emerald-500 cursor-pointer shadow-sm';

        // 2-3 purchases: Orange
        if (count <= 3) return 'bg-amber-400 dark:bg-amber-500/90 text-amber-950 dark:text-white font-bold border-r border-amber-500/20 dark:border-amber-500/30 hover:bg-amber-500 dark:hover:bg-amber-600 cursor-pointer shadow-sm';

        // 4+ purchases: Red
        return 'bg-rose-500 dark:bg-rose-600 text-white font-bold shadow-inner border-r border-rose-600/20 dark:border-rose-500/30 hover:bg-rose-600 dark:hover:bg-rose-700 cursor-pointer';
    };

    const handleMonthClick = (key, data) => {
        if (onClick && data && data.count > 0) {
            onClick(key, data);
        } else {
            // Shake animation for empty data
            setShakingMonth(key);
            setTimeout(() => setShakingMonth(null), 500);
        }
    };

    return (
        <div className="flex w-full min-w-[200px] border border-slate-200/60 dark:border-slate-700/60 rounded-xl divide-x divide-slate-100 dark:divide-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden transition-colors duration-300">
            {timeline.map((dateObj, idx) => {
                const key = format(dateObj, 'yyyy-MM');
                const data = monthData[key];
                const count = data ? data.count : 0;

                const monthLabel = format(dateObj, 'MMM', { locale: es });
                const monthAbbr = monthLabel.substring(0, 3); // First 3 letters
                const isHovered = hoveredMonth === key;
                const isShaking = shakingMonth === key;

                // Check if year changed from previous month
                const prevMonth = idx > 0 ? timeline[idx - 1] : null;
                const yearChanged = prevMonth && dateObj.getFullYear() !== prevMonth.getFullYear();

                return (
                    <motion.div
                        key={key}
                        className={`
                            relative flex-1 h-9 flex items-center justify-center text-[10px] transition-all duration-200
                            ${getIntensityClass(count)}
                            ${count > 0 ? 'active:scale-95' : ''}
                        `}
                        animate={isShaking ? { x: [0, -4, 4, -4, 4, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        onMouseEnter={() => setHoveredMonth(key)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        onClick={() => handleMonthClick(key, data)}
                    >
                        {/* Label - 3 letters */}
                        <span className={`relative z-10 flex flex-col items-center leading-none text-[9px] font-bold ${count > 3 ? 'text-white/90' : ''} ${!count ? 'opacity-60' : ''}`}>
                            {monthAbbr}
                        </span>

                        {/* Year Separator Line - only when year changes */}
                        {yearChanged && (
                            <div className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-400 via-indigo-500 to-indigo-400 dark:from-indigo-500 dark:via-indigo-400 dark:to-indigo-500 z-30" />
                        )}

                        {/* Tooltip */}
                        {count > 0 && isHovered && data && (
                            <div className="absolute bottom-full right-0 mb-3 w-72 p-0 bg-slate-900 dark:bg-black/95 text-white text-xs rounded-2xl shadow-2xl z-[100] pointer-events-none transform origin-bottom-right animate-in fade-in zoom-in-95 duration-200 border border-slate-700 overflow-hidden">
                                {/* Tooltip Header */}
                                <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                                    <span className="text-sm font-bold capitalize text-white">{format(dateObj, 'MMMM yyyy', { locale: es })}</span>
                                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                                        {count} pedidos
                                    </span>
                                </div>

                                {/* Tooltip Body */}
                                <div className="p-4 space-y-3 max-h-60 overflow-y-auto custom-scrollbar-dark bg-slate-900/95 dark:bg-black/80">
                                    <ProductSummary items={data.items || []} />
                                </div>

                                {/* Tooltip Footer */}
                                <div className="bg-slate-950/50 dark:bg-black/50 px-4 py-2 text-center border-t border-slate-800">
                                    <span className="text-indigo-400 text-[10px] font-semibold tracking-wide uppercase">👆 Haz clic para ver detalles</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                );
            })}
        </div>
    );
};



export default MonthVisualizer;
