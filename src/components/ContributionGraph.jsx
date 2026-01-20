import React, { useMemo, useState } from 'react';
import { format, startOfWeek, eachDayOfInterval, startOfYear, endOfMonth, getYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { ShoppingBag, DollarSign, X } from 'lucide-react';

const ContributionGraph = ({ orders }) => {
    const [tooltip, setTooltip] = useState(null);
    const [isPinned, setIsPinned] = useState(false);

    // Calculate contributions per day and date range
    const { contributions, dateRange } = useMemo(() => {
        const contributionMap = {};
        let minDate = null;
        let maxDate = null;

        orders.forEach(order => {
            const orderDate = new Date(order.orderDate);
            const dateKey = format(orderDate, 'yyyy-MM-dd');

            // Filter out delivery service items
            const filteredItems = order.items?.filter(item => item.sku !== '20000025') || [];

            // Skip order if no items left after filtering
            if (filteredItems.length === 0) return;

            // Calculate delivery service charge to subtract
            const deliveryCharge = order.items?.reduce((sum, item) => {
                if (item.sku === '20000025') {
                    return sum + (parseFloat(item.lineTotal) || 0);
                }
                return sum;
            }, 0) || 0;

            // Use original total minus delivery charge
            const orderTotal = (parseFloat(order.totalAmount) || 0) - deliveryCharge;

            if (!contributionMap[dateKey]) {
                contributionMap[dateKey] = {
                    count: 0,
                    amount: 0,
                    orders: []
                };
            }

            contributionMap[dateKey].count += 1;
            contributionMap[dateKey].amount += orderTotal;
            contributionMap[dateKey].orders.push({
                ...order,
                items: filteredItems,
                totalAmount: orderTotal
            });

            // Track min and max dates
            if (!minDate || orderDate < minDate) minDate = orderDate;
            if (!maxDate || orderDate > maxDate) maxDate = orderDate;
        });

        return {
            contributions: contributionMap,
            dateRange: { minDate, maxDate }
        };
    }, [orders]);

    // Generate all days from first purchase to last purchase
    const { allDays, yearMarkers } = useMemo(() => {
        if (!dateRange.minDate || !dateRange.maxDate) {
            return { allDays: [], yearMarkers: [] };
        }

        const startDate = startOfYear(dateRange.minDate);
        const endDate = endOfMonth(dateRange.maxDate);
        const gridStart = startOfWeek(startDate, { weekStartsOn: 0 });

        const days = eachDayOfInterval({
            start: gridStart,
            end: endDate
        });

        const markers = [];
        let currentYear = null;
        let weekIndex = 0;
        const yearsAdded = new Set();

        days.forEach((day, dayIndex) => {
            const year = getYear(day);

            // Track weeks (every Sunday starts a new new week)
            if (day.getDay() === 0 && dayIndex > 0) {
                weekIndex++;
            }

            // Add year marker only once when we first encounter it
            if (currentYear !== year && !yearsAdded.has(year)) {
                markers.push({
                    year: year,
                    weekIndex: weekIndex
                });
                yearsAdded.add(year);
                currentYear = year;
            }
        });

        return { allDays: days, yearMarkers: markers };
    }, [dateRange]);

    // Group days by week
    const weeks = useMemo(() => {
        const weeksArray = [];
        let currentWeek = [];

        allDays.forEach((day) => {
            currentWeek.push(day);

            if (currentWeek.length === 7) {
                weeksArray.push(currentWeek);
                currentWeek = [];
            }
        });

        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) {
                currentWeek.push(null);
            }
            weeksArray.push(currentWeek);
        }

        return weeksArray;
    }, [allDays]);

    const getContributionLevel = (count) => {
        if (count === 0) return 0;
        if (count === 1) return 1;
        if (count <= 3) return 2;
        if (count <= 5) return 3;
        return 4;
    };

    const getColor = (level) => {
        const colors = {
            0: 'bg-slate-100 dark:bg-slate-800/30',
            1: 'bg-emerald-200 dark:bg-emerald-500/40',
            2: 'bg-emerald-400 dark:bg-emerald-500/60',
            3: 'bg-emerald-600 dark:bg-emerald-500/80',
            4: 'bg-emerald-800 dark:bg-emerald-500'
        };
        return colors[level] || colors[0];
    };

    const handleMouseEnter = (e, day, contribution) => {
        if (!contribution || contribution.count === 0 || isPinned) return;

        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
            date: day,
            contribution: contribution
        });
    };

    const handleMouseLeave = () => {
        if (!isPinned) {
            setTooltip(null);
        }
    };

    const handleClick = (e, day, contribution) => {
        if (!contribution || contribution.count === 0) return;

        e.stopPropagation(); // Prevent event bubbling

        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
            date: day,
            contribution: contribution
        });
        setIsPinned(true);
    };

    const handleCloseTooltip = (e) => {
        e?.stopPropagation();
        setTooltip(null);
        setIsPinned(false);
    };

    const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    if (weeks.length === 0) {
        return (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                No hay datos de compras disponibles
            </div>
        );
    }

    return (
        <div className="w-full overflow-x-auto relative">
            <div className="inline-block min-w-full">
                {/* Month/Year labels */}
                <div className="flex gap-[3px] mb-2 ml-8">
                    {weeks.map((week, weekIndex) => {
                        const firstDay = week.find(d => d !== null);
                        if (!firstDay) return <div key={weekIndex} style={{ width: '10px' }} />;

                        const isFirstWeekOfMonth = firstDay.getDate() <= 7;
                        const month = firstDay.getMonth();
                        const year = getYear(firstDay);
                        const isYearMarker = yearMarkers.some(m => m.weekIndex === weekIndex);

                        return (
                            <div
                                key={weekIndex}
                                className="text-[10px] font-medium relative"
                                style={{ width: '10px' }}
                            >
                                {isYearMarker && (
                                    <div className="absolute -top-6 left-0 text-sm font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                        {year}
                                    </div>
                                )}
                                {isFirstWeekOfMonth && (
                                    <span className="text-slate-500 dark:text-slate-400">
                                        {monthsShort[month]}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Grid */}
                <div className="flex gap-[3px]">
                    {/* Day labels */}
                    <div className="flex flex-col gap-[3px] pr-2">
                        {days.map((day, index) => (
                            <div
                                key={day}
                                className="h-[10px] text-[9px] text-slate-500 dark:text-slate-400 font-medium flex items-center"
                            >
                                {index % 2 === 1 ? day : ''}
                            </div>
                        ))}
                    </div>

                    {/* Weeks */}
                    {weeks.map((week, weekIndex) => {
                        const isYearBoundary = yearMarkers.some(m => m.weekIndex === weekIndex && weekIndex > 0);

                        return (
                            <div key={weekIndex} className="relative">
                                {isYearBoundary && (
                                    <div className="absolute -left-1.5 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 via-violet-600 to-indigo-500 dark:from-indigo-400 dark:via-violet-500 dark:to-indigo-400 opacity-80 shadow-lg" />
                                )}

                                <div className="flex flex-col gap-[3px]">
                                    {week.map((day, dayIndex) => {
                                        if (!day) {
                                            return <div key={dayIndex} className="w-[10px] h-[10px]" />;
                                        }

                                        const dateKey = format(day, 'yyyy-MM-dd');
                                        const contribution = contributions[dateKey];
                                        const count = contribution?.count || 0;
                                        const level = getContributionLevel(count);

                                        return (
                                            <div
                                                key={dayIndex}
                                                className={`
                                                    w-[10px] h-[10px] rounded-[2px] transition-all
                                                    ${getColor(level)}
                                                    ${count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1 hover:scale-110' : ''}
                                                `}
                                                onMouseEnter={(e) => handleMouseEnter(e, day, contribution)}
                                                onMouseLeave={handleMouseLeave}
                                                onClick={(e) => handleClick(e, day, contribution)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">Menos</span>
                    {[0, 1, 2, 3, 4].map(level => (
                        <div
                            key={level}
                            className={`w-[10px] h-[10px] rounded-[2px] ${getColor(level)}`}
                        />
                    ))}
                    <span className="font-medium">Más</span>
                </div>
            </div>

            {/* Custom Tooltip */}
            {tooltip && (
                <div
                    className={`fixed z-[9999] ${isPinned ? 'pointer-events-auto' : 'pointer-events-none'}`}
                    style={{
                        left: `${tooltip.x}px`,
                        top: `${tooltip.y}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-lg shadow-2xl p-3 min-w-[250px] max-w-[350px] border border-slate-700">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
                            <span className="font-bold text-sm">
                                {format(tooltip.date, "dd 'de' MMMM, yyyy", { locale: es })}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-emerald-400">
                                    <DollarSign size={14} />
                                    <span className="font-bold text-sm">
                                        L. {tooltip.contribution.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                {isPinned && (
                                    <button
                                        onClick={handleCloseTooltip}
                                        className="w-5 h-5 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-all"
                                        title="Cerrar"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Orders */}
                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {tooltip.contribution.orders.map((order, idx) => {
                                // Get unique items (excluding delivery service)
                                const itemsMap = {};
                                order.items?.forEach(item => {
                                    // Skip delivery service SKU
                                    if (item.sku === '20000025') return;

                                    const key = item.sku || item.description;
                                    if (!itemsMap[key]) {
                                        itemsMap[key] = {
                                            description: item.description || item.sku,
                                            quantity: 0,
                                            total: 0
                                        };
                                    }
                                    itemsMap[key].quantity += item.quantity || 0;
                                    itemsMap[key].total += item.total || 0;
                                });

                                const items = Object.values(itemsMap);

                                return (
                                    <div key={idx} className="text-xs bg-slate-800/50 rounded p-2">
                                        {/* Order header */}
                                        <div className="flex items-center gap-1 text-slate-400 mb-1">
                                            <ShoppingBag size={12} />
                                            <span className="font-semibold">
                                                Pedido {idx + 1}
                                            </span>
                                            <span className="ml-auto text-emerald-400 font-bold">
                                                L. {(parseFloat(order.totalAmount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {/* Items */}
                                        <div className="space-y-1 pl-4">
                                            {items.map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex justify-between text-[11px]">
                                                    <span className="text-slate-300 truncate flex-1">
                                                        {item.quantity}x {item.description}
                                                    </span>
                                                    <span className="text-slate-400 ml-2 font-mono">
                                                        L. {item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Arrow */}
                        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full">
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900 dark:border-t-slate-950" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContributionGraph;
