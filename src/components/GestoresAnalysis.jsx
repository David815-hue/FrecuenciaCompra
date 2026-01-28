import React, { useState, useMemo } from 'react';
import { Users, TrendingUp, ShoppingCart, DollarSign, MapPin, User, Mail, Phone, Calendar, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getZonas, getGestoresByZona } from '../config/gestores';
import MonthVisualizer from './MonthVisualizer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const GestoresAnalysis = ({ data }) => {
    const [selectedZona, setSelectedZona] = useState('all');
    const [selectedGestor, setSelectedGestor] = useState('all');

    // Get unique zones
    const zonas = useMemo(() => getZonas(), []);

    // Get gestores filtered by zona
    const availableGestores = useMemo(() => {
        if (selectedZona === 'all') {
            return getGestoresByZona();
        }
        return getGestoresByZona(selectedZona);
    }, [selectedZona]);

    // Filter orders by selected gestor/zona
    const filteredOrders = useMemo(() => {
        // PERF: Don't calculate if nothing selected
        if (selectedZona === 'all' && selectedGestor === 'all') {
            return [];
        }

        return data.filter(order => {
            // Filter by zona first
            if (selectedZona !== 'all' && order.gestorZone !== selectedZona) {
                return false;
            }

            // Filter by gestor
            if (selectedGestor !== 'all' && order.gestorName !== selectedGestor) {
                return false;
            }

            return true;
        });
    }, [data, selectedZona, selectedGestor]);

    // Group by customer
    const customers = useMemo(() => {
        const map = {};
        filteredOrders.forEach(order => {
            const key = order.email || order.phone || order.name;
            if (!key) return;

            if (!map[key]) {
                map[key] = {
                    name: order.name,
                    email: order.email,
                    phone: order.phone,
                    identity: order.identity || 'No se encontró',
                    city: order.city,
                    orders: [],
                    totalInvestment: 0
                };
            }
            map[key].orders.push(order);
            map[key].totalInvestment += (order.totalAmount || 0);

            if (order.identity && order.identity !== 'No se encontró' && (map[key].identity === 'No se encontró')) {
                map[key].identity = order.identity;
            }
        });

        return Object.values(map);
    }, [filteredOrders]);

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalClientes = customers.length;
        const totalPedidos = filteredOrders.length;
        const totalVentas = filteredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
        const promedioCliente = totalClientes > 0 ? totalVentas / totalClientes : 0;

        return {
            totalClientes,
            totalPedidos,
            totalVentas,
            promedioCliente
        };
    }, [customers, filteredOrders]);

    // Calculate date range for month visualizer
    const dateRange = useMemo(() => {
        let minTime = Infinity;
        let maxTime = -Infinity;

        customers.forEach(c => {
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
    }, [customers]);

    // Analyze full history to detect shared customers
    // This runs on ALL data, not just filtered orders
    const customerGestorHistory = useMemo(() => {
        // PERF: Don't calculate if nothing selected (metrics/table won't be shown anyway)
        if (selectedZona === 'all' && selectedGestor === 'all') {
            return {};
        }

        const history = {};

        data.forEach(order => {
            const key = order.email || order.phone || order.name;
            if (!key) return;

            if (!history[key]) {
                history[key] = {
                    gestores: {}, // { "Karen Lino": 5, "Other": 2 }
                    totalGestores: 0
                };
            }

            const gName = order.gestorName || 'Sin Asignar';
            if (!history[key].gestores[gName]) {
                history[key].gestores[gName] = 0;
                history[key].totalGestores++; // Increment unique gestor count
            }
            history[key].gestores[gName]++;

            // Track if user was manually entered or has a generic/shared email if needed
            // But for now, strictly based on gestorName
        });

        return history;
    }, [data]);


    const handleMonthClick = (customer) => (monthKey, monthData) => {
        // Can implement modal here later if needed
        console.log('Month clicked:', monthKey, monthData);
    };

    return (
        <div className="space-y-8">
            {/* Selectors */}
            <div className="flex flex-col md:flex-row gap-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-white/30 dark:border-slate-700/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.2)]">
                {/* Zona Selector */}
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <MapPin size={14} />
                        Zona
                    </label>
                    <div className="relative">
                        <select
                            value={selectedZona}
                            onChange={(e) => {
                                setSelectedZona(e.target.value);
                                setSelectedGestor('all'); // Reset gestor when zona changes
                            }}
                            className="w-full appearance-none px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-semibold outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                            <option value="all">📍 Todas las Zonas</option>
                            {zonas.map(zona => (
                                <option key={zona} value={zona}>📍 {zona}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                    </div>
                </div>

                {/* Gestor Selector */}
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Users size={14} />
                        Gestor
                    </label>
                    <div className="relative">
                        <select
                            value={selectedGestor}
                            onChange={(e) => setSelectedGestor(e.target.value)}
                            className="w-full appearance-none px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-semibold outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                            <option value="all">👤 Todos los Gestores</option>
                            {availableGestores.map(gestor => (
                                <option key={gestor.email} value={gestor.nombre}>
                                    👤 {gestor.nombre} ({gestor.zona})
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                    </div>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Clientes */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/50 dark:to-indigo-900/30 backdrop-blur-xl p-6 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center shadow-lg">
                            <Users size={24} className="text-white" />
                        </div>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                        {metrics.totalClientes.toLocaleString('es-HN')}
                    </div>
                    <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                        Clientes Únicos
                    </div>
                </motion.div>

                {/* Total Pedidos */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/30 backdrop-blur-xl p-6 rounded-2xl border border-emerald-200/50 dark:border-emerald-800/50 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center shadow-lg">
                            <ShoppingCart size={24} className="text-white" />
                        </div>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                        {metrics.totalPedidos.toLocaleString('es-HN')}
                    </div>
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        Pedidos Procesados
                    </div>
                </motion.div>

                {/* Total Ventas */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/50 dark:to-violet-900/30 backdrop-blur-xl p-6 rounded-2xl border border-violet-200/50 dark:border-violet-800/50 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-violet-500 dark:bg-violet-600 flex items-center justify-center shadow-lg">
                            <DollarSign size={24} className="text-white" />
                        </div>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                        L. {metrics.totalVentas.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                        Ventas Totales
                    </div>
                </motion.div>

                {/* Promedio por Cliente */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/50 dark:to-amber-900/30 backdrop-blur-xl p-6 rounded-2xl border border-amber-200/50 dark:border-amber-800/50 shadow-lg"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-amber-500 dark:bg-amber-600 flex items-center justify-center shadow-lg">
                            <TrendingUp size={24} className="text-white" />
                        </div>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                        L. {metrics.promedioCliente.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Promedio por Cliente
                    </div>
                </motion.div>
            </div>

            {/* Customers Table */}
            {customers.length > 0 ? (
                <div className="bg-white/20 dark:bg-slate-900/20 backdrop-blur-3xl rounded-[2rem] shadow-[0_20px_60px_0_rgba(31,38,135,0.25)] dark:shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] border border-white/30 dark:border-slate-700/40 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                    <th className="px-8 py-6 w-[22rem]">Cliente</th>
                                    <th className="px-6 py-6 w-56">Identidad</th>
                                    <th className="px-6 py-6 w-48 text-right">Total</th>
                                    <th className="px-6 py-6 min-w-[300px]">
                                        <div className="flex items-center gap-2">
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
                                {customers.map((customer, idx) => {
                                    // Check if shared
                                    const allHistory = customerGestorHistory[customer.email || customer.phone || customer.name] || { gestores: {}, totalGestores: 0 };
                                    const isShared = allHistory.totalGestores > 1;
                                    const otherGestoresInfo = Object.entries(allHistory.gestores)
                                        .filter(([name]) => name !== selectedGestor) // Hide current if specific selected
                                        .map(([name, count]) => `${name}: ${count} pedidos`)
                                        .join('\n');

                                    return (
                                        <tr
                                            key={`${customer.name}-${idx}`}
                                            className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group"
                                        >
                                            <td className="px-8 py-6 align-top">
                                                <div className="flex gap-4">
                                                    <div className="relative">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-sm shrink-0 shadow-inner">
                                                            {(customer.name || 'N/A').substring(0, 2).toUpperCase()}
                                                        </div>

                                                        {/* Shared Indicator with Tooltip */}
                                                        {isShared && (
                                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-full border border-white dark:border-slate-900 flex items-center justify-center shadow-sm cursor-help group/tooltip z-10">
                                                                <Users size={12} strokeWidth={2.5} />

                                                                {/* Custom Tooltip */}
                                                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-max max-w-[200px] bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs p-2 rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity shadow-xl z-50">
                                                                    <div className="font-bold mb-1 border-b border-white/20 dark:border-slate-300/20 pb-1 flex items-center gap-1.5">
                                                                        <Users size={12} />
                                                                        Cliente Compartido
                                                                    </div>
                                                                    <div className="whitespace-pre-line leading-relaxed">
                                                                        {selectedGestor !== 'all' ? (
                                                                            <>
                                                                                <span className="opacity-70">Otros gestores:</span>
                                                                                {'\n' + otherGestoresInfo}
                                                                            </>
                                                                        ) : (
                                                                            Object.entries(allHistory.gestores).map(([name, count]) => `• ${name}: ${count}`).join('\n')
                                                                        )}
                                                                    </div>
                                                                    {/* Arrow */}
                                                                    <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-slate-900 dark:bg-white rotate-45"></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1 truncate flex items-center gap-2">
                                                            {customer.name}
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            {customer.email && (
                                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                                    <Mail size={12} />
                                                                    {customer.email}
                                                                </div>
                                                            )}
                                                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                                                                {customer.phone && (
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                                        <Phone size={12} />
                                                                        {customer.phone}
                                                                    </div>
                                                                )}

                                                                {customer.city && (
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                                                                        <MapPin size={12} />
                                                                        {customer.city}
                                                                    </div>
                                                                )}
                                                            </div>
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
                                                        {selectedGestor !== 'all' && isShared && (
                                                            <span className="opacity-70 font-normal"> (de {allHistory.totalGestores} gestores)</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-6 align-top text-right">
                                                <div className="font-bold text-slate-900 dark:text-slate-100 text-lg tracking-tight">
                                                    L. {customer.totalInvestment.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </td>

                                            <td className="px-6 py-6 align-top">
                                                <MonthVisualizer
                                                    orders={customer.orders}
                                                    dateRange={dateRange}
                                                    onMonthClick={handleMonthClick(customer)}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-12 rounded-2xl border border-white/30 dark:border-slate-700/50 text-center">
                    <Users size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                    <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                        No hay clientes para mostrar
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        {selectedGestor !== 'all'
                            ? `No se encontraron clientes atendidos por ${selectedGestor}`
                            : selectedZona !== 'all'
                                ? `No se encontraron clientes en la zona ${selectedZona}`
                                : 'Selecciona una zona o gestor para ver los clientes'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default GestoresAnalysis;
