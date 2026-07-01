import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { performRFMAnalysis, getSegmentInfo } from '../utils/rfmAnalysis';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid } from 'recharts';
import { Users, TrendingUp, Target, DollarSign, Download, Filter, X, Maximize2, Info, FileSpreadsheet, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { crossCustomersWithSimla } from '../utils/simlaExportUtils';

const getSegmentLabel = (segment) => getSegmentInfo(segment).name;

const RFMAnalysis = ({ customers, allCustomers = [], searchQuery = '' }) => {
    const [selectedSegments, setSelectedSegments] = useState([]);
    const [fullscreenChart, setFullscreenChart] = useState(null); // 'pie' or 'scatter'
    const [showExceptChampionsOptions, setShowExceptChampionsOptions] = useState(false);
    const [simlaProcessing, setSimlaProcessing] = useState(false);
    const [simlaResult, setSimlaResult] = useState(null);
    const [simlaError, setSimlaError] = useState('');
    const simlaFileInputRef = useRef(null);
    const [showCustomDbModal, setShowCustomDbModal] = useState(false);
    const [customDbSelectedSegments, setCustomDbSelectedSegments] = useState([]);
    const [customDbFilters, setCustomDbFilters] = useState({
        filterBySegments: false,
        onlyRecurring: false,
        excludeChampions: false,
        recencyMin: '',
        recencyMax: '',
        frequencyMin: '',
        frequencyMax: '',
        monetaryMin: '',
        monetaryMax: ''
    });

    // States for downloading customers by previous months/dates
    const [showMonthsModal, setShowMonthsModal] = useState(false);
    const [monthsFilterType, setMonthsFilterType] = useState('months'); // 'months' or 'range'
    const [monthsCount, setMonthsCount] = useState(2);
    const [monthsStartDate, setMonthsStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 2);
        return d.toISOString().split('T')[0];
    });
    const [monthsEndDate, setMonthsEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    // SKU filtering states
    const [skuFilterType, setSkuFilterType] = useState('any'); // 'any' | 'current' | 'single' | 'list'
    const [skuSingle, setSkuSingle] = useState('');
    const [skuListText, setSkuListText] = useState('');

    // Lock body scroll when any modal is open
    useEffect(() => {
        const isModalOpen = showMonthsModal || showCustomDbModal || !!fullscreenChart;
        if (isModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showMonthsModal, showCustomDbModal, fullscreenChart]);

    // Automatically select the appropriate default SKU filter type when the months/dates modal opens
    useEffect(() => {
        if (showMonthsModal) {
            if (searchQuery && searchQuery.trim() !== '') {
                setSkuFilterType('current');
            } else {
                setSkuFilterType('any');
            }
        }
    }, [showMonthsModal, searchQuery]);

    // Perform RFM Analysis
    const rfmData = useMemo(() => {
        if (!customers || customers.length === 0) return null;
        return performRFMAnalysis(customers, new Date(), searchQuery);
    }, [customers, searchQuery]);

    // Perform overall RFM Analysis for the unfiltered cohort (for database downloads by period/SKU)
    const allRfmData = useMemo(() => {
        if (!showMonthsModal || !allCustomers || allCustomers.length === 0) return null;
        return performRFMAnalysis(allCustomers, new Date(), '');
    }, [allCustomers, showMonthsModal]);

    // Computed range dates when months count filter is active
    const computedMonthsRange = useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - Number(monthsCount));
        return {
            start: format(start, 'dd/MM/yyyy', { locale: es }),
            end: format(end, 'dd/MM/yyyy', { locale: es })
        };
    }, [monthsCount]);

    // Filter customers uniquely by date range and SKU (any purchase within range matching targets, unique customer)
    const filteredCustomersByDate = useMemo(() => {
        if (!showMonthsModal) return [];
        const baseCustomers = ((allRfmData && allRfmData.customers)
            ? allRfmData.customers
            : (rfmData && rfmData.customers)
                ? rfmData.customers
                : []).filter(customer => !customer.isContactSuppressed);
        if (baseCustomers.length === 0) return [];

        let start, end;
        if (monthsFilterType === 'months') {
            end = new Date();
            start = new Date();
            start.setMonth(start.getMonth() - Number(monthsCount));
        } else {
            start = monthsStartDate ? new Date(monthsStartDate) : new Date(0);
            end = monthsEndDate ? new Date(monthsEndDate) : new Date();
            end.setHours(23, 59, 59, 999);
        }

        // Parse target SKUs
        let targets = [];
        if (skuFilterType === 'current' && searchQuery.trim()) {
            targets = searchQuery
                .split(/[\n,;\t]+/)
                .map(s => s.trim().toUpperCase())
                .filter(Boolean);
        } else if (skuFilterType === 'single' && skuSingle.trim()) {
            targets = [skuSingle.trim().toUpperCase()];
        } else if (skuFilterType === 'list' && skuListText.trim()) {
            targets = skuListText
                .split(/[\n,;\t]+/)
                .map(s => s.trim().toUpperCase())
                .filter(Boolean);
        }

        return baseCustomers.filter(customer => {
            if (!customer.orders) return false;
            const suppressedSkus = (customer.contactSuppressedSkus || []).map(sku => String(sku).toUpperCase());
            if (targets.some(target => suppressedSkus.includes(target))) return false;
            return customer.orders.some(order => {
                const orderDate = new Date(order.orderDate);
                if (isNaN(orderDate.getTime())) return false;
                if (orderDate < start || orderDate > end) return false;

                // SKU Filter
                if (skuFilterType !== 'any' && targets.length > 0) {
                    const items = order.items || [];
                    return items.some(item => {
                        const itemSku = (item.sku || '').trim().toUpperCase();
                        const itemDesc = (item.description || '').trim().toUpperCase();
                        return targets.some(t => itemSku === t || itemSku.includes(t) || itemDesc.includes(t));
                    });
                }
                return true;
            });
        });
    }, [showMonthsModal, allRfmData, rfmData, monthsFilterType, monthsCount, monthsStartDate, monthsEndDate, skuFilterType, skuSingle, skuListText, searchQuery]);

    // Filter customers by selected segments
    const filteredCustomers = useMemo(() => {
        if (!rfmData) return [];
        if (selectedSegments.length === 0) return rfmData.customers;
        return (rfmData?.customers || []).filter(c => selectedSegments.includes(c.rfm.segment));
    }, [rfmData, selectedSegments]);

    const toggleSegment = (segment) => {
        if (selectedSegments.includes(segment)) {
            setSelectedSegments(selectedSegments.filter(s => s !== segment));
        } else {
            setSelectedSegments([...selectedSegments, segment]);
        }
    };

    const filterCustomersForExport = (customersToExport) => {
        const searchTerms = searchQuery.split(/[\n,;\t]+/).map(term => term.trim().toUpperCase()).filter(Boolean);
        return customersToExport.filter(c => {
            if (c.isContactSuppressed) return false;
            const suppressedSkus = (c.contactSuppressedSkus || []).map(sku => String(sku).toUpperCase());
            return !searchTerms.some(term => suppressedSkus.includes(term));
        });
    };

    const exportCustomersToExcel = (customersToExport, sheetName, fileName) => {
        const exportData = filterCustomersForExport(customersToExport).map(c => ({
            'Nombre': c.name,
            'Email': c.email || '',
            'Telefono': c.phone || '',
            'Ciudad': c.city || '',
            'Identidad': c.identity || '',
            'Recencia (dias)': c.rfm.recency,
            'Frecuencia (pedidos)': c.rfm.frequency,
            'Monetario (L.)': c.rfm.monetary,
            'Score R': c.rfm.recencyScore,
            'Score F': c.rfm.frequencyScore,
            'Score M': c.rfm.monetaryScore,
            'Score Total': c.rfm.totalScore,
            'Segmento': getSegmentLabel(c.rfm.segment)
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
    };

    const handleExportSegment = (segment) => {
        const segmentCustomers = rfmData.stats[segment].customers;
        const segmentLabel = getSegmentLabel(segment);
        exportCustomersToExcel(
            segmentCustomers,
            segmentLabel,
            `RFM_${segmentLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
        );
    };

    const getCustomersExceptChampions = () => {
        const customersExceptChampions = [];
        Object.entries(rfmData?.stats || {}).forEach(([segment, segmentData]) => {
            if (segment !== 'Champions') customersExceptChampions.push(...segmentData.customers);
        });
        return customersExceptChampions;
    };

    const downloadExceptChampions = () => {
        exportCustomersToExcel(
            getCustomersExceptChampions(),
            'Sin Campeones',
            `RFM_Sin_Campeones_${new Date().toISOString().split('T')[0]}.xlsx`
        );
        setShowExceptChampionsOptions(false);
    };

    const handleSimlaFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setSimlaProcessing(true);
        setSimlaError('');
        setSimlaResult(null);

        try {
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const simlaRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            if (simlaRows.length === 0) throw new Error('El archivo de Clientes de SIMLA está vacío.');

            const result = crossCustomersWithSimla(
                filterCustomersForExport(getCustomersExceptChampions()),
                simlaRows,
                getSegmentLabel
            );

            const outputSheet = XLSX.utils.json_to_sheet(result.rows);
            outputSheet['!cols'] = [
                { wch: 28 }, { wch: 22 }, { wch: 16 },
                { wch: 38 }, { wch: 22 }, { wch: 30 }
            ];
            const outputWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(outputWorkbook, outputSheet, 'Clientes para SIMLA');
            XLSX.writeFile(
                outputWorkbook,
                `RFM_Sin_Campeones_SIMLA_${new Date().toISOString().split('T')[0]}.xlsx`
            );
            setSimlaResult(result.summary);
        } catch (error) {
            console.error('Error crossing RFM with SIMLA:', error);
            setSimlaError(error.message || 'No se pudo procesar el archivo de SIMLA.');
        } finally {
            setSimlaProcessing(false);
        }
    };

    const handleExportByDateRange = () => {
        let start, end;
        if (monthsFilterType === 'months') {
            end = new Date();
            start = new Date();
            start.setMonth(start.getMonth() - Number(monthsCount));
        } else {
            start = monthsStartDate ? new Date(monthsStartDate) : new Date(0);
            end = monthsEndDate ? new Date(monthsEndDate) : new Date();
            end.setHours(23, 59, 59, 999);
        }

        // Parse target SKUs
        let targets = [];
        if (skuFilterType === 'current' && searchQuery.trim()) {
            targets = searchQuery
                .split(/[\n,;\t]+/)
                .map(s => s.trim().toUpperCase())
                .filter(Boolean);
        } else if (skuFilterType === 'single' && skuSingle.trim()) {
            targets = [skuSingle.trim().toUpperCase()];
        } else if (skuFilterType === 'list' && skuListText.trim()) {
            targets = skuListText
                .split(/[\n,;\t]+/)
                .map(s => s.trim().toUpperCase())
                .filter(Boolean);
        }

        const exportData = filteredCustomersByDate.map(c => {
            // All orders within range
            const rangeOrders = c.orders.filter(order => {
                const orderDate = new Date(order.orderDate);
                return !isNaN(orderDate.getTime()) && orderDate >= start && orderDate <= end;
            });

            // Filtered orders in range that contain matching SKU
            const skuMatchedOrders = rangeOrders.filter(order => {
                if (skuFilterType === 'any' || targets.length === 0) return true;
                const items = order.items || [];
                return items.some(item => {
                    const itemSku = (item.sku || '').trim().toUpperCase();
                    const itemDesc = (item.description || '').trim().toUpperCase();
                    return targets.some(t => itemSku === t || itemSku.includes(t) || itemDesc.includes(t));
                });
            });

            // Calculate total spent in range (all purchases)
            const rangeTotalSpent = rangeOrders.reduce((sum, order) => {
                return sum + (parseFloat(order.totalAmount) || 0);
            }, 0);

            // Calculate spent specifically on the matched SKUs in the range
            let skuSpecificSpent = 0;
            const matchedProductNames = new Set();
            const matchedSkusList = new Set();

            rangeOrders.forEach(order => {
                const items = order.items || [];
                items.forEach(item => {
                    const itemSku = (item.sku || '').trim().toUpperCase();
                    const itemDesc = (item.description || '').trim().toUpperCase();
                    
                    const isMatch = skuFilterType === 'any' || targets.length === 0 || targets.some(t => itemSku === t || itemSku.includes(t) || itemDesc.includes(t));
                    
                    if (isMatch) {
                        const qty = parseFloat(item.quantity) || 1;
                        const price = parseFloat(item.price) || 0;
                        skuSpecificSpent += qty * price;
                        
                        if (item.description) matchedProductNames.add(item.description);
                        if (item.sku) matchedSkusList.add(item.sku);
                    }
                });
            });

            const rangeOrderDates = rangeOrders.map(o => new Date(o.orderDate)).filter(d => !isNaN(d));
            const latestRangeDate = rangeOrderDates.length > 0
                ? new Date(Math.max(...rangeOrderDates))
                : null;

            const skuMatchedOrderDates = skuMatchedOrders.map(o => new Date(o.orderDate)).filter(d => !isNaN(d));
            const latestSkuMatchedDate = skuMatchedOrderDates.length > 0
                ? new Date(Math.max(...skuMatchedOrderDates))
                : null;

            const row = {
                'Nombre': c.name,
                'Email': c.email || 'No disponible',
                'Telefono': c.phone || 'No disponible',
                'Ciudad': c.city || 'No disponible',
                'Identidad': c.identity || 'No disponible',
            };

            if (skuFilterType !== 'any' && targets.length > 0) {
                row['Pedidos del SKU en Rango'] = skuMatchedOrders.length;
                row['Gasto Estimado SKU en Rango (L.)'] = parseFloat(skuSpecificSpent.toFixed(2));
                row['Última Compra SKU en Rango'] = latestSkuMatchedDate ? format(latestSkuMatchedDate, 'dd/MM/yyyy', { locale: es }) : 'N/A';
                row['SKUs Comprados Coincidentes'] = [...matchedSkusList].join(', ') || 'N/A';
                row['Productos Coincidentes'] = [...matchedProductNames].join(', ') || 'N/A';
            }

            row['Pedidos Totales en Rango'] = rangeOrders.length;
            row['Gasto Total en Rango (L.)'] = parseFloat(rangeTotalSpent.toFixed(2));
            row['Última Compra en Rango'] = latestRangeDate ? format(latestRangeDate, 'dd/MM/yyyy', { locale: es }) : 'N/A';
            row['Recencia Total (dias)'] = c.rfm.recency;
            row['Frecuencia Total (pedidos)'] = c.rfm.frequency;
            row['Monetario Total (L.)'] = c.rfm.monetary;
            row['Segmento RFM General'] = getSegmentLabel(c.rfm.segment);

            return row;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        const rangeStr = monthsFilterType === 'months' 
            ? `Ultimos_${monthsCount}_Meses` 
            : `Rango_${monthsStartDate}_a_${monthsEndDate}`;
        
        let skuStr = '';
        if (skuFilterType === 'current' && searchQuery.trim()) {
            skuStr = `_SKU_${searchQuery.trim().replace(/\s+/g, '_')}`;
        } else if (skuFilterType === 'single' && skuSingle.trim()) {
            skuStr = `_SKU_${skuSingle.trim().replace(/\s+/g, '_')}`;
        } else if (skuFilterType === 'list') {
            skuStr = `_Lista_SKUs`;
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Clientes por Fecha');
        XLSX.writeFile(wb, `Clientes_Unicos_${rangeStr}${skuStr}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Prepare data for charts
    const pieData = useMemo(() => Object.entries(rfmData?.stats || {})
        .map(([segment, data]) => ({
            name: data.info.name,
            originalSegment: segment,
            value: data.count,
            percentage: data.percentage,
            info: data.info
        }))
        .sort((a, b) => a.info.priority - b.info.priority), [rfmData]);

    const scatterData = useMemo(() => filteredCustomers.map(c => {
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
            lastPurchaseDate,
            monetaryScore: c.rfm.monetaryScore,
            info: getSegmentInfo(c.rfm.segment)
        };
    }), [filteredCustomers]);

    const scatterBySegment = useMemo(() => scatterData.reduce((groups, point) => {
        if (!groups[point.segment]) groups[point.segment] = [];
        groups[point.segment].push(point);
        return groups;
    }, {}), [scatterData]);

    const availableSegments = useMemo(() => Object.entries(rfmData?.stats || {})
        .sort(([, a], [, b]) => a.info.priority - b.info.priority)
        .map(([segment]) => segment), [rfmData]);

    const matchesRange = (value, min, max) => {
        if (min !== '' && value < Number(min)) return false;
        if (max !== '' && value > Number(max)) return false;
        return true;
    };

    const customDbValidation = useMemo(() => {
        const errors = [];
        const minMaxPairs = [
            ['Recencia', customDbFilters.recencyMin, customDbFilters.recencyMax],
            ['Frecuencia', customDbFilters.frequencyMin, customDbFilters.frequencyMax],
            ['Monetario', customDbFilters.monetaryMin, customDbFilters.monetaryMax]
        ];

        minMaxPairs.forEach(([label, min, max]) => {
            if (min !== '' && Number(min) < 0) {
                errors.push(`${label}: el minimo no puede ser negativo`);
            }
            if (max !== '' && Number(max) < 0) {
                errors.push(`${label}: el maximo no puede ser negativo`);
            }
            if (min !== '' && max !== '' && Number(min) > Number(max)) {
                errors.push(`${label}: el minimo no puede ser mayor al maximo`);
            }
        });

        if (customDbFilters.filterBySegments && customDbSelectedSegments.length === 0) {
            errors.push('Selecciona al menos un segmento o desactiva el filtro por segmentos');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }, [customDbFilters, customDbSelectedSegments]);

    const customDbCustomers = useMemo(() => {
        return (rfmData?.customers || []).filter((customer) => {
            if (customer.isContactSuppressed) return false;
            const { rfm } = customer;

            if (customDbFilters.onlyRecurring && rfm.frequency < 2) return false;
            if (customDbFilters.excludeChampions && rfm.segment === 'Champions') return false;
            if (customDbFilters.filterBySegments && !customDbSelectedSegments.includes(rfm.segment)) return false;

            if (!matchesRange(rfm.recency, customDbFilters.recencyMin, customDbFilters.recencyMax)) return false;
            if (!matchesRange(rfm.frequency, customDbFilters.frequencyMin, customDbFilters.frequencyMax)) return false;
            if (!matchesRange(rfm.monetary, customDbFilters.monetaryMin, customDbFilters.monetaryMax)) return false;

            return true;
        });
    }, [rfmData, customDbFilters, customDbSelectedSegments]);
    const openCustomDbModal = () => {
        if (customDbSelectedSegments.length === 0) {
            setCustomDbSelectedSegments(availableSegments);
        }
        setShowCustomDbModal(true);
    };

    const resetCustomDbFilters = () => {
        setCustomDbFilters({
            filterBySegments: false,
            onlyRecurring: false,
            excludeChampions: false,
            recencyMin: '',
            recencyMax: '',
            frequencyMin: '',
            frequencyMax: '',
            monetaryMin: '',
            monetaryMax: ''
        });
        setCustomDbSelectedSegments(availableSegments);
    };

    const toggleCustomDbSegment = (segment) => {
        if (customDbSelectedSegments.includes(segment)) {
            setCustomDbSelectedSegments(customDbSelectedSegments.filter(s => s !== segment));
            return;
        }
        setCustomDbSelectedSegments([...customDbSelectedSegments, segment]);
    };

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

    if (!rfmData || rfmData.totalCustomers === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">No hay datos suficientes para analisis RFM</p>
            </div>
        );
    }

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
                                const data = scatterBySegment[segment] || [];
                                return (
                                    <Scatter
                                        key={segment}
                                        name={segment}
                                        data={data}
                                        isAnimationActive={false}
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
                    {Object.entries(rfmData?.stats || {})
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

            {/* Export Options */}
            <div className="flex flex-col sm:flex-row justify-end gap-4 mt-2">
                <button
                    onClick={openCustomDbModal}
                    className="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
                >
                    <Filter size={14} />
                    Crear tu propia BD
                </button>
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowExceptChampionsOptions(prev => !prev);
                            setSimlaError('');
                        }}
                        className="flex items-center gap-1 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400"
                        aria-expanded={showExceptChampionsOptions}
                    >
                        <Download size={14} />
                        Descargar BD (Excepto Campeones)
                    </button>

                    {showExceptChampionsOptions && (
                        <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <button
                                onClick={downloadExceptChampions}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                <Download size={16} className="shrink-0 text-slate-400" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Descargar Excel</span>
                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">Sin cruzar con SIMLA</span>
                                </span>
                            </button>
                            <button
                                onClick={() => simlaFileInputRef.current?.click()}
                                disabled={simlaProcessing}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-slate-800"
                            >
                                {simlaProcessing
                                    ? <Upload size={16} className="shrink-0 animate-pulse text-slate-500" />
                                    : <FileSpreadsheet size={16} className="shrink-0 text-slate-500" />}
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Cruzar con SIMLA</span>
                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">Elegir archivo de clientes</span>
                                </span>
                            </button>
                            <input
                                ref={simlaFileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleSimlaFile}
                                className="hidden"
                                aria-label="Seleccionar archivo Clientes de SIMLA"
                            />

                            {simlaResult && (
                                <div className="flex gap-2 border-t border-slate-100 px-3 py-2.5 text-[11px] leading-4 text-emerald-700 dark:border-slate-800 dark:text-emerald-300">
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                                    <p>{simlaResult.matched} encontrados · {simlaResult.unmatched} sin coincidencia</p>
                                </div>
                            )}

                            {simlaError && (
                                <div className="flex gap-2 border-t border-slate-100 px-3 py-2.5 text-[11px] leading-4 text-rose-700 dark:border-slate-800 dark:text-rose-300">
                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                    <p>{simlaError}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setShowMonthsModal(true)}
                    className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                    <Download size={14} />
                    Descargar BD por Meses/Fechas
                </button>
            </div>

            {/* Custom DB Modal */}
            {showCustomDbModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-8 overflow-y-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-md"
                        onClick={() => setShowCustomDbModal(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative overflow-hidden bg-gradient-to-br from-white/95 to-slate-100/90 dark:from-slate-900/95 dark:to-slate-950/90 rounded-3xl p-6 md:p-8 max-w-4xl w-full my-8 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.75)] border border-white/30 dark:border-slate-700/60 z-10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.22),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.16),transparent_40%)]" />
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                                <h3 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                                    Crear tu propia BD
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2">
                                    Sin crear segmentos nuevos. Solo filtra por variables RFM y exporta.
                                    <span
                                        className="inline-flex items-center text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                                        title="En esta vista solo cuentan Recencia, Frecuencia y Monetario. Los scores R/F/M/Total no se usan en el filtro."
                                    >
                                        <Info size={14} />
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => setShowCustomDbModal(false)}
                                className="p-2 rounded-full bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-all border border-slate-200/60 dark:border-slate-700/70"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 relative">
                            <label className="text-sm">
                                <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Filtrar por segmentos</span>
                                <select
                                    value={customDbFilters.filterBySegments ? 'yes' : 'no'}
                                    onChange={(e) => setCustomDbFilters(prev => ({ ...prev, filterBySegments: e.target.value === 'yes' }))}
                                    className="w-full rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                                >
                                    <option value="no">No</option>
                                    <option value="yes">Si</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Solo recurrentes (2+ pedidos)</span>
                                <select
                                    value={customDbFilters.onlyRecurring ? 'yes' : 'no'}
                                    onChange={(e) => setCustomDbFilters(prev => ({ ...prev, onlyRecurring: e.target.value === 'yes' }))}
                                    className="w-full rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                                >
                                    <option value="no">No</option>
                                    <option value="yes">Si</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Excluir campeones</span>
                                <select
                                    value={customDbFilters.excludeChampions ? 'yes' : 'no'}
                                    onChange={(e) => setCustomDbFilters(prev => ({ ...prev, excludeChampions: e.target.value === 'yes' }))}
                                    className="w-full rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                                >
                                    <option value="no">No</option>
                                    <option value="yes">Si</option>
                                </select>
                            </label>
                        </div>

                        {customDbFilters.filterBySegments && (
                            <div className="mb-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/40 dark:bg-slate-900/30 p-4">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Segmentos a incluir</p>
                                <div className="flex flex-wrap gap-2">
                                    {availableSegments.map((segment) => {
                                        const info = getSegmentInfo(segment);
                                        const isActive = customDbSelectedSegments.includes(segment);
                                        return (
                                            <button
                                                key={segment}
                                                onClick={() => toggleCustomDbSegment(segment)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive
                                                    ? 'text-white shadow-lg'
                                                    : 'text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/70 border-slate-300/80 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                                                    }`}
                                                style={isActive ? { backgroundColor: info.color, borderColor: info.color } : undefined}
                                            >
                                                {info.icon} {info.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            {[
                                {
                                    label: 'Recencia (dias)',
                                    minKey: 'recencyMin',
                                    maxKey: 'recencyMax',
                                    help: 'Dias desde la ultima compra. Menor recencia = cliente mas reciente.'
                                },
                                {
                                    label: 'Frecuencia (pedidos)',
                                    minKey: 'frequencyMin',
                                    maxKey: 'frequencyMax',
                                    help: 'Cantidad total de pedidos del cliente. Mayor frecuencia = compra mas seguido.'
                                },
                                {
                                    label: 'Monetario (L.)',
                                    minKey: 'monetaryMin',
                                    maxKey: 'monetaryMax',
                                    help: 'Monto total comprado en lempiras. Te ayuda a filtrar por valor economico.'
                                }
                            ].map(({ label, minKey, maxKey, help }) => (
                                <div key={label} className="bg-white/45 dark:bg-slate-800/35 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                                        <span>{label}</span>
                                        <span
                                            className="inline-flex text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                                            title={help}
                                        >
                                            <Info size={13} />
                                        </span>
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Min"
                                            value={customDbFilters[minKey]}
                                            onChange={(e) => setCustomDbFilters(prev => ({ ...prev, [minKey]: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white/85 dark:bg-slate-900/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Max"
                                            value={customDbFilters[maxKey]}
                                            onChange={(e) => setCustomDbFilters(prev => ({ ...prev, [maxKey]: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white/85 dark:bg-slate-900/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {customDbValidation.errors.length > 0 && (
                            <div className="mt-4 bg-rose-50/90 dark:bg-rose-900/25 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
                                {customDbValidation.errors.map((error) => (
                                    <p key={error} className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
                                ))}
                            </div>
                        )}

                        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                Resultado actual: <span className="font-bold text-slate-900 dark:text-white">{customDbCustomers.length}</span> clientes
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={resetCustomDbFilters}
                                    className="px-4 py-2 rounded-xl text-sm font-medium bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm"
                                >
                                    Limpiar
                                </button>
                                <button
                                    onClick={() => {
                                        exportCustomersToExcel(
                                            customDbCustomers,
                                            'Mi BD',
                                            `RFM_Mi_BD_${new Date().toISOString().split('T')[0]}.xlsx`
                                        );
                                    }}
                                    disabled={!customDbValidation.isValid || customDbCustomers.length === 0}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-500 hover:from-indigo-700 hover:via-indigo-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
                                >
                                    <Download size={14} />
                                    Descargar mi BD
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Download By Months/Dates Modal */}
            {showMonthsModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-8 overflow-y-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-md"
                        onClick={() => setShowMonthsModal(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 max-w-xl w-full my-8 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.75)] border border-slate-200 dark:border-slate-800 z-10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Radiant background overlays */}
                        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_40%)]" />
                        
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-6 relative">
                            <div>
                                <h3 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                                        📅
                                    </span>
                                    Descargar Clientes por Período
                                </h3>
                                <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 mt-2">
                                    Exporta un listado de clientes únicos con compras registradas en el período seleccionado.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMonthsModal(false)}
                                className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-750"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex bg-slate-100 dark:bg-slate-800/65 p-1.5 rounded-2xl mb-6 relative">
                            <button
                                onClick={() => setMonthsFilterType('months')}
                                className={`flex-1 py-2 px-3 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                                    monthsFilterType === 'months'
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                🕒 Últimos Meses
                            </button>
                            <button
                                onClick={() => setMonthsFilterType('range')}
                                className={`flex-1 py-2 px-3 text-xs md:text-sm font-semibold rounded-xl transition-all ${
                                    monthsFilterType === 'range'
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                📅 Rango de Fechas
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="space-y-6 relative mb-6">
                            {monthsFilterType === 'months' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs md:text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                                            ¿Cuántos meses anteriores consultar?
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="1"
                                                max="12"
                                                value={monthsCount}
                                                onChange={(e) => setMonthsCount(Number(e.target.value))}
                                                className="flex-1 accent-blue-600 dark:accent-blue-500 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="w-12 text-center font-extrabold text-sm md:text-lg text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl">
                                                {monthsCount}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Presets */}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {[1, 2, 3, 6, 12].map((num) => (
                                            <button
                                                key={num}
                                                onClick={() => setMonthsCount(num)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                                    monthsCount === num
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                                                        : 'text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                }`}
                                            >
                                                {num === 1 ? '1 mes' : `${num} meses`}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Computed Range Display */}
                                    <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/60 dark:border-blue-900/35 rounded-2xl p-4 flex items-start gap-3">
                                        <span className="text-lg">ℹ️</span>
                                        <div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Rango de búsqueda calculado:</p>
                                            <p className="text-xs md:text-sm font-semibold text-blue-700 dark:text-blue-400 mt-0.5">
                                                Desde el {computedMonthsRange.start} hasta el {computedMonthsRange.end}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                                Fecha de Inicio
                                            </label>
                                            <input
                                                type="date"
                                                value={monthsStartDate}
                                                onChange={(e) => setMonthsStartDate(e.target.value)}
                                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                                Fecha de Fin
                                            </label>
                                            <input
                                                type="date"
                                                value={monthsEndDate}
                                                onChange={(e) => setMonthsEndDate(e.target.value)}
                                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    {/* Date range validation warning if start > end */}
                                    {monthsStartDate && monthsEndDate && new Date(monthsStartDate) > new Date(monthsEndDate) && (
                                        <div className="bg-rose-50/90 dark:bg-rose-900/25 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
                                            <p className="text-xs text-rose-700 dark:text-rose-300 font-semibold">
                                                ⚠️ La fecha de inicio no puede ser mayor que la fecha de fin.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SKU Filtering Option Check */}
                        <div className="border-t border-slate-200 dark:border-slate-850 pt-5 space-y-4 relative mb-6">
                            <div>
                                <label className="block text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span>🔍</span> Filtrar por Código de Producto (SKU)
                                </label>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                    Filtra clientes únicos que hayan comprado los productos seleccionados en el período.
                                </p>
                            </div>

                            <div className={`grid ${searchQuery.trim() ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-3`}>
                                {[
                                    ...(searchQuery.trim() ? [{ type: 'current', label: `Este SKU (${searchQuery.trim()})`, icon: '🎯' }] : []),
                                    { type: 'any', label: 'Cualquier SKU', icon: '🛒' },
                                    { type: 'single', label: searchQuery.trim() ? 'Otro SKU' : 'Un SKU', icon: '🏷️' },
                                    { type: 'list', label: 'Lista de SKUs', icon: '📋' }
                                ].map((opt) => (
                                    <button
                                        key={opt.type}
                                        type="button"
                                        onClick={() => setSkuFilterType(opt.type)}
                                        className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                                            skuFilterType === opt.type
                                                ? 'bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-400 font-bold shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        <span className="text-lg">{opt.icon}</span>
                                        <span className="text-[11px] font-semibold tracking-tight line-clamp-2" title={opt.label}>{opt.label}</span>
                                    </button>
                                ))}
                            </div>

                            {skuFilterType === 'single' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-1.5"
                                >
                                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                        Código SKU a buscar:
                                    </label>
                                    <input
                                        type="text"
                                        value={skuSingle}
                                        onChange={(e) => setSkuSingle(e.target.value)}
                                        placeholder="Ej: 742110058319"
                                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                    />
                                </motion.div>
                            )}

                            {skuFilterType === 'list' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-1.5"
                                >
                                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                        Pega la lista de SKUs (separados por coma, espacio o renglón):
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={skuListText}
                                        onChange={(e) => setSkuListText(e.target.value)}
                                        placeholder="Ej:&#10;742110058319&#10;742110058320, 742110058321"
                                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs font-mono placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                    />
                                </motion.div>
                            )}
                        </div>

                        {/* Footer summary & Download */}
                        <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-850 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
                            <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                                    Clientes Coincidentes
                                </p>
                                <p className="text-base md:text-lg font-extrabold text-slate-900 dark:text-white">
                                    {filteredCustomersByDate.length} <span className="text-xs md:text-sm font-normal text-slate-500">únicos</span>
                                </p>
                            </div>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => setShowMonthsModal(false)}
                                    className="px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={() => {
                                        handleExportByDateRange();
                                        setShowMonthsModal(false);
                                    }}
                                    disabled={
                                        filteredCustomersByDate.length === 0 || 
                                        (monthsFilterType === 'range' && (!monthsStartDate || !monthsEndDate || new Date(monthsStartDate) > new Date(monthsEndDate))) ||
                                        (skuFilterType === 'single' && !skuSingle.trim()) ||
                                        (skuFilterType === 'list' && !skuListText.trim())
                                    }
                                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                                >
                                    <Download size={15} />
                                    Descargar Excel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Fullscreen Modal */}
            {
                fullscreenChart && createPortal(
                    <div
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto"
                        onClick={() => setFullscreenChart(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-7xl w-full my-8 shadow-2xl"
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
                                                    const data = scatterBySegment[segment] || [];
                                                    return (
                                                        <Scatter
                                                            key={segment}
                                                            name={segmentInfo.name}
                                                            data={data}
                                                            isAnimationActive={false}
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
                    </div>,
                    document.body
                )
            }
        </div >
    );
};

export default RFMAnalysis;
