import React, { useState, useMemo } from 'react';
import { Search, Download, Filter, ShoppingBag, ArrowLeft } from 'lucide-react';
import { filterData, exportToExcel } from '../utils/dataProcessing';
import MonthVisualizer from './MonthVisualizer';
import { motion } from 'framer-motion';

const Dashboard = ({ data, onBack }) => {
    const [query, setQuery] = useState('');
    const [onlyRecurring, setOnlyRecurring] = useState(false); // Default to showing all customers

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

            // Update identity if found
            if (order.identity && order.identity !== 'No se encontró' && (map[key].identity === 'No se encontró')) {
                map[key].identity = order.identity;
            }
        });

        const result = Object.values(map);

        // DEBUG: Log first customer to see data structure
        if (result.length > 0) {
            console.log('DEBUG - First customer sample:', result[0]);
        }

        return result;
    }, [filteredData]);

    // 3. Apply Recurring Filter
    const displayList = useMemo(() => {
        // Performance optimization: Only show results if user is searching
        // This prevents rendering 5,800+ customers at once
        if (!query || query.trim().length < 3) {
            return []; // Empty list until user searches
        }

        let list = customers;
        if (onlyRecurring) {
            list = list.filter(c => c.orders.length > 1);
        }
        return list;
    }, [customers, onlyRecurring, query]);

    // 4. Calculate Global Date Range for Alignment
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

        if (minTime === Infinity) return { min: new Date(), max: new Date() }; // Default

        // Add some buffer or snap to month start/end
        const minDate = new Date(minTime);
        minDate.setDate(1); // Start of month

        const maxDate = new Date(maxTime);
        maxDate.setDate(1); // Start of max month (visualizer handles rest)

        return { min: minDate, max: maxDate };
    }, [displayList]);


    const handleExport = () => {
        exportToExcel(displayList, query);
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-8 font-sans">
            {/* Header Area */}
            <div className="max-w-[1600px] mx-auto mb-8 space-y-6">

                {/* Top Bar */}
                <div className="flex justify-between items-center">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors font-medium"
                    >
                        <ArrowLeft size={20} />
                        <span>Cargar otro archivo</span>
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={displayList.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 hover:shadow-emerald-200 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={18} />
                        <span>Exportar Excel</span>
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6 items-end lg:items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reporte de Frecuencia</h1>
                        <p className="text-slate-500 mt-1">
                            {query.length >= 3 ? (
                                <>
                                    {displayList.length} clientes encontrados
                                    {onlyRecurring && <span className="ml-2 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-sm font-medium">Recurrentes (+1 compra)</span>}
                                </>
                            ) : (
                                <span className="text-amber-600 font-medium">
                                    💡 Ingresa al menos 3 caracteres para buscar (SKU, email, teléfono)
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">

                        {/* Recurring Toggle */}
                        <button
                            onClick={() => setOnlyRecurring(!onlyRecurring)}
                            className={`
                                flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all font-medium whitespace-nowrap
                                ${onlyRecurring
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
                            `}
                        >
                            <Filter size={18} />
                            {onlyRecurring ? 'Filtrando: > 1 Compra' : 'Mostrar Todos'}
                        </button>

                        {/* Search Input */}
                        <div className="relative w-full md:w-96 group">
                            <div className="absolute top-3.5 left-4 text-slate-400 group-focus-within:text-primary transition-colors">
                                <Search size={20} />
                            </div>
                            <textarea
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none resize-none h-[50px] focus:h-[100px] text-sm"
                                placeholder="Pegar lista de SKUs, Emails o Teléfonos..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="max-w-[1600px] mx-auto bg-white rounded-3xl shadow-sm border border-slate-200">
                <div className="overflow-x-auto rounded-3xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-sm">
                                <th className="px-6 py-5 w-64">Cliente</th>
                                <th className="px-6 py-5 w-48">Contacto</th>
                                <th className="px-6 py-5 w-32">Identidad</th>
                                <th className="px-6 py-5 w-32 text-right">Total Gastado</th>
                                <th className="px-6 py-5">
                                    Frecuencia Mensual
                                    <span className="ml-2 text-[10px] font-normal text-slate-400 border border-slate-200 px-1 rounded">
                                        {dateRange.min.getFullYear() === dateRange.max.getFullYear()
                                            ? dateRange.min.getFullYear()
                                            : `${dateRange.min.getFullYear()} - ${dateRange.max.getFullYear()}`}
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {displayList.map((customer, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 align-top">
                                        <div className="font-bold text-slate-900">{customer.name}</div>
                                        <div className="text-xs text-slate-500 mt-1 flex gap-2">
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{customer.orders.length} pedidos</span>
                                            {customer.city && <span>{customer.city}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 align-top text-sm">
                                        {customer.phone && (
                                            <div className="font-medium mb-1 font-mono text-slate-600">{customer.phone}</div>
                                        )}
                                        {customer.email && (
                                            <div className="text-xs text-slate-400 truncate max-w-[180px]" title={customer.email}>{customer.email}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 align-top text-sm font-mono text-slate-500">
                                        {customer.identity}
                                    </td>
                                    <td className="px-6 py-4 align-top text-right font-medium text-slate-900 whitespace-nowrap">
                                        L. {customer.orders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <MonthVisualizer orders={customer.orders} minDate={dateRange.min} maxDate={dateRange.max} />
                                    </td>
                                </tr>
                            ))}
                            {displayList.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center">
                                            <Search size={48} className="opacity-20 mb-4" />
                                            {query.length >= 3 ? (
                                                <>
                                                    <p className="font-medium">No se encontraron clientes</p>
                                                    <p className="text-sm opacity-70">Intenta con otro término de búsqueda</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="font-medium text-lg mb-2">Busca por SKU, Email o Teléfono</p>
                                                    <p className="text-sm opacity-70">Ingresa al menos 3 caracteres en el campo de búsqueda arriba</p>
                                                    <p className="text-xs opacity-50 mt-2">💡 Puedes pegar múltiples valores separados por comas</p>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-xs text-slate-400 text-right">
                                    Mostrando {displayList.length} registros
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
