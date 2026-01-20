import React, { useMemo, useState, useEffect } from 'react';
import { X, TrendingUp, ShoppingBag, DollarSign, Calendar, Package, Layers, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ContributionGraph from './ContributionGraph';
import { format, getMonth, getYear } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

const ContributionModal = ({ isOpen, onClose, customerName, orders, searchQuery = '' }) => {
    // Tab state: 'all' or 'sku'
    const [activeTab, setActiveTab] = useState('all');

    // Filter orders based on search query (SKU filter)
    const skuFilteredOrders = useMemo(() => {
        if (!searchQuery || searchQuery.trim().length < 3) {
            return orders;
        }

        const query = searchQuery.toLowerCase().trim();

        return orders.filter(order => {
            // Check if any item in the order matches the search query
            return order.items?.some(item => {
                const sku = (item.sku || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                return sku.includes(query) || description.includes(query);
            });
        });
    }, [orders, searchQuery]);

    // Get product name from filtered orders for display
    const productName = useMemo(() => {
        if (!searchQuery || skuFilteredOrders.length === 0) return searchQuery;

        // Find the first matching product description
        for (const order of skuFilteredOrders) {
            const matchingItem = order.items?.find(item => {
                const sku = (item.sku || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const query = searchQuery.toLowerCase().trim();
                return sku.includes(query) || description.includes(query);
            });
            if (matchingItem?.description) {
                return matchingItem.description;
            }
        }
        return searchQuery;
    }, [searchQuery, skuFilteredOrders]);

    // Set initial tab based on search query when modal opens
    useEffect(() => {
        if (isOpen) {
            // If there's an active search with results, show the filtered tab
            if (searchQuery && searchQuery.trim().length >= 3 && skuFilteredOrders.length > 0) {
                setActiveTab('sku');
            } else {
                setActiveTab('all');
            }
        }
    }, [isOpen, searchQuery, skuFilteredOrders.length]);

    // Get the orders to display based on active tab
    const displayOrders = activeTab === 'all' ? orders : skuFilteredOrders;

    // Calculate stats
    const stats = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        const currentYearOrders = displayOrders.filter(o => new Date(o.orderDate).getFullYear() === currentYear);
        const lastYearOrders = displayOrders.filter(o => new Date(o.orderDate).getFullYear() === lastYear);

        const totalOrders = displayOrders.length;
        const totalAmount = displayOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
        const avgOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;

        const currentYearTotal = currentYearOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
        const lastYearTotal = lastYearOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);

        // Calculate first and last purchase dates
        const dates = displayOrders.map(o => new Date(o.orderDate)).sort((a, b) => a - b);
        const firstPurchase = dates[0];
        const lastPurchase = dates[dates.length - 1];

        return {
            totalOrders,
            totalAmount,
            avgOrderValue,
            currentYearOrders: currentYearOrders.length,
            lastYearOrders: lastYearOrders.length,
            currentYearTotal,
            lastYearTotal,
            firstPurchase,
            lastPurchase
        };
    }, [displayOrders]);

    // Export to Excel function
    const exportToExcel = () => {
        const rows = [];
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        displayOrders.forEach(order => {
            const orderDate = new Date(order.orderDate);
            const year = getYear(orderDate);
            const month = monthNames[getMonth(orderDate)];

            // Get phone from order data
            const phone = order.phone || order.celular || '';

            // Process each item in the order
            const items = order.items || [];

            // Filter out delivery service items
            const filteredItems = items.filter(item => item.sku !== '20000025');

            if (filteredItems.length === 0) {
                // If no items after filtering, create a row with order totals
                rows.push({
                    'Nombre': customerName,
                    'Teléfono': phone,
                    'Número de Pedido': order.orderId || order.rawId || '',
                    'Año': year,
                    'Mes': month,
                    'SKU': '',
                    'Descripción': 'Sin productos',
                    'Total': parseFloat(order.totalAmount || 0).toFixed(2)
                });
            } else {
                // Create a row for each item
                filteredItems.forEach(item => {
                    rows.push({
                        'Nombre': customerName,
                        'Teléfono': phone,
                        'Número de Pedido': order.orderId || order.rawId || '',
                        'Año': year,
                        'Mes': month,
                        'SKU': item.sku || '',
                        'Descripción': item.description || item.sku || '',
                        'Total': parseFloat(item.total || item.lineTotal || 0).toFixed(2)
                    });
                });
            }
        });

        // Create worksheet and workbook
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial de Compras');

        // Generate filename with customer name and current date
        const fileName = `Historial_${customerName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

        // Download file
        XLSX.writeFile(workbook, fileName);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-6xl w-full max-h-[90vh] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                                    Historial de Compras
                                </h2>
                                <p className="text-slate-600 dark:text-slate-400 font-medium">
                                    {customerName}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={exportToExcel}
                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-semibold transition-all shadow-md hover:shadow-lg"
                                    title="Descargar Excel"
                                >
                                    <Download size={18} />
                                    <span className="hidden sm:inline">Descargar Excel</span>
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-all shadow-sm"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        {searchQuery && searchQuery.trim().length >= 3 && skuFilteredOrders.length > 0 && (
                            <div className="px-6 pt-4 border-b border-slate-200 dark:border-slate-700">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setActiveTab('all')}
                                        className={`
                                            flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-semibold text-sm transition-all border-b-2
                                            ${activeTab === 'all'
                                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-indigo-500 -mb-[2px]'
                                                : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }
                                        `}
                                    >
                                        <Layers size={16} />
                                        <span>Todas las compras</span>
                                        <span className={`
                                            text-xs px-2 py-0.5 rounded-full font-bold
                                            ${activeTab === 'all'
                                                ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                            }
                                        `}>
                                            {orders.length}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('sku')}
                                        className={`
                                            flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-semibold text-sm transition-all border-b-2
                                            ${activeTab === 'sku'
                                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-indigo-500 -mb-[2px]'
                                                : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }
                                        `}
                                    >
                                        <Package size={16} />
                                        <span>Solo "{productName}"</span>
                                        <span className={`
                                            text-xs px-2 py-0.5 rounded-full font-bold
                                            ${activeTab === 'sku'
                                                ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                            }
                                        `}>
                                            {skuFilteredOrders.length}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                {/* Total Orders */}
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                                        <ShoppingBag size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Total Pedidos</span>
                                    </div>
                                    <div className="text-3xl font-bold text-blue-900 dark:text-blue-300">
                                        {stats.totalOrders}
                                    </div>
                                </div>

                                {/* Total Amount */}
                                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                                        <DollarSign size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Total Invertido</span>
                                    </div>
                                    <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">
                                        L. {stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>

                                {/* Average Order Value */}
                                <div className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/30 dark:to-violet-900/20 p-4 rounded-xl border border-violet-200 dark:border-violet-800">
                                    <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-2">
                                        <TrendingUp size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Promedio</span>
                                    </div>
                                    <div className="text-2xl font-bold text-violet-900 dark:text-violet-300">
                                        L. {stats.avgOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>

                                {/* Customer Since */}
                                <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
                                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                                        <Calendar size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Cliente Desde</span>
                                    </div>
                                    <div className="text-lg font-bold text-amber-900 dark:text-amber-300">
                                        {stats.firstPurchase ? format(stats.firstPurchase, 'MMM yyyy', { locale: es }) : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Contribution Graphs */}
                            <div className="space-y-8">
                                {/* Combined Years Graph */}
                                <div className="bg-slate-50 dark:bg-slate-800/30 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                            Actividad de Compras
                                        </h3>
                                        <div className="flex items-center gap-4 text-sm">
                                            <span className="text-slate-600 dark:text-slate-400">
                                                <span className="font-bold text-slate-900 dark:text-white">{stats.totalOrders}</span> compra{stats.totalOrders !== 1 ? 's' : ''}
                                            </span>
                                            <span className="text-slate-600 dark:text-slate-400">
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">L. {stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Graph auto-calculates range from first to last purchase */}
                                    <ContributionGraph orders={displayOrders} />
                                </div>

                                {/* Timeline info */}
                                <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                                    <p>
                                        Última compra: <span className="font-bold text-slate-700 dark:text-slate-300">
                                            {stats.lastPurchase ? format(stats.lastPurchase, "dd 'de' MMMM, yyyy", { locale: es }) : 'N/A'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ContributionModal;
