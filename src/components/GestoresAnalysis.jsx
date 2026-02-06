import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Users, TrendingUp, DollarSign, ShoppingBag, ShoppingCart, User, Filter, Search, X, Activity, Phone, Mail, MapPin, Calendar, ChevronDown, ArrowUpDown, Lock, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx'; // Import XLSX for export
import { getZonas, getGestoresByZona } from '../config/gestores';
import MonthVisualizer from './MonthVisualizer';
import ContributionGraph from './ContributionGraph';

const GestoresAnalysis = ({ data, isRestricted = false, restrictedUser = null }) => {
    const [selectedMonthData, setSelectedMonthData] = useState(null);

    // Initialize with restricted user filter if applicable
    const [selectedZone, setSelectedZone] = useState('all');
    const [selectedGestor, setSelectedGestor] = useState(isRestricted && restrictedUser ? restrictedUser : 'all');

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [expandedZones, setExpandedZones] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const filterButtonRef = useRef(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Sort state - default to frequency (number of orders)
    const [sortBy, setSortBy] = useState('frequency'); // 'total' or 'frequency'
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'

    // Force strict filtering for restricted users
    useEffect(() => {
        if (isRestricted && restrictedUser) {
            // Find the zone for this gestor
            const allZones = getZonas(); // Assuming this returns objects or strings
            // We need to scan data or config to find the zone. 
            // Using data is safer as config might be outdated, but let's try to infer from data first.
            const userOrder = data.find(o => o.gestorName === restrictedUser);
            if (userOrder && userOrder.gestorZone) {
                setSelectedZone(userOrder.gestorZone);
            }
            setSelectedGestor(restrictedUser);
        }
    }, [isRestricted, restrictedUser, data]);

    // PERF: useCallback to prevent function recreation
    const toggleZone = useCallback((zone) => {
        setExpandedZones(prev => ({
            ...prev,
            [zone]: !prev[zone]
        }));
    }, []);

    const handleGestorSelect = useCallback((zone, gestor) => {
        if (isRestricted) return; // Prevent selection if restricted
        setSelectedZone(zone);
        setSelectedGestor(gestor);
        setIsFilterOpen(false);
        setSearchTerm('');
    }, [isRestricted]);

    // Group gestores by zone
    const gestoresByZone = useMemo(() => {
        const grouped = {};

        data.forEach(order => {
            const zone = order.gestorZone || 'Sin Zona';
            const gestor = order.gestorName || 'Sin Asignar';

            // Skip 'Sin Asignar' gestores
            if (gestor === 'Sin Asignar') return;

            if (!grouped[zone]) {
                grouped[zone] = new Set();
            }
            grouped[zone].add(gestor);
        });

        // Convert sets to sorted arrays and filter out empty zones
        const result = {};
        Object.keys(grouped).sort().forEach(zone => {
            const gestores = Array.from(grouped[zone]).sort();
            if (gestores.length > 0) {
                result[zone] = gestores;
            }
        });

        return result;
    }, [data]);

    // Filter zones/gestores based on search
    const filteredZones = useMemo(() => {
        if (!searchTerm) return gestoresByZone;

        const term = searchTerm.toLowerCase();
        const filtered = {};

        Object.entries(gestoresByZone).forEach(([zone, gestores]) => {
            const matchingGestores = gestores.filter(g => g.toLowerCase().includes(term));
            if (matchingGestores.length > 0 || zone.toLowerCase().includes(term)) {
                filtered[zone] = matchingGestores.length > 0 ? matchingGestores : gestores;
            }
        });

        return filtered;
    }, [gestoresByZone, searchTerm]);

    // PERF: Filter data by selected gestor - optimized dependencies
    const filteredCustomers = useMemo(() => {
        // PERF: Early return for 'all' - skip expensive grouping if not needed
        if (selectedGestor === 'all') {
            return [];
        }

        let filtered = data;

        // Filter by gestor
        if (selectedGestor !== 'all') {
            filtered = filtered.filter(order => order.gestorName === selectedGestor);
        }

        // Group by customer
        const map = {};
        filtered.forEach(order => {
            const key = order.email || order.phone || order.name;
            if (!key) return;

            if (!map[key]) {
                map[key] = {
                    name: order.customerName || order.name || 'Sin nombre',
                    email: order.email || '',
                    phone: order.phone || '',
                    identity: order.identity || '',
                    city: order.city || '',
                    orders: [],
                    totalSpent: 0,
                    lastPurchase: null
                };
            }

            map[key].orders.push(order);
            map[key].totalSpent += parseFloat(order.totalAmount) || 0;

            const orderDate = new Date(order.orderDate);
            if (!map[key].lastPurchase || orderDate > new Date(map[key].lastPurchase)) {
                map[key].lastPurchase = order.orderDate;
            }
        });

        // Convert to array and apply sorting
        const customers = Object.values(map);

        // Apply sorting based on sortBy and sortDirection
        if (sortBy === 'total') {
            customers.sort((a, b) => {
                const comparison = b.totalSpent - a.totalSpent;
                return sortDirection === 'desc' ? comparison : -comparison;
            });
        } else if (sortBy === 'frequency') {
            customers.sort((a, b) => {
                const comparison = b.orders.length - a.orders.length;
                return sortDirection === 'desc' ? comparison : -comparison;
            });
        }

        return customers;

    }, [data, selectedGestor, sortBy, sortDirection]); // Added sortBy and sortDirection

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalClientes = filteredCustomers.length;
        const totalPedidos = filteredCustomers.reduce((sum, c) => sum + c.orders.length, 0);
        const totalVentas = filteredCustomers.reduce((sum, c) => sum + c.totalSpent, 0);
        const promedioCliente = totalClientes > 0 ? totalVentas / totalClientes : 0;

        return {
            totalClientes,
            totalPedidos,
            totalVentas,
            promedioCliente
        };
    }, [filteredCustomers]);

    // Calculate date range for month visualizer
    const dateRange = useMemo(() => {
        let minTime = Infinity;
        let maxTime = -Infinity;

        filteredCustomers.forEach(c => {
            c.orders.forEach(o => {
                const d = new Date(o.orderDate);
                if (!isNaN(d)) {
                    const t = d.getTime();
                    if (t < minTime) minTime = t;
                    if (t > maxTime) maxTime = t;
                }
            });
        });

        if (minTime === Infinity) {
            return { min: null, max: null };
        }

        return { min: new Date(minTime), max: new Date(maxTime) };
    }, [filteredCustomers]);

    // Analyze full history to detect shared customers
    // This runs on ALL data, not just filtered orders
    const customerGestorHistory = useMemo(() => {
        const history = {};

        data.forEach(order => {
            const key = order.email || order.phone || order.name || order.customerName;
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
    }, [data]); // PERF FIX: Removed selectedGestor dependency - calculate once for all data


    const [selectedCustomerHistory, setSelectedCustomerHistory] = useState(null);

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentCustomers = filteredCustomers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedGestor]);

    const handleMonthClick = (customer) => (monthKey, monthData) => {
        // monthData contains { count, total, date, items? }
        // We need to fetch the actual orders for this month from the customer's order list
        // filtering by the month key (YYYY-MM)

        const ordersInMonth = customer.orders.filter(o => {
            const d = new Date(o.orderDate);
            if (isNaN(d)) return false;
            return format(d, 'yyyy-MM') === monthKey;
        });

        setSelectedMonthData({
            monthLabel: format(new Date(monthKey + '-01'), 'MMMM yyyy', { locale: es }),
            orders: ordersInMonth,
            total: monthData.total
        });
    };

    // Export Handler
    const handleExport = () => {
        if (!filteredCustomers.length) return;

        // Flatten data for export
        const exportData = filteredCustomers.map(c => ({
            'Cliente': c.name,
            'Identidad': c.identity,
            'Email': c.email,
            'Teléfono': c.phone,
            'Ciudad': c.city,
            'Total Frecuencia': c.orders.length,
            'Total Comprado (L)': c.totalSpent,
            'Última Compra': c.lastPurchase ? format(new Date(c.lastPurchase), 'dd/MM/yyyy') : '-',
            'Total Comprado (L)': c.totalSpent,
            'Última Compra': c.lastPurchase ? format(new Date(c.lastPurchase), 'dd/MM/yyyy') : '-',
            'Productos Comprados': [...new Set(c.orders.flatMap(o => (o.items || []).map(i => i.description || i.sku)))].join(', ')
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte Gestores");

        // Generate filename with timestamp
        const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
        const filename = `Reporte_${selectedGestor === 'all' ? 'General' : selectedGestor}_${timestamp}.xlsx`;

        XLSX.writeFile(wb, filename);
    };

    return (
        <div className="space-y-6">
            {/* Top Filter Bar */}
            <div className="relative z-40 flex flex-wrap items-center gap-4">
                <button
                    onClick={() => !isRestricted && setIsFilterOpen(!isFilterOpen)}
                    disabled={isRestricted}
                    className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${isFilterOpen
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/20 shadow-lg'
                        : isRestricted
                            ? 'bg-slate-100 dark:bg-slate-800/50 border-transparent cursor-not-allowed opacity-80'
                            : 'bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-white/30 dark:border-slate-700/50 hover:bg-white/60 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                        }`}
                >
                    {isRestricted ? <Lock size={18} className="text-amber-500" /> : <Filter size={18} />}
                    <div className="flex flex-col items-start text-xs">
                        <span className="opacity-70 font-medium uppercase tracking-wider">
                            {isRestricted ? 'Vista Restringida' : 'Filtro Activo'}
                        </span>
                        <div className="flex items-center gap-1.5 font-bold text-sm">
                            {selectedGestor !== 'all' ? (
                                <><User size={14} className="text-indigo-400" /> {selectedGestor}</>
                            ) : selectedZone !== 'all' ? (
                                <><MapPin size={14} className="text-indigo-400" /> Zona {selectedZone}</>
                            ) : (
                                <><User size={14} className="text-indigo-400" /> Seleccione gestor</>
                            )}
                        </div>
                    </div>
                    {!isRestricted && <ChevronDown size={14} className={`ml-2 opacity-50 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />}
                </button>

                {/* Export Button */}
                {filteredCustomers.length > 0 && (
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all font-semibold text-sm ml-auto"
                    >
                        <Download size={18} />
                        <span>Exportar Excel</span>
                    </button>
                )}

                {/* Dropdown Menu */}
                <AnimatePresence>
                    {isFilterOpen && (
                        <>
                            {/* Backdrop to close on click outside */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-30"
                                onClick={() => setIsFilterOpen(false)}
                            />

                            {/* Menu */}
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full left-0 mt-2 w-72 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 rounded-2xl shadow-2xl p-4 z-40 max-h-[60vh] overflow-y-auto custom-scrollbar"
                            >
                                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2">
                                    Selecciona Vista
                                </h3>

                                {/* Search Input */}
                                <div className="px-2 mb-3">
                                    <input
                                        type="text"
                                        placeholder="Buscar gestor..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white placeholder-slate-400"
                                    />
                                </div>

                                <div className="space-y-1">
                                    {/* Zone List */}
                                    {Object.entries(filteredZones).map(([zoneName, gestores]) => {
                                        const isZoneActive = selectedZone === zoneName;
                                        const isZoneExpanded = expandedZones[zoneName] ||
                                            (selectedGestor !== 'all' && gestores.includes(selectedGestor));

                                        return (
                                            <div key={zoneName} className="space-y-1">
                                                <button
                                                    onClick={() => toggleZone(zoneName)}
                                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between group ${isZoneActive && selectedGestor === 'all'
                                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-1.5 rounded-lg transition-colors ${isZoneActive ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                            <MapPin size={14} />
                                                        </div>
                                                        {zoneName}
                                                    </div>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isZoneActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {gestores.length}
                                                    </span>
                                                </button>

                                                {/* Nested Gestores */}
                                                {isZoneExpanded && (
                                                    <div className="ml-4 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5 py-1">
                                                        {gestores.map(gestorName => {
                                                            const isGestorActive = selectedGestor === gestorName;
                                                            return (
                                                                <button
                                                                    key={gestorName}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleGestorSelect(zoneName, gestorName);
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${isGestorActive
                                                                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                                        }`}
                                                                >
                                                                    <User size={12} className={isGestorActive ? 'text-indigo-600' : 'text-slate-400'} />
                                                                    {gestorName}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>


            {/* Main Content */}
            <div className="flex-1 space-y-8 min-w-0">

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
                            Clientes Unicos
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
                {filteredCustomers.length > 0 ? (
                    <div className="bg-white/20 dark:bg-slate-900/20 backdrop-blur-3xl rounded-[2rem] shadow-[0_20px_60px_0_rgba(31,38,135,0.25)] dark:shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] border border-white/30 dark:border-slate-700/40 overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                        <th className="px-6 py-6 w-80">Cliente</th>
                                        <th className="px-4 py-6 w-48">Identidad</th>
                                        <th
                                            className="px-6 py-6 w-48 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors select-none"
                                            onClick={() => {
                                                if (sortBy === 'total') {
                                                    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                                                } else {
                                                    setSortBy('total');
                                                    setSortDirection('desc');
                                                }
                                            }}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                <span>Total</span>
                                                <ArrowUpDown size={14} className="opacity-60" />
                                            </div>
                                        </th>
                                        <th
                                            className="px-6 py-6 min-w-[300px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors select-none"
                                            onClick={() => {
                                                if (sortBy === 'frequency') {
                                                    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                                                } else {
                                                    setSortBy('frequency');
                                                    setSortDirection('desc');
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} />
                                                <span>Frecuencia Mensual</span>
                                                <ArrowUpDown size={14} className="opacity-60" />
                                                <span className="ml-auto text-[10px] font-normal px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full normal-case tracking-normal text-slate-500 dark:text-slate-400">
                                                    {dateRange.min.getFullYear()}
                                                </span>
                                            </div>
                                        </th>
                                        <th className="px-6 py-6 w-32">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {currentCustomers.map((customer, idx) => {
                                        // Check if shared
                                        const allHistory = customerGestorHistory[customer.email || customer.phone || customer.name] || { gestores: {}, totalGestores: 0 };
                                        const isShared = allHistory.totalGestores > 1;

                                        // Calculate total orders with other gestores
                                        const otherGestoresOrderCount = Object.entries(allHistory.gestores)
                                            .filter(([name]) => name !== selectedGestor)
                                            .reduce((sum, [, count]) => sum + count, 0);

                                        const otherGestoresInfo = Object.entries(allHistory.gestores)
                                            .filter(([name]) => name !== selectedGestor) // Hide current if specific selected
                                            .map(([name, count]) => `${name}: ${count} pedidos`)
                                            .join('\n');

                                        return (
                                            <tr
                                                key={`${customer.name}-${idx}`}
                                                className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group"
                                            >
                                                <td className="px-6 py-6 align-top">
                                                    <div className="flex gap-3">
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
                                                                                Object.entries(allHistory.gestores).map(([name, count]) => `â€¢ ${name}: ${count}`).join('\n')
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

                                                <td className="px-4 py-6 align-top">
                                                    <div className="flex flex-col items-start gap-2">
                                                        <div className="font-mono text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                                            {customer.identity}
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block w-fit">
                                                                {customer.orders.length} Pedidos ({selectedGestor})
                                                            </span>
                                                            {selectedGestor !== 'all' && isShared && (
                                                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                                    +{otherGestoresOrderCount} otros
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-6 py-6 align-top text-right">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100 text-lg tracking-tight">
                                                        L. {(customer.totalSpent || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </td>

                                                <td className="px-6 py-6 align-top">
                                                    <MonthVisualizer
                                                        orders={customer.orders}
                                                        minDate={dateRange.min}
                                                        maxDate={dateRange.max}
                                                        onClick={handleMonthClick(customer)}
                                                    />
                                                </td>

                                                <td className="px-6 py-6 align-top">
                                                    <button
                                                        onClick={() => setSelectedCustomerHistory({
                                                            customer,
                                                            allHistory,
                                                            fullOrders: data.filter(order =>
                                                                (order.email && order.email === customer.email) ||
                                                                (order.phone && order.phone === customer.phone) ||
                                                                (order.name && order.name === customer.name) ||
                                                                (order.customerName && order.customerName === customer.name)
                                                            )
                                                        })}
                                                        className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center transition-all hover:scale-110 hover:shadow-md mx-auto"
                                                        title="Ver Historial Completo"
                                                    >
                                                        <Activity size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {filteredCustomers.length > itemsPerPage && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                                    ${currentPage === 1
                                            ? 'text-slate-400 cursor-not-allowed'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                        }`}
                                >
                                    ← Anterior
                                </button>

                                <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                    Página <span className="text-slate-900 dark:text-white font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span>
                                </div>

                                <button
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                                    ${currentPage === totalPages
                                            ? 'text-slate-400 cursor-not-allowed'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                        }`}
                                >
                                    Siguiente →
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-12 rounded-2xl border border-white/30 dark:border-slate-700/50 text-center">
                        <Users size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                        <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                            {selectedGestor === 'all' ? 'Selecciona un Gestor' : 'No hay clientes'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400">
                            {selectedGestor === 'all'
                                ? 'Para visualizar los datos, selecciona primero una Zona y luego un Gestor especÃ­fico.'
                                : `El gestor ${selectedGestor} no tiene clientes asignados.`}
                        </p>
                    </div>
                )}

                {/* Month Details Modal */}
                <AnimatePresence>
                    {selectedMonthData && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                            onClick={() => setSelectedMonthData(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-white/20 dark:border-slate-700 flex flex-col"
                            >
                                {/* Header */}
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <Calendar className="text-indigo-500" size={24} />
                                            Detalle de Pedidos
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                            {selectedMonthData.monthLabel}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedMonthData(null)}
                                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400"
                                    >
                                        <ChevronDown size={24} className="rotate-180" /> {/* Using Chevron as close for now or X if imported */}
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="overflow-y-auto p-6 custom-scrollbar">
                                    <div className="space-y-4">
                                        {(selectedMonthData.orders || []).map((order, idx) => (
                                            <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                            #{order.orderId}
                                                            <span className="text-xs font-normal px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full">
                                                                {format(new Date(order.orderDate), 'dd MMM yyyy', { locale: es })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                                        L. {parseFloat(order.totalAmount).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                                    </div>
                                                </div>

                                                {/* Items if available */}
                                                {order.items && order.items.length > 0 ? (
                                                    <div className="mt-3 space-y-1">
                                                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Productos:</div>
                                                        {order.items.map((item, i) => (
                                                            <div key={i} className="flex justify-between text-sm text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700/50 last:border-0 pb-1 last:pb-0">
                                                                <span className="truncate pr-4 flex-1">{item.description}</span>
                                                                <span className="font-mono text-xs opacity-70">x{item.quantity}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-400 italic">No hay detalle de productos disponible</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Footer Summary */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">
                                        Total en este mes:
                                    </span>
                                    <span className="font-bold text-lg text-slate-900 dark:text-white">
                                        L. {selectedMonthData.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Full Purchase History Modal */}
                {/* Full Purchase History Modal */}
                {createPortal(
                    <AnimatePresence>
                        {selectedCustomerHistory && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-8 bg-black/40 backdrop-blur-sm overflow-y-auto"
                                onClick={() => setSelectedCustomerHistory(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.95, opacity: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border border-white/20 dark:border-slate-700 flex flex-col my-8"
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                                                Historial Completo de Compras
                                            </h2>
                                            <p className="text-slate-600 dark:text-slate-400 font-medium">
                                                {selectedCustomerHistory.customer.name}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedCustomerHistory(null)}
                                            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-all shadow-sm"
                                        >
                                            <ChevronDown size={20} className="rotate-180" />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                                                    <ShoppingCart size={18} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Total Pedidos</span>
                                                </div>
                                                <div className="text-3xl font-bold text-blue-900 dark:text-blue-300">
                                                    {selectedCustomerHistory.fullOrders.length}
                                                </div>
                                            </div>
                                            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                                                    <DollarSign size={18} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Total Invertido</span>
                                                </div>
                                                <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">
                                                    L. {selectedCustomerHistory.fullOrders.reduce((s, o) => s + parseFloat(o.totalAmount || 0), 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/30 dark:to-violet-900/20 p-4 rounded-xl border border-violet-200 dark:border-violet-800">
                                                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-2">
                                                    <Users size={18} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Gestores</span>
                                                </div>
                                                <div className="text-3xl font-bold text-violet-900 dark:text-violet-300">
                                                    {selectedCustomerHistory.allHistory.totalGestores}
                                                </div>
                                            </div>
                                            <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
                                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                                                    <User size={18} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Con {selectedGestor}</span>
                                                </div>
                                                <div className="text-3xl font-bold text-amber-900 dark:text-amber-300">
                                                    {selectedCustomerHistory.customer.orders.length}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Contribution Graph */}
                                        <div className="bg-slate-50 dark:bg-slate-800/30 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-8">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Actividad de Compras</h3>
                                            </div>
                                            <ContributionGraph orders={selectedCustomerHistory.fullOrders} />
                                        </div>

                                        {/* Gestor Breakdown */}
                                        <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Desglose por Gestor</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {Object.entries(selectedCustomerHistory.allHistory.gestores).sort((a, b) => b[1] - a[1]).map(([gestor, count]) => {
                                                    const isCurrentGestor = gestor === selectedGestor;
                                                    const total = selectedCustomerHistory.fullOrders.filter(o => o.gestorName === gestor).reduce((s, o) => s + parseFloat(o.totalAmount || 0), 0);
                                                    return (
                                                        <div key={gestor} className={`p-4 rounded-lg border-2 transition-all ${isCurrentGestor ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700'}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <User size={16} className={isCurrentGestor ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'} />
                                                                    <span className={`font-bold ${isCurrentGestor ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-900 dark:text-slate-300'}`}>{gestor}</span>
                                                                    {isCurrentGestor && <span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-semibold">Actual</span>}
                                                                </div>
                                                                <span className={`text-2xl font-bold ${isCurrentGestor ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>{count}</span>
                                                            </div>
                                                            <div className="text-sm text-slate-600 dark:text-slate-400">Total: <span className="font-bold text-emerald-600 dark:text-emerald-400">L. {total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}</span></div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Recent Orders */}
                                        <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Últimos 10 Pedidos</h3>
                                            <div className="space-y-3">
                                                {selectedCustomerHistory.fullOrders
                                                    .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
                                                    .slice(0, 10)
                                                    .map((order, idx) => {
                                                        const orderGestor = order.gestorName || 'Sin Asignar';
                                                        const isCurrentGestor = orderGestor === selectedGestor;

                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`p-4 rounded-lg border transition-all ${isCurrentGestor ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700'}`}
                                                            >
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="font-bold text-slate-900 dark:text-white">
                                                                            #{order.orderId}
                                                                        </span>
                                                                        <span className="text-xs px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full text-slate-600 dark:text-slate-300">
                                                                            {format(new Date(order.orderDate), 'dd MMM yyyy', { locale: es })}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5 text-xs">
                                                                            <User size={12} className="text-slate-400" />
                                                                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                                                {orderGestor}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                        L. {parseFloat(order.totalAmount).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

            </div>
        </div>
    );
};

export default GestoresAnalysis;
