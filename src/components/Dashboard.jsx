import React, { useState, useMemo } from 'react';
import { Search, Download, Filter, ShoppingBag, ArrowLeft, User, Phone, Mail, Calendar, MapPin } from 'lucide-react';
import { filterData, exportToExcel } from '../utils/dataProcessing';
import MonthVisualizer from './MonthVisualizer';
import ProductDetailsModal from './ProductDetailsModal';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const Dashboard = ({ data, onBack }) => {
    const [query, setQuery] = useState('');
    const [onlyRecurring, setOnlyRecurring] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(null);

    // 1. Filter Data (Search)
    const filteredData = useMemo(() => {
        return filterData(data, query);
    }, [data, query]);

    // 2. Group by Customer
    const customers = useMemo(() => {
        const map = {};
        filteredData.forEach(order => {
            const key = order.email || order.phone || order.name;
            if (!key) return;

            if (!map[key]) {
                map[key] = {
                    name: order.name,
                    email: order.email,
                    phone: order.phone,
                    identity: order.identity || 'No se encontró',
                    city: order.city,
                    orders: []
                };
            }
            map[key].orders.push(order);

            if (order.identity && order.identity !== 'No se encontró' && (map[key].identity === 'No se encontró')) {
                map[key].identity = order.identity;
            }
        });

        return Object.values(map);
    }, [filteredData]);

    // 3. Apply Recurring Filter
    const displayList = useMemo(() => {
        if (!query || query.trim().length < 3) {
            return [];
        }

        let list = customers;
        if (onlyRecurring) {
            list = list.filter(c => c.orders.length > 1);
        }
        return list;
    }, [customers, onlyRecurring, query]);

    // 4. Calculate Global Date Range
    const dateRange = useMemo(() => {
        let minTime = Infinity;
        let maxTime = -Infinity;

        displayList.forEach(c => {
            c.orders.forEach(o => {
                const d = new Date(o.orderDate);
                if (!isNaN(d)) {
                    const t = d.getTime();
                    if (t < minTime) minTime = t;
                    if (t > maxTime) maxTime = t;
                }
            });
        });

        if (minTime === Infinity) return { min: new Date(), max: new Date() };

        const minDate = new Date(minTime);
        minDate.setDate(1);

        const maxDate = new Date(maxTime);
        maxDate.setDate(1);

        return { min: minDate, max: maxDate };
    }, [displayList]);


    const handleExport = () => {
        exportToExcel(displayList, query);
    };

    const handleMonthClick = (customer) => (monthKey, monthData) => {
        const monthLabel = format(monthData.date, 'MMMM yyyy', { locale: es });

        setSelectedMonth({
            customerName: customer.name,
            monthLabel: monthLabel,
            orderCount: monthData.count,
            items: monthData.items,
            monthKey: monthKey
        });
    };

    const handleCloseModal = () => {
        setSelectedMonth(null);
    };

    // Stagger animation for table rows
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="max-w-[1920px] mx-auto space-y-8">
            {/* Header Area */}
            <header className="flex flex-col gap-8">
                {/* Top Navigation Bar */}
                <div className="flex justify-between items-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/50 dark:border-slate-800 shadow-sm transition-colors duration-300">
                    <button
                        onClick={onBack}
                        className="group flex items-center gap-3 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-medium text-sm"
                    >
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 transition-colors">
                            <ArrowLeft size={16} />
                        </div>
                        <span>Volver al inicio</span>
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={displayList.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-lg shadow-slate-900/20 dark:shadow-black/40 hover:bg-slate-800 dark:hover:bg-slate-700 hover:-translate-y-0.5 transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                        <Download size={16} />
                        <span>Exportar Reporte</span>
                    </button>
                </div>

                {/* Dashboard Title & Stats */}
                <div className="flex flex-col lg:flex-row gap-8 items-end lg:items-center justify-between px-4">
                    <div>
                        <motion.h1
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2"
                        >
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
                                Dashboard
                            </span> de Frecuencia
                        </motion.h1>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {query.length >= 3 ? (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center gap-2"
                                >
                                    <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                                        {displayList.length} Resultados
                                    </span>
                                    {onlyRecurring && <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">Filtro Activo</span>}
                                </motion.span>
                            ) : (
                                <span className="text-amber-600/80 dark:text-amber-400/80 font-medium flex items-center gap-2 text-sm bg-amber-50 dark:bg-amber-500/10 px-3 py-1 rounded-full w-fit">
                                    <span>💡</span>
                                    <span>Ingresa 3+ caracteres para comenzar</span>
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Controls Bar */}
                    <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
                        {/* Search Input */}
                        <div className="relative w-full md:w-96 group">
                            <div className="absolute top-1/2 -translate-y-1/2 left-4 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors">
                                <Search size={20} />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border-transparent rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20 focus:border-indigo-200 dark:focus:border-indigo-500/30 transition-all outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                                placeholder="Buscar por SKU, Email, Teléfono..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>

                        {/* Recurring Toggle */}
                        <button
                            onClick={() => setOnlyRecurring(!onlyRecurring)}
                            className={`
                                flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all font-semibold whitespace-nowrap border
                                ${onlyRecurring
                                    ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                                    : 'bg-white dark:bg-slate-900 border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'}
                            `}
                        >
                            <Filter size={18} />
                            {onlyRecurring ? 'Solo Recurrentes' : 'Mostrar Todos'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Table Area */}
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-slate-200/50 dark:shadow-black/50 border border-white/60 dark:border-slate-800 overflow-hidden transition-colors duration-300 mb-8">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                <th className="px-8 py-6 w-[22rem]">Cliente</th>
                                <th className="px-6 py-6 w-56">Identidad</th>
                                <th className="px-6 py-6 w-48 text-right">Inversión Total</th>
                                <th className="px-6 py-6 min-w-[300px]">
                                    <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity cursor-help" title="Mapa de calor de compras mensuales">
                                        <Calendar size={14} />
                                        <span>Frecuencia Mensual</span>
                                        <span className="ml-auto text-[10px] font-normal px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full normal-case tracking-normal text-slate-500 dark:text-slate-400">
                                            {dateRange.min.getFullYear()}
                                        </span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {displayList.map((customer, idx) => (
                                <tr
                                    key={`${customer.name}-${idx}`}
                                    className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group relative"
                                >
                                    <td className="px-8 py-6 align-top">
                                        <div className="flex gap-4">
                                            {/* Avatar Placeholder */}
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-sm shrink-0 shadow-inner">
                                                {customer.name.substring(0, 2).toUpperCase()}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1 truncate">{customer.name}</div>
                                                <div className="flex flex-col gap-1">
                                                    {customer.email && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                            <Mail size={12} />
                                                            {customer.email}
                                                        </div>
                                                    )}
                                                    {customer.phone && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                            <Phone size={12} />
                                                            {customer.phone}
                                                        </div>
                                                    )}
                                                    {customer.city && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                            <MapPin size={12} />
                                                            {customer.city}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-6 py-6 align-top">
                                        <div className="flex flex-col items-start gap-2">
                                            <div className="font-mono text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                                {customer.identity}
                                            </div>
                                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                {customer.orders.length} pedidos
                                            </span>
                                        </div>
                                    </td>

                                    <td className="px-6 py-6 align-top text-right">
                                        <div className="font-bold text-slate-900 dark:text-slate-100 text-lg tracking-tight">
                                            L. {customer.orders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">Total acumulado</div>
                                    </td>

                                    <td className="px-6 py-6 align-top">
                                        <MonthVisualizer
                                            orders={customer.orders}
                                            minDate={dateRange.min}
                                            maxDate={dateRange.max}
                                            onClick={handleMonthClick(customer)}
                                        />
                                    </td>
                                </tr>
                            ))}

                            {/* Empty State */}
                            {displayList.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-24 text-center">
                                        <div className="flex flex-col items-center max-w-md mx-auto">
                                            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 animate-pulse transition-colors">
                                                <Search size={40} className="text-slate-200 dark:text-slate-600" />
                                            </div>

                                            {query.length >= 3 ? (
                                                <>
                                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No se encontraron resultados</h3>
                                                    <p className="text-slate-500 dark:text-slate-400">Intenta buscar con otro nombre, SKU o número de teléfono.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Comienza tu búsqueda</h3>
                                                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                                                        Ingresa el <span className="text-indigo-600 dark:text-indigo-400 font-bold">SKU</span>, <span className="text-indigo-600 dark:text-indigo-400 font-bold">nombre</span> o <span className="text-indigo-600 dark:text-indigo-400 font-bold">teléfono</span> del cliente para ver su historial detallado.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Product Details Modal */}
            <ProductDetailsModal
                isOpen={selectedMonth !== null}
                onClose={handleCloseModal}
                customerName={selectedMonth?.customerName || ''}
                monthLabel={selectedMonth?.monthLabel || ''}
                orderCount={selectedMonth?.orderCount || 0}
                items={selectedMonth?.items || []}
            />
        </div>
    );
};

export default Dashboard;
