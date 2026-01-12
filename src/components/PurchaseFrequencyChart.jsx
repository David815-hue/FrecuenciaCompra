import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const PurchaseFrequencyChart = ({ orders }) => {
    const chartData = useMemo(() => {
        if (!orders || orders.length === 0) return [];

        const monthlyCounts = {};

        orders.forEach(order => {
            if (!order.orderDate) return;

            // Parse date. Assuming format YYYY-MM-DD HH:mm:ss
            // If date is already a Date object, use it directly.
            // If string, try to parse.
            let dateObj = new Date(order.orderDate);
            if (!isValid(dateObj)) {
                // Fallback for different formats if needed
                return;
            }

            const monthKey = format(dateObj, 'yyyy-MM'); // Sortable key
            const monthLabel = format(dateObj, 'MMM yyyy', { locale: es });

            if (!monthlyCounts[monthKey]) {
                monthlyCounts[monthKey] = {
                    name: monthLabel,
                    count: 0,
                    rawDate: dateObj
                };
            }
            monthlyCounts[monthKey].count += 1;
        });

        // Sort by date
        return Object.values(monthlyCounts).sort((a, b) => a.rawDate - b.rawDate);
    }, [orders]);

    if (chartData.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                <p>No hay datos de fechas válidos para visualizar.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-primary flex items-center justify-center text-sm">📅</span>
                Frecuencia de Compra
            </h3>
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis
                            hide
                        />
                        <Tooltip
                            cursor={{ fill: '#f1f5f9' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 6, 6]} barSize={40}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#4f46e5' : '#cbd5e1'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default PurchaseFrequencyChart;
