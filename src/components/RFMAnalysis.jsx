import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { performRFMAnalysis, getSegmentInfo } from '../utils/rfmAnalysis';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Legend, CartesianGrid } from 'recharts';
import { Users, TrendingUp, Target, DollarSign, Download, Filter, X, Maximize2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const RFMAnalysis = ({ customers, searchQuery = '' }) => {
    const [selectedSegments, setSelectedSegments] = useState([]);
    const [fullscreenChart, setFullscreenChart] = useState(null); // 'pie' or 'scatter'

    // Perform RFM Analysis
    const rfmData = useMemo(() => {
        if (!customers || customers.length === 0) return null;
        return performRFMAnalysis(customers, new Date(), searchQuery);
    }, [customers, searchQuery]);

    // Filter customers by selected segments
    const filteredCustomers = useMemo(() => {
        if (!rfmData) return [];
        if (selectedSegments.length === 0) return rfmData.customers;
        return rfmData.customers.filter(c => selectedSegments.includes(c.rfm.segment));
    }, [rfmData, selectedSegments]);

    const toggleSegment = (segment) => {
        if (selectedSegments.includes(segment)) {
            setSelectedSegments(selectedSegments.filter(s => s !== segment));
        } else {
            setSelectedSegments([...selectedSegments, segment]);
        }
    };

    const handleExportSegment = (segment) => {
        const segmentCustomers = rfmData.stats[segment].customers;
        const exportData = segmentCustomers.map(c => ({
            'Nombre': c.name,
            'Email': c.email || '',
            'Teléfono': c.phone || '',
            'Ciudad': c.city || '',
            'Identidad': c.identity || '',
            'Recencia (días)': c.rfm.recency,
            'Frecuencia (pedidos)': c.rfm.frequency,
            'Monetario (L.)': c.rfm.monetary,
            'Score R': c.rfm.recencyScore,
            'Score F': c.rfm.frequencyScore,
            'Score M': c.rfm.monetaryScore,
            'Score Total': c.rfm.totalScore,
            'Segmento': c.rfm.segment
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, segment);
        XLSX.writeFile(wb, `RFM_${segment}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (!rfmData || rfmData.totalCustomers === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">No hay datos suficientes para análisis RFM</p>
            </div>
        );
    }

    // Prepare data for charts
    const pieData = Object.entries(rfmData.stats)
        .map(([segment, data]) => ({
            name: data.info.name, // Use translated name
            originalSegment: segment, // Keep original for reference
            value: data.count,
            percentage: data.percentage,
            info: data.info
        }))
        .sort((a, b) => a.info.priority - b.info.priority);

    const scatterData = filteredCustomers.map(c => {
        // Find the most recent order date
        const lastPurchaseDate = c.orders.reduce((latest, order) => {
            const orderDate = new Date(order.orderDate);
            return orderDate > latest ? orderDate : latest;
        }, new Date(0));

        return {
            x: c.rfm.recency,
            y: c.rfm.frequency,
            z: c.rfm.monetary,
            segment: c.rfm.segment,
            name: c.name,
            phone: c.phone || 'No disponible',
            lastPurchaseDate: lastPurchaseDate,
            monetaryScore: c.rfm.monetaryScore,
            info: getSegmentInfo(c.rfm.segment)
        };
    });

    // Custom tooltip for pie chart
    const PieTooltip = ({ active, payload }) => {
        if (!active || !payload || !payload[0]) return null;
        const data = payload[0].payload;
        return (
            <div className="bg-slate-900 dark:bg-black/95 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{data.info.icon}</span>
                    <span className="font-bold">{data.name}</span>
                </div>
                <div className="text-sm space-y-1">
                    <p><span className="text-slate-400">Clientes:</span> <span className="font-bold text-white">{data.value}</span></p>
                    <p><span className="text-slate-400">Porcentaje:</span> <span className="font-bold text-white">{data.percentage}%</span></p>
                </div>
            </div>
        );
    };

    // Custom tooltip for scatter
    const ScatterTooltip = ({ active, payload }) => {
        if (!active || !payload || !payload[0]) return null;
        const data = payload[0].payload;
        return (
            <div className="bg-slate-900 dark:bg-black/95 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{data.info.icon}</span>
                    <span className="font-bold text-sm">{data.name}</span>
                </div>
                <div className="text-xs space-y-1">
                    <p><span className="text-slate-400">📱 Teléfono:</span> <span className="font-bold text-white font-mono">{data.phone}</span></p>
                    <p><span className="text-slate-400">📅 Última compra:</span> <span className="font-bold text-white">{format(data.lastPurchaseDate, 'dd/MM/yyyy', { locale: es })}</span></p>
                    <p><span className="text-slate-400">Recencia:</span> <span className="font-bold text-white">{data.x} días</span></p>
                    <p><span className="text-slate-400">Frecuencia:</span> <span className="font-bold text-white">{data.y} pedidos</span></p>
                    <p><span className="text-slate-400">Monetario:</span> <span className="font-bold text-white">L. {data.z.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                    <p className="pt-1 border-t border-slate-600"><span className="text-slate-400">Segmento:</span> <span className="font-bold" style={{ color: data.info.color }}>{data.info.name}</span></p>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-700 rounded-2xl p-6 text-white shadow-lg"
                >
                    <div className="flex items-center justify-between mb-2">
                        <Users size={24} className="opacity-80" />
                        <span className="text-3xl font-bold">{rfmData.totalCustomers}</span>
                    </div>
                    <p className="text-sm font-medium opacity-90">Total Clientes</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 rounded-2xl p-6 text-white shadow-lg"
                >
                    <div className="flex items-center justify-between mb-2">
                        <Target size={24} className="opacity-80" />
                        <span className="text-3xl font-bold">{rfmData.totalSegments}</span>
                    </div>
                    <p className="text-sm font-medium opacity-90">Segmentos</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700 rounded-2xl p-6 text-white shadow-lg"
                >
                    <div className="flex items-center justify-between mb-2">
                        <TrendingUp size={24} className="opacity-80" />
                        <span className="text-3xl font-bold">
                            {rfmData.stats['Champions']?.count || 0}
                        </span>
                    </div>
                    <p className="text-sm font-medium opacity-90">Campeones</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-br from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-700 rounded-2xl p-6 text-white shadow-lg"
                >
                    <div className="flex items-center justify-between mb-2">
                        <DollarSign size={24} className="opacity-80" />
                        <span className="text-3xl font-bold">
                            {Object.values(rfmData.stats).reduce((sum, s) => sum + s.totalRevenue, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <p className="text-sm font-medium opacity-90">Ingresos Total (L.)</p>
                </motion.div>
            </div>

            {/* Main Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie Chart - Segment Distribution */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-xl border border-white/60 dark:border-slate-800"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                📊
                            </span>
                            Distribución por Segmento
                        </h3>
                        <button
                            onClick={() => setFullscreenChart('pie')}
                            className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-colors"
                            title="Ver en pantalla completa"
                        >
                            <Maximize2 size={18} />
                        </button>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                innerRadius={60}
                                fill="#8884d8"
                                dataKey="value"
                                paddingAngle={2}
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.info.color} />
                                ))}
                            </Pie>
                            <Tooltip content={<PieTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>

                    {/* Legend */}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        {pieData.slice(0, 6).map((item) => (
                            <div key={item.name} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.info.color }}></div>
                                <span className="text-slate-600 dark:text-slate-400 truncate">
                                    {item.info.icon} {item.name} ({item.value})
                                </span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Scatter Plot - RFM Visualization */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-xl border border-white/60 dark:border-slate-800"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                🎯
                            </span>
                            Matriz RFM (Recencia vs Frecuencia)
                        </h3>
                        <button
                            onClick={() => setFullscreenChart('scatter')}
                            className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-colors"
                            title="Ver en pantalla completa"
                        >
                            <Maximize2 size={18} />
                        </button>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                            <XAxis
                                type="number"
                                dataKey="x"
                                name="Recencia"
                                unit=" días"
                                reversed
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                label={{ value: 'Recencia (días)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="y"
                                name="Frecuencia"
                                unit=" pedidos"
                                allowDecimals={false}
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                label={{ value: 'Frecuencia', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                            />
                            <ZAxis type="number" dataKey="monetaryScore" range={[60, 600]} domain={[1, 5]} />
                            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                            {Object.keys(rfmData.stats).map((segment) => {
                                const segmentInfo = getSegmentInfo(segment);
                                const data = scatterData.filter(d => d.segment === segment);
                                return (
                                    <Scatter
                                        key={segment}
                                        name={segment}
                                        data={data}
                                        fill={segmentInfo.color}
                                        fillOpacity={0.7}
                                        stroke="#fff"
                                        strokeWidth={1}
                                    />
                                );
                            })}
                        </ScatterChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center italic">
                        💡 El tamaño de los círculos representa el valor monetario
                    </p>
                </motion.div>
            </div>

            {/* Segment Cards */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Target size={24} />
                        Segmentos Detallados
                    </h3>
                    {selectedSegments.length > 0 && (
                        <button
                            onClick={() => setSelectedSegments([])}
                            className="flex items-center gap-2 text-sm px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            <X size={14} />
                            Limpiar Filtros
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Object.entries(rfmData.stats)
                        .sort(([, a], [, b]) => a.info.priority - b.info.priority)
                        .map(([segment, data]) => {
                            const isSelected = selectedSegments.includes(segment);
                            return (
                                <motion.div
                                    key={segment}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`
                                        relative rounded-2xl p-5 shadow-lg border-2 transition-all cursor-pointer
                                        ${isSelected
                                            ? 'ring-4 ring-offset-2 dark:ring-offset-slate-900 scale-105 shadow-2xl'
                                            : 'hover:scale-105 hover:shadow-xl'
                                        }
                                    `}
                                    style={{
                                        backgroundColor: data.info.bgColor,
                                        borderColor: data.info.color
                                    }}
                                    onClick={() => toggleSegment(segment)}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <span className="text-3xl">{data.info.icon}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleExportSegment(segment);
                                            }}
                                            className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                                            title="Exportar segmento"
                                        >
                                            <Download size={14} style={{ color: data.info.color }} />
                                        </button>
                                    </div>

                                    <h4 className="font-bold text-lg mb-1" style={{ color: data.info.color }}>
                                        {data.info.name}
                                    </h4>

                                    <div className="space-y-2 mb-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-700">Clientes:</span>
                                            <span className="font-bold" style={{ color: data.info.color }}>
                                                {data.count} ({data.percentage}%)
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-600 dark:text-slate-700">Ingresos:</span>
                                            <span className="font-bold" style={{ color: data.info.color }}>
                                                L. {data.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-xs text-slate-600 dark:text-slate-700 mb-2">
                                        <p className="line-clamp-2">{data.info.description}</p>
                                    </div>

                                    {/* Tooltip on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/0 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none flex items-end p-4">
                                        <div className="bg-slate-900/95 dark:bg-black/95 text-white text-xs p-3 rounded-lg shadow-2xl border border-slate-700 w-full">
                                            <p className="leading-relaxed">{data.info.tooltip}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                </div>
            </motion.div>

            {/* Fullscreen Modal */}
            {fullscreenChart && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFullscreenChart(null)}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-7xl w-full max-h-[90vh] overflow-auto shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <span className="text-3xl">
                                    {fullscreenChart === 'pie' ? '📊' : '🎯'}
                                </span>
                                {fullscreenChart === 'pie' ? 'Distribución por Segmento' : 'Matriz RFM (Recencia vs Frecuencia)'}
                            </h2>
                            <button
                                onClick={() => setFullscreenChart(null)}
                                className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Chart Container */}
                        <div className="w-full" style={{ height: '70vh' }}>
                            {fullscreenChart === 'pie' ? (
                                <>
                                    <ResponsiveContainer width="100%" height="85%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={200}
                                                innerRadius={120}
                                                fill="#8884d8"
                                                dataKey="value"
                                                paddingAngle={2}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.info.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<PieTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>

                                    {/* Full Legend */}
                                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mt-6">
                                        {pieData.map((item) => (
                                            <div key={item.name} className="flex items-center gap-2 text-sm">
                                                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: item.info.color }}></div>
                                                <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                                                    {item.info.icon} {item.name} ({item.value})
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 20, right: 40, bottom: 40, left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                                            <XAxis
                                                type="number"
                                                dataKey="x"
                                                name="Recencia"
                                                unit=" días"
                                                reversed
                                                tick={{ fill: '#64748b', fontSize: 14 }}
                                                label={{ value: 'Recencia (días)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 14 }}
                                            />
                                            <YAxis
                                                type="number"
                                                dataKey="y"
                                                name="Frecuencia"
                                                unit=" pedidos"
                                                allowDecimals={false}
                                                tick={{ fill: '#64748b', fontSize: 14 }}
                                                label={{ value: 'Frecuencia (pedidos)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 14 }}
                                            />
                                            <ZAxis type="number" dataKey="monetaryScore" range={[100, 1000]} domain={[1, 5]} />
                                            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                            {Object.keys(rfmData.stats).map((segment) => {
                                                const segmentInfo = getSegmentInfo(segment);
                                                const data = scatterData.filter(d => d.segment === segment);
                                                return (
                                                    <Scatter
                                                        key={segment}
                                                        name={segmentInfo.name}
                                                        data={data}
                                                        fill={segmentInfo.color}
                                                        fillOpacity={0.7}
                                                        stroke="#fff"
                                                        strokeWidth={2}
                                                    />
                                                );
                                            })}
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 text-center italic">
                                        💡 El tamaño de los círculos representa el valor monetario del cliente
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default RFMAnalysis;
