import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';



const MonthVisualizer = ({ orders, minDate, maxDate, onClick }) => {
    const [hoveredMonth, setHoveredMonth] = useState(null);
    const [shakingMonth, setShakingMonth] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

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
                date: new Date(key + '-01'), // Add date for formatting
                gestores: {} // Track gestores and their order counts
            };
        }
        monthData[key].count++;
        monthData[key].total += parseFloat(order.totalAmount || 0);

        // Track gestor information
        const gestor = order.gestorName || 'Sin Asignar';
        if (!monthData[key].gestores[gestor]) {
            monthData[key].gestores[gestor] = 0;
        }
        monthData[key].gestores[gestor]++;

        // Add items if available
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

    const handleMouseEnter = (e, key) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({
            left: rect.left + rect.width / 2,
            top: rect.top
        });
        setHoveredMonth(key);
    };

    return (
        <div className="flex w-full min-w-[200px] border border-slate-200/60 dark:border-slate-700/60 rounded-xl divide-x divide-slate-100 dark:divide-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm transition-colors duration-300">
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
                            relative flex-1 h-9 flex items-center justify-center text-[10px] transition-all duration-200 first:rounded-l-xl last:rounded-r-xl
                            ${getIntensityClass(count)}
                            ${count > 0 ? 'active:scale-95' : ''}
                        `}
                        animate={isShaking ? { x: [0, -4, 4, -4, 4, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        onMouseEnter={(e) => handleMouseEnter(e, key)}
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

                        {/* Glassmorphism Tooltip - PORTAL */}
                        {count > 0 && isHovered && data && createPortal(
                            <div
                                className="fixed mb-3 min-w-[220px] p-4 bg-white/20 dark:bg-slate-900/60 backdrop-blur-xl border border-white/30 dark:border-slate-700/50 rounded-2xl shadow-xl z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                    left: tooltipPos.left,
                                    top: tooltipPos.top,
                                    transform: 'translate(-50%, -100%) translateY(-12px)'
                                }}
                            >
                                <div className="flex flex-col items-center text-center gap-1">
                                    <span className="text-sm font-bold capitalize text-slate-900 dark:text-white drop-shadow-sm">
                                        {format(dateObj, 'MMMM yyyy', { locale: es })}
                                    </span>

                                    <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-400/30 to-transparent my-1" />

                                    <div className="flex flex-col gap-0.5 w-full">
                                        <div className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300 font-medium">
                                            <span className="whitespace-nowrap">Total pedidos:</span>
                                            <span className="font-bold text-slate-900 dark:text-white bg-white/30 dark:bg-slate-800/50 px-1.5 rounded">
                                                {count}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300 font-medium">
                                            <span className="whitespace-nowrap">Gasto del mes:</span>
                                            <span className="font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                                L. {data.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {/* Gestor Information */}
                                        {data.gestores && Object.keys(data.gestores).length > 0 && (
                                            <>
                                                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-400/30 to-transparent my-1" />
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Gestores:</span>
                                                    {Object.entries(data.gestores).map(([gestor, count]) => (
                                                        <div key={gestor} className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-600 dark:text-slate-300 truncate">{gestor}</span>
                                                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 ml-2">{count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Arrow */}
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/20 dark:bg-slate-900/60 backdrop-blur-xl border-r border-b border-white/30 dark:border-slate-700/50 rotate-45 transform"></div>
                            </div>,
                            document.body
                        )}
                    </motion.div>
                );
            })}
        </div >
    );
};



export default MonthVisualizer;
