import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, X, Send, Trash2, Loader2, Minimize2, ArrowRight, Download, PhoneCall } from 'lucide-react';
import { performRFMAnalysis } from '../utils/rfmAnalysis';
import { exportToExcel } from '../utils/dataProcessing';
import { motion, AnimatePresence } from 'framer-motion';

const AIChatWidget = ({ customers = [], isOpen = false, setIsOpen, onCreateCampaign }) => {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            text: '¡Hola! Soy tu asistente de IA de FrecuenciaCompra. ¿En qué te puedo ayudar hoy? Puedes preguntarme sobre tus segmentos de clientes, buscar teléfonos, o pedirme análisis de ventas.'
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);

    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, loading]);

    // Analyze raw customers and group their orders
    const rawCustomersAnalyzed = useMemo(() => {
        if (!customers || customers.length === 0) return [];

        try {
            // Group orders by customer first
            const map = {};
            customers.forEach(order => {
                const key = order.email || order.phone || order.customerName || order.name;
                if (!key) return;

                if (!map[key]) {
                    map[key] = {
                        name: order.customerName || order.name || 'Sin nombre',
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
            });

            const list = Object.values(map);

            // Run RFM Analysis
            const rfmResult = performRFMAnalysis(list, new Date(), '');
            return rfmResult.customers || [];
        } catch (error) {
            console.error('Error analyzing customer data:', error);
            return [];
        }
    }, [customers]);

    // Group and compact customer data to send as context to Groq (optimized)
    const compactedCustomers = useMemo(() => {
        if (rawCustomersAnalyzed.length === 0) return [];

        try {
            const segmentMap = {
                'Champions': 'Cha',
                'Loyal Customers': 'Loy',
                'Potential Loyalists': 'Pot',
                'New Customers': 'New',
                'Nuevos Compradores Recientes': 'NRec',
                'Nuevos Compradores Inactivos': 'NIna',
                'Compradores Ocasionales': 'Oca',
                "Can't Lose Them": 'Cri',
                'Hibernating': 'Hib',
                'Lost': 'Los'
            };

            const cityMap = {
                'TEGUCIGALPA D.C.': 'Teg',
                'SAN PEDRO SULA': 'SPS'
            };

            return rawCustomersAnalyzed.map(c => {
                // Find top 1 product
                const itemCounts = {};
                c.orders.forEach(order => {
                    (order.items || []).forEach(item => {
                        const desc = item.description || item.sku;
                        if (desc) {
                            itemCounts[desc] = (itemCounts[desc] || 0) + (item.quantity || 1);
                        }
                    });
                });

                const topItem = Object.entries(itemCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 1)
                    .map(entry => entry[0])[0] || null;

                const mappedSegment = segmentMap[c.rfm.segment] || c.rfm.segment;
                const mappedCity = cityMap[c.city] || c.city;

                const record = {
                    n: c.name,
                    p: c.phone || undefined,
                    c: mappedCity,
                    s: mappedSegment,
                    r: c.rfm.recency,
                    f: c.rfm.frequency,
                    m: Math.round(c.rfm.monetary)
                };

                if (topItem) {
                    record.i = topItem;
                }

                return record;
            });
        } catch (error) {
            console.error('Error compacting customer data for AI:', error);
            return [];
        }
    }, [rawCustomersAnalyzed]);


    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || loading) return;

        const userMsgText = inputText.trim();
        if (userMsgText.length > 500) {
            setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ El mensaje es demasiado largo. Máximo 500 caracteres.' }]);
            return;
        }

        setMessages(prev => [...prev, { role: 'user', text: userMsgText }]);
        setInputText('');
        setLoading(true);

        try {
            // API URL: works in both Vite dev (middleware plugin) and Vercel production
            const API_URL = '/api';

            // Build conversation history (last 4 messages, truncated)
            const history = messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-4)
                .map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: (m.text || '').slice(0, 300)
                }));

            // Paso 1: Extracción de Intención
            console.log("🤖 Solicitando extracción de intención para:", userMsgText);
            const intentResponse = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMsgText,
                    getIntent: true,
                    history
                })
            });

            if (!intentResponse.ok) {
                if (intentResponse.status === 429) {
                    throw new Error('⏳ Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.');
                }
                throw new Error(`Error en el servidor al extraer intención: ${intentResponse.statusText}`);
            }

            const intentData = await intentResponse.json();
            if (!intentData.success || !intentData.intent) {
                throw new Error(intentData.error || "No se pudo extraer la intención de la consulta.");
            }

            const intent = intentData.intent;
            console.log("🤖 Intención extraída:", intent);

            // Paso 2: Filtrado y Agregación Local en el Cliente
            let filteredData = null;
            let exportDataList = [];

            if (intent.generalStats) {
                // Targeted aggregations based on statsType
                const totalCount = compactedCustomers.length;
                const totalMonetary = compactedCustomers.reduce((acc, c) => acc + (c.m || 0), 0);

                filteredData = {
                    totalCustomers: totalCount,
                    totalSalesLempiras: totalMonetary
                };

                // Only compute averages if needed
                if (intent.statsType !== 'count') {
                    filteredData.avgRecencyDays = totalCount > 0
                        ? Math.round(compactedCustomers.reduce((acc, c) => acc + (c.r || 0), 0) / totalCount)
                        : 0;
                    filteredData.avgFrequencyOrders = totalCount > 0
                        ? Number((compactedCustomers.reduce((acc, c) => acc + (c.f || 0), 0) / totalCount).toFixed(1))
                        : 0;
                }

                // Only compute segment breakdown if requested
                if (intent.statsType === 'breakdown_segment' || intent.statsType === 'full_summary') {
                    const segmentBreakdown = {};
                    compactedCustomers.forEach(c => {
                        if (!segmentBreakdown[c.s]) {
                            segmentBreakdown[c.s] = { count: 0, sales: 0, totalR: 0, totalF: 0 };
                        }
                        segmentBreakdown[c.s].count += 1;
                        segmentBreakdown[c.s].sales += (c.m || 0);
                        segmentBreakdown[c.s].totalR += (c.r || 0);
                        segmentBreakdown[c.s].totalF += (c.f || 0);
                    });
                    const segments = {};
                    Object.keys(segmentBreakdown).forEach(k => {
                        const s = segmentBreakdown[k];
                        segments[k] = {
                            count: s.count, sales: s.sales,
                            avgR: Math.round(s.totalR / s.count),
                            avgF: Number((s.totalF / s.count).toFixed(1))
                        };
                    });
                    filteredData.segments = segments;
                }

                // Only compute city breakdown if requested
                if (intent.statsType === 'breakdown_city' || intent.statsType === 'full_summary') {
                    const cityBreakdown = {};
                    compactedCustomers.forEach(c => {
                        const cityKey = c.c || 'Desconocido';
                        if (!cityBreakdown[cityKey]) {
                            cityBreakdown[cityKey] = { count: 0, sales: 0 };
                        }
                        cityBreakdown[cityKey].count += 1;
                        cityBreakdown[cityKey].sales += (c.m || 0);
                    });
                    filteredData.cities = cityBreakdown;
                }
            } else {
                // Filtrado por fecha, segmento, ciudad y término de búsqueda usando la base de datos cruda
                let list = [...rawCustomersAnalyzed];

                // 1. Filtrar por rango de fechas
                if (intent.dateFilter && intent.dateFilter.startDate && intent.dateFilter.endDate) {
                    const start = new Date(intent.dateFilter.startDate).getTime();
                    const end = new Date(intent.dateFilter.endDate).getTime();
                    const type = intent.dateFilter.type;

                    list = list.filter(c => {
                        const hasOrderInRange = c.orders.some(order => {
                            const orderDate = new Date(order.orderDate).getTime();
                            return orderDate >= start && orderDate <= end;
                        });

                        if (type === 'no_purchase') {
                            return !hasOrderInRange; // Clientes que NO compraron en el rango
                        } else if (type === 'purchase') {
                            return hasOrderInRange; // Clientes que SÍ compraron en el rango
                        }
                        return true;
                    });
                }

                // 2. Filtrar por segmento
                if (intent.segment) {
                    const segmentMapInv = {
                        'Cha': 'Champions',
                        'Loy': 'Loyal Customers',
                        'Pot': 'Potential Loyalists',
                        'New': 'New Customers',
                        'NRec': 'Nuevos Compradores Recientes',
                        'NIna': 'Nuevos Compradores Inactivos',
                        'Oca': 'Compradores Ocasionales',
                        'Cri': "Can't Lose Them",
                        'Hib': 'Hibernating',
                        'Los': 'Lost'
                    };
                    const targetSegmentFull = segmentMapInv[intent.segment] || intent.segment;
                    list = list.filter(c => c.rfm.segment === targetSegmentFull);
                }

                // 3. Filtrar por ciudad
                if (intent.city) {
                    const cityMapInv = {
                        'Teg': 'TEGUCIGALPA D.C.',
                        'SPS': 'SAN PEDRO SULA'
                    };
                    const targetCityFull = cityMapInv[intent.city] || intent.city;
                    list = list.filter(c => c.city === targetCityFull);
                }

                // 4. Filtrar por término de búsqueda (solo nombre y teléfono)
                if (intent.searchTerm) {
                    const term = intent.searchTerm.toLowerCase().trim();
                    list = list.filter(c => {
                        const nameMatch = c.name && c.name.toLowerCase().includes(term);
                        const phoneMatch = c.phone && c.phone.includes(term);
                        return nameMatch || phoneMatch;
                    });
                }

                // 5. Filtrar por SKU/producto (búsqueda exacta en items)
                if (intent.sku) {
                    const skuTerm = intent.sku.toLowerCase().trim();
                    list = list.filter(c => 
                        c.orders.some(order => 
                            (order.items || []).some(item => 
                                (item.sku && item.sku.toLowerCase() === skuTerm) ||
                                (item.description && item.description.toLowerCase().includes(skuTerm))
                            )
                        )
                    );
                }

                // Guardar la lista filtrada completa para la exportación a Excel
                exportDataList = list;

                // Mapear los clientes resultantes a formato compactado para enviarlos a Groq
                const segmentMap = {
                    'Champions': 'Cha',
                    'Loyal Customers': 'Loy',
                    'Potential Loyalists': 'Pot',
                    'New Customers': 'New',
                    'Nuevos Compradores Recientes': 'NRec',
                    'Nuevos Compradores Inactivos': 'NIna',
                    'Compradores Ocasionales': 'Oca',
                    "Can't Lose Them": 'Cri',
                    'Hibernating': 'Hib',
                    'Lost': 'Los'
                };
                const cityMap = {
                    'TEGUCIGALPA D.C.': 'Teg',
                    'SAN PEDRO SULA': 'SPS'
                };

                let compactedList = list.map(c => {
                    const itemCounts = {};
                    c.orders.forEach(order => {
                        (order.items || []).forEach(item => {
                            const desc = item.description || item.sku;
                            if (desc) {
                                itemCounts[desc] = (itemCounts[desc] || 0) + (item.quantity || 1);
                            }
                        });
                    });

                    const topItem = Object.entries(itemCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 1)
                        .map(entry => entry[0])[0] || null;

                    const record = {
                        n: c.name,
                        p: c.phone || undefined,
                        c: cityMap[c.city] || c.city,
                        s: segmentMap[c.rfm.segment] || c.rfm.segment,
                        r: c.rfm.recency,
                        f: c.rfm.frequency,
                        m: Math.round(c.rfm.monetary)
                    };

                    if (topItem) {
                        record.i = topItem;
                    }

                    return record;
                });

                // Ordenar por gasto y limitar a los mejores 15 para enviárselos a Groq
                const originalLength = compactedList.length;
                compactedList.sort((a, b) => (b.m || 0) - (a.m || 0));

                if (compactedList.length > 15) {
                    compactedList = compactedList.slice(0, 15);
                    filteredData = {
                        truncated: true,
                        totalFilteredCount: originalLength,
                        shownCount: 15,
                        note: `Se encontraron ${originalLength} clientes que cumplen TODOS los criterios de filtrado. Aquí se muestran los 15 con mayor gasto. El botón de Excel descarga los ${originalLength} completos.`,
                        customers: compactedList
                    };
                } else {
                    filteredData = {
                        truncated: false,
                        totalFilteredCount: compactedList.length,
                        customers: compactedList
                    };
                }
            }

            console.log("🤖 Datos filtrados para Groq:", filteredData);

            // Paso 3: Generación de respuesta final en Groq
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMsgText,
                    filteredData: filteredData,
                    intent: intent,
                    history
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('⏳ Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.');
                }
                throw new Error(`Error en el servidor al generar respuesta: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    text: data.reply,
                    exportData: exportDataList.length > 0 ? exportDataList : undefined
                }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: `❌ Error: ${data.error || 'No se pudo obtener respuesta.'}` }]);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, { role: 'assistant', text: `❌ Error: ${error.message || 'No se pudo conectar con el servidor.'}` }]);
        } finally {
            setLoading(false);
        }
    };

    const handleClearChat = () => {
        if (window.confirm('¿Deseas vaciar el historial de conversación?')) {
            setMessages([
                {
                    role: 'assistant',
                    text: 'Historial de chat vaciado. ¿En qué te puedo ayudar ahora?'
                }
            ]);
        }
    };

    // Custom helper to parse Markdown structures (Tables, Lists, Bold, Inline code)
    const parseMarkdown = (text) => {
        if (!text) return '';

        const lines = text.split('\n');
        const elements = [];
        let currentTable = null;
        let currentList = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 1. Table Detection
            if (line.startsWith('|') && line.endsWith('|')) {
                if (line.replace(/[|\s-]/g, '') === '') {
                    continue; // Skip separator line
                }

                const cells = line.split('|')
                    .map(c => c.trim())
                    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

                if (!currentTable) {
                    currentTable = { headers: cells, rows: [] };
                } else {
                    currentTable.rows.push(cells);
                }
                continue;
            } else if (currentTable) {
                elements.push({ type: 'table', data: currentTable });
                currentTable = null;
            }

            // 2. List Detection
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const content = line.substring(2);
                if (!currentList) {
                    currentList = [content];
                } else {
                    currentList.push(content);
                }
                continue;
            } else if (currentList) {
                elements.push({ type: 'list', data: currentList });
                currentList = null;
            }

            // 3. Header Detection
            if (line.startsWith('#')) {
                const level = line.match(/^#+/)[0].length;
                const content = line.replace(/^#+\s*/, '');
                elements.push({ type: `h${Math.min(level, 6)}`, data: content });
                continue;
            }

            // 4. Regular Paragraph
            if (line !== '') {
                elements.push({ type: 'p', data: lines[i] });
            }
        }

        if (currentTable) elements.push({ type: 'table', data: currentTable });
        if (currentList) elements.push({ type: 'list', data: currentList });

        return elements.map((el, idx) => {
            const parseInline = (str) => {
                const parts = [];
                let lastIdx = 0;
                const regex = /(\*\*|`)(.*?)\1/g;
                let match;

                while ((match = regex.exec(str)) !== null) {
                    if (match.index > lastIdx) {
                        parts.push(str.substring(lastIdx, match.index));
                    }

                    const marker = match[1];
                    const content = match[2];

                    if (marker === '**') {
                        parts.push(<strong key={match.index} className="font-extrabold text-slate-900 dark:text-white">{content}</strong>);
                    } else {
                        parts.push(<code key={match.index} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-indigo-600 dark:text-indigo-400 text-xs">{content}</code>);
                    }

                    lastIdx = regex.lastIndex;
                }

                if (lastIdx < str.length) {
                    parts.push(str.substring(lastIdx));
                }

                return parts.length > 0 ? parts : str;
            };

            switch (el.type) {
                case 'table':
                    return (
                        <div key={idx} className="my-3 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-750 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 font-bold">
                                        {el.data.headers.map((h, hIdx) => (
                                            <th key={hIdx} className="px-3 py-2 whitespace-nowrap">{parseInline(h)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {el.data.rows.map((row, rIdx) => (
                                        <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 text-slate-650 dark:text-slate-300">
                                            {row.map((cell, cIdx) => (
                                                <td key={cIdx} className="px-3 py-2 font-medium">{parseInline(cell)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                case 'list':
                    return (
                        <ul key={idx} className="list-disc pl-5 my-2 space-y-1 text-slate-600 dark:text-slate-300 text-xs">
                            {el.data.map((li, liIdx) => (
                                <li key={liIdx} className="leading-relaxed">{parseInline(li)}</li>
                            ))}
                        </ul>
                    );
                case 'h1':
                    return <h1 key={idx} className="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1 border-b border-slate-100 dark:border-slate-800 pb-1">{parseInline(el.data)}</h1>;
                case 'h2':
                    return <h2 key={idx} className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2.5 mb-1">{parseInline(el.data)}</h2>;
                case 'p':
                    return <p key={idx} className="text-xs my-1.5 leading-relaxed text-slate-600 dark:text-slate-300 font-medium">{parseInline(el.data)}</p>;
                default:
                    return <span key={idx} className="text-xs font-medium">{parseInline(el.data)}</span>;
            }
        });
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] font-sans">
            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        layoutId="chatWindow"
                        initial={{ opacity: 0, scale: 0.8, y: 100 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 100 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="w-[420px] h-[550px] bg-white dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgba(99,102,241,0.15),0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.7)] rounded-[2rem] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-slate-800/80 px-6 py-4 flex items-center justify-between border-b border-indigo-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-800 dark:text-white">Asistente Frecuencia</h3>
                                    {/* Model indicator pill */}
                                    <div className="flex gap-1 mt-1 p-0.5 bg-indigo-50 dark:bg-slate-950 rounded-full w-fit">
                                        <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm">
                                            Groq Llama 3.3
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleClearChat}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors cursor-pointer"
                                    title="Limpiar conversación"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                >
                                    <Minimize2 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Message List */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950/20">
                            {messages.map((msg, idx) => {
                                const isUser = msg.role === 'user';
                                return (
                                    <div
                                        key={idx}
                                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${isUser
                                                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-tr-none font-semibold text-xs shadow-indigo-500/10'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                                                }`}
                                        >
                                            {isUser ? msg.text : parseMarkdown(msg.text)}

                                            {/* Excel Export & Campaign Creation Buttons */}
                                            {!isUser && msg.exportData && msg.exportData.length > 0 && (
                                                <div className="mt-2.5 flex flex-col gap-2 w-full">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            try {
                                                                exportToExcel(msg.exportData, '');
                                                            } catch (err) {
                                                                console.error('Error al exportar Excel:', err);
                                                                alert('Error al generar el archivo de Excel.');
                                                            }
                                                        }}
                                                        className="flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold shadow-md hover:shadow-emerald-500/20 transition-all cursor-pointer border-none"
                                                    >
                                                        <Download size={12} className="animate-bounce" />
                                                        Descargar lista en Excel ({msg.exportData.length} clientes)
                                                    </button>
                                                    {onCreateCampaign && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onCreateCampaign(msg.exportData)}
                                                            className="flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold shadow-md hover:shadow-indigo-500/20 transition-all cursor-pointer border-none"
                                                        >
                                                            <PhoneCall size={12} />
                                                            Crear Campaña de Llamadas ({msg.exportData.length} clientes)
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                                        <Loader2 size={14} className="animate-spin text-indigo-500" />
                                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Analizando datos...</span>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900">
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                disabled={loading || compactedCustomers.length === 0}
                                maxLength={500}
                                placeholder={compactedCustomers.length === 0 
                                    ? "Carga clientes en el Dashboard para chatear..." 
                                    : "Pregúntame lo que quieras sobre tus datos..."
                                }
                                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 font-medium disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={loading || !inputText.trim() || compactedCustomers.length === 0}
                                className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                            >
                                <Send size={16} />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AIChatWidget;
