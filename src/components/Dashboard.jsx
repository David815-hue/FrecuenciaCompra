import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Download, Filter, ShoppingBag, ArrowLeft, User, Phone, Mail, Calendar, MapPin, X, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, BarChart3, TrendingUp, Activity, Package, Hash } from 'lucide-react';
import { filterData, exportToExcel } from '../utils/dataProcessing';
import { getSuggestions } from '../utils/searchSuggestions';
import MonthVisualizer from './MonthVisualizer';
import ProductDetailsModal from './ProductDetailsModal';
import ContributionModal from './ContributionModal';
import RFMAnalysis from './RFMAnalysis';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const Dashboard = ({ data, onBack }) => {
    const [query, setQuery] = useState('');
    const [onlyRecurring, setOnlyRecurring] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'rfm'

    // New filter states
    const [selectedCities, setSelectedCities] = useState([]);
    const [minQuantity, setMinQuantity] = useState('');
    const [topSKUsFilter, setTopSKUsFilter] = useState('all'); // 'all', 'top5', 'top10', 'top20'

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const RECORDS_PER_PAGE = 50;

    // Sort state
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Search helper tooltip state
    const [showSearchTooltip, setShowSearchTooltip] = useState(false);

    // Search suggestions state
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState(null);
    const searchRef = useRef(null);

    // Auto-show search tooltip on mount
    useEffect(() => {
        setShowSearchTooltip(true);

        // Auto-hide after 7 seconds
        const timer = setTimeout(() => {
            setShowSearchTooltip(false);
        }, 7000);

        return () => clearTimeout(timer);
    }, []);

    // Generate suggestions when query changes
    useEffect(() => {
        if (query.length >= 2) {
            const results = getSuggestions(data, query);
            setSuggestions(results);
            setShowSuggestions(true);
        } else {
            setSuggestions(null);
            setShowSuggestions(false);
        }
    }, [query, data]);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle suggestion click
    const handleSuggestionClick = (suggestionQuery) => {
        setQuery(suggestionQuery);
        setShowSuggestions(false);
    };

    // Helper to handle sort clicks
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

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
    }, [filteredData]);

    // Calculate Top SKUs from all data
    const topSKUs = useMemo(() => {
        const skuMap = {};

        // Aggregate all SKUs across all orders
        data.forEach(order => {
            order.items?.forEach(item => {
                const sku = item.sku || item.description;
                if (!sku) return;

                if (!skuMap[sku]) {
                    skuMap[sku] = {
                        sku: sku,
                        description: item.description || sku,
                        totalQuantity: 0,
                        totalRevenue: 0
                    };
                }
                skuMap[sku].totalQuantity += item.quantity || 0;
                skuMap[sku].totalRevenue += item.lineTotal || 0;
            });
        });

        // Sort by quantity and return array
        return Object.values(skuMap).sort((a, b) => b.totalQuantity - a.totalQuantity);
    }, [data]);

    // 3. Apply Filters (City, Quantity, Recurring)
    const displayList = useMemo(() => {
        if (!query || query.trim().length < 3) {
            return [];
        }

        let list = customers;

        // Apply City Filter
        if (selectedCities.length > 0) {
            list = list.filter(c => selectedCities.includes(c.city));
        }

        // Apply Quantity Filter (only if min is set)
        if (minQuantity !== '') {
            const min = parseInt(minQuantity);

            list = list.filter(c => {
                // Calculate total quantity across all orders for any matching SKU in their items
                let totalQuantity = 0;
                c.orders.forEach(order => {
                    order.items?.forEach(item => {
                        totalQuantity += item.quantity || 0;
                    });
                });
                return totalQuantity >= min;
            });
        }

        // Apply Recurring Filter
        if (onlyRecurring) {
            list = list.filter(c => c.orders.length > 1);
        }

        // Apply Top SKUs Filter
        if (topSKUsFilter !== 'all') {
            const topCount = parseInt(topSKUsFilter.replace('top', ''));
            const topSKUsList = topSKUs.slice(0, topCount).map(s => s.sku);

            list = list.filter(c => {
                // Check if customer has bought any of the top SKUs
                return c.orders.some(order =>
                    order.items?.some(item => {
                        const sku = item.sku || item.description;
                        return topSKUsList.includes(sku);
                    })
                );
            });
        }

        return list;
    }, [customers, selectedCities, minQuantity, onlyRecurring, topSKUsFilter, topSKUs, query]);

    // 5. Apply Sorting
    const sortedList = useMemo(() => {
        let sortableItems = [...displayList];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle non-string values or special cases if needed
                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [displayList, sortConfig]);

    // 6. Pagination calculations
    const totalPages = Math.ceil(sortedList.length / RECORDS_PER_PAGE);
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    const paginatedList = sortedList.slice(startIndex, endIndex);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [query, selectedCities, minQuantity, onlyRecurring]);

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
            <header className="flex flex-col gap-8 relative z-50">
                {/* Top Navigation Bar */}
                <div className="flex justify-between items-center bg-white/30 dark:bg-slate-900/30 backdrop-blur-2xl px-8 py-4 rounded-3xl border border-white/40 dark:border-slate-700/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300">
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
                    <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-2 rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.2)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] border border-white/30 dark:border-slate-700/50 transition-all duration-300 overflow-visible">
                        {/* Search Input */}
                        <div ref={searchRef} className="relative w-full md:w-96 group">
                            <div
                                className="absolute top-1/2 -translate-y-1/2 left-4 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors cursor-pointer"
                                onClick={() => {
                                    setShowSearchTooltip(true);
                                    setTimeout(() => setShowSearchTooltip(false), 4000);
                                }}
                                title="Ayuda de búsqueda"
                            >
                                <Search size={20} />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border-transparent rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20 focus:border-indigo-200 dark:focus:border-indigo-500/30 transition-all outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                                placeholder="Buscar por SKU, Email, Teléfono..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                            />

                            {/* Search Suggestions Dropdown */}
                            <AnimatePresence>
                                {showSuggestions && suggestions && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute top-full left-0 right-0 mt-2 z-[9999] max-h-[400px] overflow-y-auto custom-scrollbar"
                                    >
                                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40 overflow-hidden">
                                            {/* SKUs Section */}
                                            {suggestions.skus.length > 0 && (
                                                <div className="border-b border-slate-100 dark:border-slate-800">
                                                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
                                                        <Package size={14} className="text-indigo-500" />
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                            SKUs ({suggestions.skus.length})
                                                        </span>
                                                    </div>
                                                    <div className="py-1">
                                                        {suggestions.skus.map((item, idx) => (
                                                            <button
                                                                key={`sku-${idx}`}
                                                                onClick={() => handleSuggestionClick(item.sku)}
                                                                className="w-full px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors flex items-center justify-between gap-3 text-left group"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                                                                        {item.sku}
                                                                    </div>
                                                                    {item.description && (
                                                                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                                            {item.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-full shrink-0">
                                                                    {item.count} {item.count === 1 ? 'pedido' : 'pedidos'}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Customers Section */}
                                            {suggestions.customers.length > 0 && (
                                                <div className="border-b border-slate-100 dark:border-slate-800">
                                                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
                                                        <User size={14} className="text-emerald-500" />
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                            Clientes ({suggestions.customers.length})
                                                        </span>
                                                    </div>
                                                    <div className="py-1">
                                                        {suggestions.customers.map((item, idx) => (
                                                            <button
                                                                key={`customer-${idx}`}
                                                                onClick={() => handleSuggestionClick(item.name)}
                                                                className="w-full px-4 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex flex-col gap-1 text-left"
                                                            >
                                                                <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                                                                    {item.name}
                                                                </div>
                                                                <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                                                                    {item.email && <span className="truncate">{item.email}</span>}
                                                                    {item.phone && <span className="font-mono">{item.phone}</span>}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Identities Section */}
                                            {suggestions.identities.length > 0 && (
                                                <div>
                                                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
                                                        <Hash size={14} className="text-violet-500" />
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                            Identidades ({suggestions.identities.length})
                                                        </span>
                                                    </div>
                                                    <div className="py-1">
                                                        {suggestions.identities.map((item, idx) => (
                                                            <button
                                                                key={`identity-${idx}`}
                                                                onClick={() => handleSuggestionClick(item.identity)}
                                                                className="w-full px-4 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors flex items-center justify-between gap-3 text-left"
                                                            >
                                                                <div className="flex-1">
                                                                    <div className="font-mono font-semibold text-sm text-slate-800 dark:text-slate-200">
                                                                        {item.identity}
                                                                    </div>
                                                                    {item.name && (
                                                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                                            {item.name}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.phone && (
                                                                    <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                                                        {item.phone}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Animated Search Helper Tooltip */}
                            <AnimatePresence>
                                {showSearchTooltip && !showSuggestions && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                        className="absolute top-full left-0 right-0 mt-2 z-[9999]"
                                    >
                                        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/90 dark:to-violet-950/90 backdrop-blur-xl border-2 border-indigo-200/60 dark:border-indigo-500/30 rounded-2xl p-4 shadow-2xl shadow-indigo-500/20 dark:shadow-indigo-900/40">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                                    <span className="text-base">💡</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-2">Puedes buscar por:</h4>
                                                    <div className="space-y-1.5 text-xs text-indigo-700 dark:text-indigo-300">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500"></div>
                                                            <span><strong className="font-semibold">Nombre</strong> del cliente</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500"></div>
                                                            <span><strong className="font-semibold">Identidad</strong> (DNI)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500"></div>
                                                            <span><strong className="font-semibold">Email</strong> o <strong className="font-semibold">Teléfono</strong></span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500"></div>
                                                            <span><strong className="font-semibold">SKU</strong> individual</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 dark:bg-violet-500"></div>
                                                            <span><strong className="font-semibold">Lista de SKUs</strong> separados por <code className="px-1 py-0.5 bg-white/60 dark:bg-slate-900/60 rounded text-[10px] font-mono text-violet-600 dark:text-violet-400">,</code></span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setShowSearchTooltip(false)}
                                                    className="w-6 h-6 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 flex items-center justify-center text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors shrink-0"
                                                    title="Cerrar"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            {/* Arrow pointing up */}
                                            <div className="absolute -top-2 left-8 w-4 h-4 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/90 dark:to-violet-950/90 border-t-2 border-l-2 border-indigo-200/60 dark:border-indigo-500/30 rotate-45"></div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
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

                        {/* Top SKUs Filter - TEMPORARILY HIDDEN */}
                        {/* TODO: Retomar este filtro más adelante */}
                        {/*
                        <select
                            value={topSKUsFilter}
                            onChange={(e) => setTopSKUsFilter(e.target.value)}
                            className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 dark:focus:border-indigo-500 transition-all cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 min-w-[200px]"
                        >
                            <option value="all">🏆 Todos los productos</option>
                            <option value="top5">🏆 Top 5 más vendidos</option>
                            <option value="top10">🏆 Top 10 más vendidos</option>
                            <option value="top20">🏆 Top 20 más vendidos</option>
                        </select>
                        */}

                        {/* View Mode Toggle */}
                        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-semibold text-sm
                                    ${viewMode === 'table'
                                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                                `}
                            >
                                <BarChart3 size={16} />
                                Tabla
                            </button>
                            <button
                                onClick={() => setViewMode('rfm')}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-semibold text-sm
                                    ${viewMode === 'rfm'
                                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                                `}
                            >
                                <TrendingUp size={16} />
                                Análisis RFM
                            </button>
                        </div>
                    </div>
                </div>

                {/* Advanced Filters Section */}
                {query.length >= 3 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-4 flex flex-col md:flex-row gap-4 items-start md:items-center"
                    >
                        {/* City Filter */}
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <MapPin size={12} />
                                Ciudad
                            </label>
                            <div className="flex gap-2">
                                {['TEGUCIGALPA D.C.', 'SAN PEDRO SULA'].map(city => (
                                    <button
                                        key={city}
                                        onClick={() => {
                                            if (selectedCities.includes(city)) {
                                                setSelectedCities(selectedCities.filter(c => c !== city));
                                            } else {
                                                setSelectedCities([...selectedCities, city]);
                                            }
                                        }}
                                        className={`
                                            px-4 py-2 rounded-full text-sm font-semibold transition-all border
                                            ${selectedCities.includes(city)
                                                ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}
                                        `}
                                    >
                                        {city === 'TEGUCIGALPA D.C.' ? 'Tegucigalpa' : 'San Pedro Sula'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Quantity Filter */}
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <ShoppingBag size={12} />
                                Cantidad Mínima
                            </label>
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="Ej: 5"
                                    value={minQuantity}
                                    onChange={(e) => setMinQuantity(e.target.value)}
                                    className="w-20 bg-transparent outline-none text-slate-700 dark:text-slate-200 text-sm font-semibold placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">unidades</span>
                            </div>
                        </div>

                        {/* Clear Filters Button */}
                        {(selectedCities.length > 0 || minQuantity !== '') && (
                            <motion.button
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                onClick={() => {
                                    setSelectedCities([]);
                                    setMinQuantity('');
                                    setTopSKUsFilter('all');
                                }}
                                className="flex items-center gap-1.5 px-4 py-2 mt-6 md:mt-0 md:ml-auto bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-full text-sm font-semibold transition-all border border-rose-200 dark:border-rose-500/30"
                            >
                                <X size={14} />
                                Limpiar Filtros
                            </motion.button>
                        )}
                    </motion.div>
                )}
            </header>

            {/* Conditional Content: Table or RFM */}
            {viewMode === 'table' ? (
                <>
                    {/* Table Area */}
                    <div className="bg-white/20 dark:bg-slate-900/20 backdrop-blur-3xl rounded-[2rem] shadow-[0_20px_60px_0_rgba(31,38,135,0.25)] dark:shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] border border-white/30 dark:border-slate-700/40 overflow-hidden transition-all duration-300 mb-8 hover:shadow-[0_25px_70px_0_rgba(31,38,135,0.35)] dark:hover:shadow-[0_25px_70px_0_rgba(0,0,0,0.7)]">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                        <th
                                            onClick={() => handleSort('name')}
                                            className="px-8 py-6 w-[22rem] cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors select-none"
                                        >
                                            <div className="flex items-center gap-2">
                                                Cliente
                                                {sortConfig.key === 'name' && (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-500" /> : <ArrowDown size={14} className="text-indigo-500" />
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort('identity')}
                                            className="px-6 py-6 w-56 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors select-none"
                                        >
                                            <div className="flex items-center gap-2">
                                                Identidad
                                                {sortConfig.key === 'identity' && (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-500" /> : <ArrowDown size={14} className="text-indigo-500" />
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort('totalInvestment')}
                                            className="px-6 py-6 w-48 text-right cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors select-none"
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Total
                                                {sortConfig.key === 'totalInvestment' && (
                                                    sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-500" /> : <ArrowDown size={14} className="text-indigo-500" />
                                                )}
                                            </div>
                                        </th>
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
                                    {paginatedList.map((customer, idx) => (
                                        <tr
                                            key={`${customer.name}-${idx}`}
                                            className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group relative"
                                        >
                                            <td className="px-8 py-6 align-top">
                                                <div className="flex gap-4">
                                                    {/* Avatar Placeholder */}
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-sm shrink-0 shadow-inner">
                                                        {(customer.name || 'N/A').substring(0, 2).toUpperCase()}
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
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-6 align-top text-right">
                                                <div className="font-bold text-slate-900 dark:text-slate-100 text-lg tracking-tight">
                                                    L. {customer.orders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">Total acumulado</div>
                                            </td>

                                            <td className="px-6 py-6 align-top">
                                                <div className="flex items-center gap-3">
                                                    <MonthVisualizer
                                                        orders={customer.orders}
                                                        minDate={dateRange.min}
                                                        maxDate={dateRange.max}
                                                        onClick={handleMonthClick(customer)}
                                                    />
                                                    <button
                                                        onClick={() => setSelectedCustomer(customer)}
                                                        className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center transition-all hover:scale-110 hover:shadow-md"
                                                        title="Ver historial de compras completo"
                                                    >
                                                        <Activity size={16} />
                                                    </button>
                                                </div>
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

                    {/* Pagination Controls */}
                    {displayList.length > 0 && totalPages > 1 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 mb-8"
                        >
                            {/* Page Info */}
                            <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                                Mostrando <span className="font-bold text-slate-900 dark:text-white">{startIndex + 1}</span> a{' '}
                                <span className="font-bold text-slate-900 dark:text-white">{Math.min(endIndex, displayList.length)}</span> de{' '}
                                <span className="font-bold text-slate-900 dark:text-white">{displayList.length}</span> resultados
                            </div>

                            {/* Pagination Buttons */}
                            <div className="flex items-center gap-2">
                                {/* Previous Button */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                {/* Page Numbers */}
                                <div className="flex gap-1">
                                    {(() => {
                                        const pages = [];
                                        const showPages = 5; // Max page buttons to show
                                        let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
                                        let endPage = Math.min(totalPages, startPage + showPages - 1);

                                        // Adjust start if we're near the end
                                        if (endPage - startPage < showPages - 1) {
                                            startPage = Math.max(1, endPage - showPages + 1);
                                        }

                                        // First page + ellipsis
                                        if (startPage > 1) {
                                            pages.push(
                                                <button
                                                    key={1}
                                                    onClick={() => setCurrentPage(1)}
                                                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                                >
                                                    1
                                                </button>
                                            );
                                            if (startPage > 2) {
                                                pages.push(<span key="ellipsis1" className="px-2 text-slate-400 dark:text-slate-600">...</span>);
                                            }
                                        }

                                        // Page buttons
                                        for (let i = startPage; i <= endPage; i++) {
                                            pages.push(
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${currentPage === i
                                                        ? 'bg-indigo-500 dark:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    {i}
                                                </button>
                                            );
                                        }

                                        // Ellipsis + last page
                                        if (endPage < totalPages) {
                                            if (endPage < totalPages - 1) {
                                                pages.push(<span key="ellipsis2" className="px-2 text-slate-400 dark:text-slate-600">...</span>);
                                            }
                                            pages.push(
                                                <button
                                                    key={totalPages}
                                                    onClick={() => setCurrentPage(totalPages)}
                                                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                                >
                                                    {totalPages}
                                                </button>
                                            );
                                        }

                                        return pages;
                                    })()}
                                </div>

                                {/* Next Button */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Product Details Modal */}
                    <ProductDetailsModal
                        isOpen={selectedMonth !== null}
                        onClose={handleCloseModal}
                        customerName={selectedMonth?.customerName || ''}
                        monthLabel={selectedMonth?.monthLabel || ''}
                        orderCount={selectedMonth?.orderCount || 0}
                        items={selectedMonth?.items || []}
                    />

                    {/* Contribution Graph Modal */}
                    <ContributionModal
                        isOpen={selectedCustomer !== null}
                        onClose={() => setSelectedCustomer(null)}
                        customerName={selectedCustomer?.name || ''}
                        orders={selectedCustomer?.orders || []}
                        searchQuery={query}
                    />
                </>
            ) : (
                /* RFM Analysis View */
                <div className="mb-8">
                    <RFMAnalysis customers={displayList} searchQuery={query} />
                </div>
            )}
        </div>
    );
};

export default Dashboard;
