import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Upload, Filter, Sparkles, Check, ArrowRight, ArrowLeft, 
    Users, Info, Loader2, Search, CheckSquare, Square, AlertCircle, FileSpreadsheet,
    ChevronDown
} from 'lucide-react';
import { parseExcel } from '../utils/dataProcessing';
import { performRFMAnalysis } from '../utils/rfmAnalysis';
import { getAllUsers } from '../utils/authUtils';
import { createCampaign, assignClients } from '../utils/campaignUtils';
import { GESTORES_MAP } from '../config/gestores';

const CampaignWizard = ({ isOpen, onClose, customersData = [], currentUser, onCampaignCreated, initialSelectedClients = null }) => {
    const [step, setStep] = useState(1);
    const [sourceType, setSourceType] = useState('filter'); // 'excel' | 'filter' | 'ai'
    
    // Clients state
    const [selectedClients, setSelectedClients] = useState([]);
    const [excelFileName, setExcelFileName] = useState('');
    const [isParsingExcel, setIsParsingExcel] = useState(false);
    
    // DB Filter state
    const [filterSegment, setFilterSegment] = useState('all');
    const [filterCity, setFilterCity] = useState([]); // Array of selected cities
    const [showCityDropdown, setShowCityDropdown] = useState(false);
    const cityDropdownRef = useRef(null);
    const [filterRecency, setFilterRecency] = useState('all'); // 'all', '30', '60', '90', '180'
    const [filterSku, setFilterSku] = useState(''); // SKU search query
    const [selectedProducts, setSelectedProducts] = useState([]); // Array of { sku, description }
    const [showSkuDropdown, setShowSkuDropdown] = useState(false);
    const skuDropdownRef = useRef(null);
    const [previewCount, setPreviewCount] = useState(0);

    // AI Filter state
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [showAiConfirmation, setShowAiConfirmation] = useState(false);
    const [aiPendingClients, setAiPendingClients] = useState([]);

    // Step 2: Gestoras selection state
    const [allGestoras, setAllGestoras] = useState([]);
    const [loadingGestoras, setLoadingGestoras] = useState(false);
    const [selectedGestoras, setSelectedGestoras] = useState([]);
    const [gestoraSearch, setGestoraSearch] = useState('');

    // Step 3: Confirmation & Meta state
    const [campaignName, setCampaignName] = useState('');
    const [campaignDescription, setCampaignDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Auto-populate when preloaded clients are passed from chatbot
    useEffect(() => {
        if (isOpen) {
            if (initialSelectedClients && initialSelectedClients.length > 0) {
                setSelectedClients(initialSelectedClients);
                setSourceType('ai');
                setStep(2); // Go directly to step 2 (Gestoras selection)
                if (!campaignName) {
                    const dateStr = new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                    setCampaignName(`Campaña Chatbot (${dateStr})`);
                }
            } else {
                setSelectedClients([]);
                setSourceType('filter');
                setStep(1); // Default to step 1
            }
        }
    }, [isOpen, initialSelectedClients]);

    // Analyze raw customer database for filter usage
    const rawCustomersAnalyzed = useMemo(() => {
        if (!customersData || customersData.length === 0) return [];
        try {
            const map = {};
            customersData.forEach(order => {
                const key = order.email || order.phone || order.customerName || order.name;
                if (!key) return;

                if (!map[key]) {
                    map[key] = {
                        name: order.customerName || order.name || 'Sin nombre',
                        email: order.email || '',
                        phone: order.phone || '',
                        identity: order.identity || 'No se encontró',
                        city: order.city || 'Desconocida',
                        orders: [],
                        totalInvestment: 0
                    };
                }
                map[key].orders.push(order);
                map[key].totalInvestment += (order.totalAmount || 0);
            });

            const list = Object.values(map);
            const rfmResult = performRFMAnalysis(list, new Date(), '');
            return rfmResult.customers || [];
        } catch (error) {
            console.error('Error in Wizard RFM analysis:', error);
            return [];
        }
    }, [customersData]);

    // Unique cities for filter list
    const uniqueCities = useMemo(() => {
        const cities = new Set();
        rawCustomersAnalyzed.forEach(c => {
            if (c.city && c.city.trim() !== '') {
                cities.add(c.city.toUpperCase().trim());
            }
        });
        return Array.from(cities).sort();
    }, [rawCustomersAnalyzed]);

    // RFM Segments list
    const segments = [
        { id: 'Champions', label: 'Champions' },
        { id: 'Loyal Customers', label: 'Loyal Customers' },
        { id: 'Potential Loyalists', label: 'Potential Loyalists' },
        { id: 'New Customers', label: 'New Customers' },
        { id: 'Nuevos Compradores Recientes', label: 'Nuevos Compradores Recientes' },
        { id: 'Nuevos Compradores Inactivos', label: 'Nuevos Compradores Inactivos' },
        { id: 'Compradores Ocasionales', label: 'Compradores Ocasionales' },
        { id: "Can't Lose Them", label: 'Críticos (Can\'t Lose Them)' },
        { id: 'Hibernating', label: 'En Hibernación' },
        { id: 'Lost', label: 'Perdidos' }
    ];

    // Load gestoras on Step 2
    useEffect(() => {
        if (step === 2) {
            const fetchGestoras = async () => {
                setLoadingGestoras(true);
                try {
                    const res = await getAllUsers();
                    if (res.success) {
                        // Filter users with role 'gestora'
                        const gestorasList = res.users.filter(u => u.role === 'gestora');
                        setAllGestoras(gestorasList);
                        // Start with no gestoras selected by default
                        setSelectedGestoras([]);
                    } else {
                        console.error('Error fetching users:', res.error);
                    }
                } catch (err) {
                    console.error('Failed to get gestoras:', err);
                } finally {
                    setLoadingGestoras(false);
                }
            };
            fetchGestoras();
        }
    }, [step]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target)) {
                setShowCityDropdown(false);
            }
            if (skuDropdownRef.current && !skuDropdownRef.current.contains(event.target)) {
                setShowSkuDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Toggle city selection
    const toggleCity = (city) => {
        setFilterCity(prev => 
            prev.includes(city) 
                ? prev.filter(c => c !== city) 
                : [...prev, city]
        );
    };

    // Format city name for display (Title Case)
    const formatCityName = (city) => {
        return city.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const cityButtonText = filterCity.length === 0 
        ? "Todas las ciudades" 
        : filterCity.map(formatCityName).join(', ');

    // Extract all unique products from customer database
    const availableProducts = useMemo(() => {
        const productsMap = new Map();
        rawCustomersAnalyzed.forEach(c => {
            if (c.orders && Array.isArray(c.orders)) {
                c.orders.forEach(order => {
                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            if (item.sku) {
                                const sku = String(item.sku).trim();
                                const desc = item.description ? String(item.description).trim() : '';
                                if (sku) {
                                    if (!productsMap.has(sku) || (desc && productsMap.get(sku).description.length < desc.length)) {
                                        productsMap.set(sku, {
                                            sku,
                                            description: desc || `Producto ${sku}`
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
        return Array.from(productsMap.values()).sort((a, b) => a.description.localeCompare(b.description));
    }, [rawCustomersAnalyzed]);

    // Filter product suggestions based on search query
    const filteredProductSuggestions = useMemo(() => {
        if (!filterSku.trim()) return [];
        const query = filterSku.toLowerCase().trim();
        return availableProducts.filter(p => 
            p.sku.toLowerCase().includes(query) || 
            p.description.toLowerCase().includes(query)
        ).slice(0, 15); // Show up to 15 suggestions
    }, [filterSku, availableProducts]);

    // Add manual/custom SKU not found in list
    const handleAddCustomSku = () => {
        if (filterSku.trim() !== '') {
            const skuVal = filterSku.trim();
            if (!selectedProducts.some(p => p.sku.toLowerCase() === skuVal.toLowerCase())) {
                setSelectedProducts(prev => [...prev, { sku: skuVal, description: `SKU: ${skuVal}` }]);
            }
            setFilterSku('');
        }
    };

    // Update preview count for filter mode
    useEffect(() => {
        if (sourceType === 'filter') {
            const filtered = applyFilters();
            setPreviewCount(filtered.length);
        }
    }, [sourceType, filterSegment, filterCity, filterRecency, filterSku, selectedProducts, rawCustomersAnalyzed]);

    // Apply database filters
    const applyFilters = () => {
        let list = [...rawCustomersAnalyzed];

        // 1. Filter by segment
        if (filterSegment !== 'all') {
            list = list.filter(c => c.rfm?.segment === filterSegment);
        }

        // 2. Filter by city (multiselect)
        if (filterCity && filterCity.length > 0) {
            const citySet = new Set(filterCity.map(c => c.toUpperCase().trim()));
            list = list.filter(c => c.city && citySet.has(c.city.toUpperCase().trim()));
        }

        // 3. Filter by recency (days)
        if (filterRecency !== 'all') {
            const daysLimit = parseInt(filterRecency);
            list = list.filter(c => c.rfm?.recency >= daysLimit && c.rfm?.recency !== Infinity);
        }

        // 4. Filter by SKU/Product (multiselect)
        if (selectedProducts && selectedProducts.length > 0) {
            const selectedSkus = new Set(selectedProducts.map(p => p.sku.toLowerCase().trim()));
            list = list.filter(c => 
                c.orders && c.orders.some(order => 
                    (order.items || []).some(item => 
                        item.sku && selectedSkus.has(String(item.sku).toLowerCase().trim())
                    )
                )
            );
        }

        return list;
    };

    // Confirm DB Filters and populate selectedClients
    const handleConfirmFilters = () => {
        const filtered = applyFilters();
        if (filtered.length === 0) {
            alert('No hay clientes que coincidan con los filtros seleccionados.');
            return;
        }
        setSelectedClients(filtered);
        setStep(2);
    };

    // Handle Excel file upload
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setExcelFileName(file.name);
        setIsParsingExcel(true);

        try {
            const rawRows = await parseExcel(file);
            console.log("Parsed Excel rows:", rawRows.length);

            // Normalize headers to map to standard columns
            const parsedClients = rawRows.map(row => {
                // Find potential matches for headers (case-insensitive, accents-insensitive)
                const findValue = (keys) => {
                    const rowKey = Object.keys(row).find(k => 
                        keys.some(key => 
                            k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(key)
                        )
                    );
                    return rowKey ? row[rowKey] : '';
                };

                const name = findValue(['nombre', 'cliente', 'customer', 'name']) || 'Sin nombre';
                const phone = String(findValue(['telefono', 'tel', 'celular', 'phone']) || '').trim();
                const city = findValue(['ciudad', 'city', 'location', 'zona']) || 'Desconocida';
                const segment = findValue(['segmento', 'segment', 'categoria', 'rfm']) || 'Excel Upload';

                // Put all other fields into extra metadata
                const extra = {};
                Object.keys(row).forEach(k => {
                    const isStandard = ['nombre', 'cliente', 'customer', 'name', 'telefono', 'tel', 'celular', 'phone', 'ciudad', 'city', 'location', 'zona', 'segmento', 'segment', 'categoria', 'rfm'].some(key => 
                        k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(key)
                    );
                    if (!isStandard) {
                        extra[k] = row[k];
                    }
                });

                return {
                    name,
                    phone,
                    city,
                    segment,
                    rfm: { recency: null, frequency: null, monetary: null },
                    ...extra
                };
            }).filter(c => c.name !== 'Sin nombre' || c.phone !== '');

            setSelectedClients(parsedClients);
        } catch (error) {
            console.error('Error parsing Excel:', error);
            alert('Error al leer el archivo Excel. Asegúrate de que tenga un formato correcto.');
        } finally {
            setIsParsingExcel(false);
        }
    };

    // AI Intent filter extraction
    const handleAiSubmit = async (e) => {
        e.preventDefault();
        if (!aiPrompt.trim()) return;

        setIsAiLoading(true);
        setAiError('');

        try {
            // Call our AI chat api to extract the search intent
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: aiPrompt,
                    getIntent: true,
                    history: []
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('⏳ Demasiadas solicitudes. Espera un momento e intenta de nuevo.');
                }
                throw new Error(`Error del servidor: ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.success || !data.intent) {
                throw new Error(data.error || 'No se pudo interpretar la consulta.');
            }

            const intent = data.intent;

            if (intent.generalStats) {
                throw new Error('La consulta solicita estadísticas generales. Por favor, describe qué clientes deseas listar para la campaña (ej: "Clientes de SPS del segmento críticos").');
            }

            // Apply intent filters locally
            let list = [...rawCustomersAnalyzed];

            // 1. Date filter (no purchase in range)
            if (intent.dateFilter && intent.dateFilter.startDate && intent.dateFilter.endDate) {
                const start = new Date(intent.dateFilter.startDate).getTime();
                const end = new Date(intent.dateFilter.endDate).getTime();
                const type = intent.dateFilter.type;

                list = list.filter(c => {
                    const hasOrderInRange = c.orders.some(order => {
                        const orderDate = new Date(order.orderDate).getTime();
                        return orderDate >= start && orderDate <= end;
                    });
                    return type === 'no_purchase' ? !hasOrderInRange : hasOrderInRange;
                });
            }

            // 2. Segment filter
            if (intent.segment) {
                const segmentMapInv = {
                    'Cha': 'Champions', 'Loy': 'Loyal Customers', 'Pot': 'Potential Loyalists',
                    'New': 'New Customers', 'NRec': 'Nuevos Compradores Recientes', 
                    'NIna': 'Nuevos Compradores Inactivos', 'Oca': 'Compradores Ocasionales', 
                    'Cri': "Can't Lose Them", 'Hib': 'Hibernating', 'Los': 'Lost'
                };
                const targetSegment = segmentMapInv[intent.segment] || intent.segment;
                list = list.filter(c => c.rfm?.segment === targetSegment);
            }

            // 3. City filter
            if (intent.city) {
                const cityMapInv = { 'Teg': 'TEGUCIGALPA D.C.', 'SPS': 'SAN PEDRO SULA' };
                const targetCity = (cityMapInv[intent.city] || intent.city).toLowerCase().trim();
                list = list.filter(c => c.city?.toLowerCase().trim() === targetCity);
            }

            // 4. Search term (name/phone)
            if (intent.searchTerm) {
                const term = intent.searchTerm.toLowerCase().trim();
                list = list.filter(c => 
                    (c.name && c.name.toLowerCase().includes(term)) ||
                    (c.phone && c.phone.includes(term))
                );
            }

            // 5. SKU filter
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

            if (list.length === 0) {
                throw new Error('La consulta de IA fue comprendida pero no se encontraron clientes que coincidan.');
            }

            setSelectedClients(list);
            // Dynamic campaign name generation from prompt
            if (!campaignName) {
                const dateStr = new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                setCampaignName(`Campaña IA (${dateStr})`);
            }
        } catch (error) {
            console.error('AI Filter error:', error);
            setAiError(error.message);
        } finally {
            setIsAiLoading(false);
        }
    };

    // Gestoras Selection Logic
    const toggleGestora = (gestora) => {
        const isSelected = selectedGestoras.some(g => g.id === gestora.id);
        if (isSelected) {
            setSelectedGestoras(selectedGestoras.filter(g => g.id !== gestora.id));
        } else {
            setSelectedGestoras([...selectedGestoras, gestora]);
        }
    };

    const toggleSelectAllGestoras = () => {
        if (selectedGestoras.length === allGestoras.length) {
            setSelectedGestoras([]);
        } else {
            setSelectedGestoras(allGestoras);
        }
    };

    // Toggle select/deselect all in a specific zone
    const toggleSelectZone = (zoneName, gestorasInZone) => {
        const allInZoneSelected = gestorasInZone.every(g => selectedGestoras.some(sg => sg.id === g.id));
        if (allInZoneSelected) {
            setSelectedGestoras(prev => prev.filter(sg => !gestorasInZone.some(g => g.id === sg.id)));
        } else {
            setSelectedGestoras(prev => {
                const filtered = prev.filter(sg => !gestorasInZone.some(g => g.id === sg.id));
                return [...filtered, ...gestorasInZone];
            });
        }
    };

    const filteredGestorasList = allGestoras.filter(g => 
        (g.displayName || '').toLowerCase().includes(gestoraSearch.toLowerCase()) ||
        (g.username || '').toLowerCase().includes(gestoraSearch.toLowerCase())
    );

    const gestorasByZone = useMemo(() => {
        const groups = {};
        filteredGestorasList.forEach(g => {
            const name = g.displayName || g.username || '';
            const nameLower = name.toLowerCase().trim();
            const match = Object.values(GESTORES_MAP).find(gm => 
                gm.gestor.toLowerCase().trim() === nameLower
            );
            const zone = match ? match.zona : 'Sin Zona';
            
            if (!groups[zone]) {
                groups[zone] = [];
            }
            groups[zone].push(g);
        });
        
        // Sort zones alphabetically
        return Object.fromEntries(
            Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
        );
    }, [filteredGestorasList]);

    // Allocation metrics preview
    const allocationPreview = useMemo(() => {
        const total = selectedClients.length;
        const numGestoras = selectedGestoras.length;
        if (total === 0 || numGestoras === 0) return { avg: 0, remainder: 0 };
        return {
            avg: Math.floor(total / numGestoras),
            remainder: total % numGestoras
        };
    }, [selectedClients, selectedGestoras]);

    // Handle Campaign Submission (Create & Assign)
    const handleSubmitCampaign = async () => {
        if (!campaignName.trim()) {
            setSubmitError('El nombre de la campaña es obligatorio.');
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            // 1. Create the campaign header
            const metaInfo = {
                sourceType,
                excelFileName: sourceType === 'excel' ? excelFileName : null,
                filterSegment: sourceType === 'filter' ? filterSegment : null,
                filterCity: sourceType === 'filter' ? filterCity : null,
                filterRecency: sourceType === 'filter' ? filterRecency : null,
                selectedProducts: sourceType === 'filter' ? selectedProducts : null,
                aiPrompt: sourceType === 'ai' ? aiPrompt : null
            };

            const creator = currentUser?.username || currentUser?.email || 'admin';
            const createRes = await createCampaign({
                name: campaignName.trim(),
                description: campaignDescription.trim(),
                sourceType,
                sourceMeta: metaInfo,
                totalClients: selectedClients.length,
                createdBy: creator
            });

            if (!createRes.success) {
                throw new Error(createRes.error || 'Error al guardar la campaña.');
            }

            const campaignId = createRes.data.id;

            // 2. Distribute and assign clients
            const assignRes = await assignClients(campaignId, selectedClients, selectedGestoras);
            if (!assignRes.success) {
                throw new Error(assignRes.error || 'Error al asignar los clientes.');
            }

            // Success callback
            onCampaignCreated();
            onClose();
            
            // Reset wizard state
            setStep(1);
            setSelectedClients([]);
            setExcelFileName('');
            setCampaignName('');
            setCampaignDescription('');
            setSelectedGestoras([]);
            setFilterCity([]);
            setFilterSku('');
            setSelectedProducts([]);
            setShowAiConfirmation(false);
            setAiPendingClients([]);
        } catch (error) {
            console.error('Error creating campaign:', error);
            setSubmitError(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-3xl overflow-hidden glassmorphism bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span>Crear Campaña de Llamadas</span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Genera listas de llamadas y repártelas equitativamente entre las gestoras.
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Progress Stepper */}
                <div className="flex justify-between items-center px-8 py-4 bg-slate-50/30 dark:bg-slate-950/5 border-b border-slate-100 dark:border-slate-800/50">
                    {[
                        { num: 1, label: 'Clientes' },
                        { num: 2, label: 'Gestoras' },
                        { num: 3, label: 'Confirmación' }
                    ].map((s) => (
                        <React.Fragment key={s.num}>
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                                    step === s.num 
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                                        : step > s.num 
                                            ? 'bg-emerald-500 text-white' 
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}>
                                    {step > s.num ? <Check size={16} /> : s.num}
                                </div>
                                <span className={`text-sm font-medium ${
                                    step === s.num ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                    {s.label}
                                </span>
                            </div>
                            {s.num < 3 && (
                                <div className={`flex-1 h-0.5 mx-4 ${
                                    step > s.num ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                                }`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* STEP 1: SELECT CLIENTS */}
                    {step === 1 && (
                        <div className="space-y-6">
                            {/* Source Tabs */}
                            <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-slate-950/50 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                                <button
                                    onClick={() => { 
                                        setSourceType('filter'); 
                                        setSelectedClients([]); 
                                        setShowAiConfirmation(false);
                                        setAiPendingClients([]);
                                    }}
                                    className={`py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                        sourceType === 'filter'
                                            ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                >
                                    <Filter size={16} />
                                    <span>Filtrar BD</span>
                                </button>
                                <button
                                    onClick={() => { 
                                        setSourceType('ai'); 
                                        setSelectedClients([]); 
                                        setShowAiConfirmation(false);
                                        setAiPendingClients([]);
                                    }}
                                    className={`py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                        sourceType === 'ai'
                                            ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                >
                                    <Sparkles size={16} />
                                    <span>Asistente IA</span>
                                </button>
                                <button
                                    onClick={() => { 
                                        setSourceType('excel'); 
                                        setSelectedClients([]); 
                                        setShowAiConfirmation(false);
                                        setAiPendingClients([]);
                                    }}
                                    className={`py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                                        sourceType === 'excel'
                                            ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                >
                                    <FileSpreadsheet size={16} />
                                    <span>Subir Excel</span>
                                </button>
                            </div>
                            {/* SOURCE 1: DATABASE FILTER */}
                            {sourceType === 'filter' && (
                                <div className="space-y-4">
                                    {/* 1. Buscar y agregar Productos / SKUs */}
                                    <div className="space-y-1.5 relative" ref={skuDropdownRef}>
                                         <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                             Buscar y agregar Productos / SKUs (Opcional)
                                         </label>
                                         <div className="relative">
                                             <input 
                                                 type="text" 
                                                 placeholder="Ej. 10005845 o OZEMPIC (Presiona Enter para agregar manual)"
                                                 value={filterSku}
                                                 onChange={(e) => {
                                                     setFilterSku(e.target.value);
                                                     setShowSkuDropdown(true);
                                                 }}
                                                 onFocus={() => setShowSkuDropdown(true)}
                                                 onKeyDown={(e) => {
                                                     if (e.key === 'Enter') {
                                                         e.preventDefault();
                                                         handleAddCustomSku();
                                                     }
                                                 }}
                                                 className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-2.5 pr-10 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-400"
                                             />
                                             {filterSku.trim() !== '' && (
                                                 <button 
                                                     type="button" 
                                                     onClick={() => setFilterSku('')} 
                                                     className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 cursor-pointer"
                                                 >
                                                     <X size={14} />
                                                 </button>
                                             )}
                                         </div>

                                         {showSkuDropdown && filteredProductSuggestions.length > 0 && (
                                             <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto">
                                                 {filteredProductSuggestions.map(prod => {
                                                     const isAlreadySelected = selectedProducts.some(p => p.sku === prod.sku);
                                                     return (
                                                         <button
                                                             key={prod.sku}
                                                             type="button"
                                                             onClick={() => {
                                                                 if (!isAlreadySelected) {
                                                                     setSelectedProducts(prev => [...prev, prod]);
                                                                 }
                                                                 setFilterSku('');
                                                                 setShowSkuDropdown(false);
                                                             }}
                                                             className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between cursor-pointer ${
                                                                 isAlreadySelected 
                                                                     ? 'bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 cursor-default'
                                                                     : 'text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850/50'
                                                             }`}
                                                             disabled={isAlreadySelected}
                                                         >
                                                             <div className="flex flex-col">
                                                                 <span className="font-semibold text-xs text-slate-500 dark:text-slate-455">SKU: {prod.sku}</span>
                                                                 <span className="mt-0.5">{prod.description}</span>
                                                             </div>
                                                             {isAlreadySelected && <Check size={14} className="text-slate-400 dark:text-slate-550" />}
                                                         </button>
                                                     );
                                                 })}
                                             </div>
                                         )}

                                         {/* Selected Products Chips */}
                                         {selectedProducts.length > 0 && (
                                             <div className="flex flex-wrap gap-2 mt-2 pt-1">
                                                 {selectedProducts.map(prod => (
                                                     <div 
                                                         key={prod.sku} 
                                                         className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-full border border-blue-100/50 dark:border-blue-800/30"
                                                     >
                                                         <span className="font-semibold">{prod.sku}</span>
                                                         <span className="opacity-80 max-w-[180px] truncate">{prod.description}</span>
                                                         <button 
                                                             type="button"
                                                             onClick={() => setSelectedProducts(prev => prev.filter(p => p.sku !== prod.sku))}
                                                             className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors focus:outline-none ml-0.5 cursor-pointer"
                                                         >
                                                             <X size={12} />
                                                         </button>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                    </div>

                                    {/* 2. Segmento & Ciudad */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Segmento RFM</label>
                                            <select 
                                                value={filterSegment}
                                                onChange={(e) => setFilterSegment(e.target.value)}
                                                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-2.5 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                            >
                                                <option value="all">Todos los segmentos</option>
                                                {segments.map(s => (
                                                    <option key={s.id} value={s.id}>{s.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-1.5 relative" ref={cityDropdownRef}>
                                             <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Ciudad</label>
                                             <button
                                                 type="button"
                                                 onClick={() => setShowCityDropdown(!showCityDropdown)}
                                                 className="w-full text-left text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-2.5 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white flex items-center justify-between shadow-sm cursor-pointer"
                                             >
                                                 <span className="truncate max-w-[200px]">{cityButtonText}</span>
                                                 <ChevronDown size={16} className="text-slate-400 shrink-0" />
                                             </button>

                                             {showCityDropdown && (
                                                 <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1.5 max-h-48 overflow-y-auto">
                                                     <button
                                                         type="button"
                                                         onClick={() => setFilterCity([])}
                                                         className="w-full text-left px-3.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
                                                     >
                                                         Limpiar selección (Todas)
                                                     </button>
                                                     {uniqueCities.map(city => {
                                                         const isSelected = filterCity.includes(city);
                                                         return (
                                                             <button
                                                                 key={city}
                                                                 type="button"
                                                                 onClick={() => toggleCity(city)}
                                                                 className="w-full text-left px-3.5 py-2 text-sm text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors flex items-center justify-between cursor-pointer"
                                                             >
                                                                 <span>{formatCityName(city)}</span>
                                                                 {isSelected ? (
                                                                     <CheckSquare size={16} className="text-blue-500 shrink-0" />
                                                                 ) : (
                                                                     <Square size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                                 )}
                                                             </button>
                                                         );
                                                     })}
                                                 </div>
                                             )}
                                         </div>
                                    </div>

                                    {/* 3. Recencia de Compras */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                             <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Recencia de Compras</label>
                                             <select 
                                                 value={filterRecency}
                                                 onChange={(e) => setFilterRecency(e.target.value)}
                                                 className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-2.5 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                             >
                                                 <option value="all">Cualquier recencia (compraron recientemente o no)</option>
                                                 <option value="30">Sin compras en los últimos 30 días (1 mes)</option>
                                                 <option value="60">Sin compras en los últimos 60 días (2 meses)</option>
                                                 <option value="90">Sin compras en los últimos 90 días (3 meses)</option>
                                                 <option value="180">Sin compras en los últimos 180 días (6 meses)</option>
                                             </select>
                                         </div>
                                    </div>

                                    <div className="p-4 bg-blue-50/50 dark:bg-slate-950/40 rounded-xl flex items-center justify-between border border-blue-100/50 dark:border-slate-800/40">
                                        <div className="flex items-center gap-3">
                                            <Info className="text-blue-500" size={18} />
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                                    Clientes seleccionados: <span className="text-blue-600 dark:text-blue-400 text-lg font-bold">{previewCount}</span>
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                    Se filtran en tiempo real basados en la base de datos de compras.
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleConfirmFilters}
                                            disabled={previewCount === 0}
                                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md shadow-blue-500/10"
                                        >
                                            <span>Confirmar clientes</span>
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* SOURCE 2: AI FILTER */}
                            {sourceType === 'ai' && (
                                <div className="space-y-4">
                                    <form onSubmit={handleAiSubmit} className="space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">¿Qué clientes quieres asignar?</label>
                                            <textarea 
                                                rows="3"
                                                placeholder='Describe en lenguaje natural, ej. "Clientes críticos de Tegucigalpa que no tengan compras en los últimos 2 meses"'
                                                value={aiPrompt}
                                                onChange={(e) => setAiPrompt(e.target.value)}
                                                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-3 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-400 resize-none"
                                            />
                                        </div>

                                        <div className="flex justify-end">
                                            <button 
                                                type="submit"
                                                disabled={isAiLoading || !aiPrompt.trim()}
                                                className="px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 shadow-md shadow-blue-500/10 disabled:opacity-50"
                                            >
                                                {isAiLoading ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span>Extrayendo intención...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={16} />
                                                        <span>Consultar Asistente IA</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </form>

                                    {aiError && (
                                        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2 border border-rose-100 dark:border-rose-900/30">
                                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                            <span>{aiError}</span>
                                        </div>
                                    )}

                                    {selectedClients.length > 0 && (
                                        <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-between border border-emerald-100/50 dark:border-emerald-900/20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                    <Check size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                                        Clientes identificados por la IA: <span className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">{selectedClients.length}</span>
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        Consulta exitosa. Los clientes coinciden con tu descripción.
                                                    </p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setStep(2)}
                                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 font-medium shadow-md shadow-blue-500/10 cursor-pointer"
                                            >
                                                <span>Siguiente paso</span>
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* SOURCE 3: EXCEL UPLOAD */}
                            {sourceType === 'excel' && (
                                <div className="space-y-4">
                                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center bg-slate-50/50 dark:bg-slate-950/10 hover:bg-slate-50 dark:hover:bg-slate-950/20 transition-all relative">
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleExcelUpload}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={isParsingExcel}
                                        />
                                        
                                        {isParsingExcel ? (
                                            <div className="space-y-3 py-4">
                                                <Loader2 size={32} className="mx-auto text-blue-500 animate-spin" />
                                                <p className="text-sm text-slate-600 dark:text-slate-400">Procesando y normalizando archivo Excel...</p>
                                            </div>
                                        ) : excelFileName ? (
                                            <div className="space-y-2 py-2">
                                                <FileSpreadsheet size={40} className="mx-auto text-emerald-500" />
                                                <p className="text-sm font-semibold text-slate-800 dark:text-white">{excelFileName}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    Se detectaron <span className="font-semibold text-slate-800 dark:text-white">{selectedClients.length}</span> clientes.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 py-2">
                                                <Upload size={36} className="mx-auto text-slate-400" />
                                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Arrastra tu archivo aquí o haz clic para buscar</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">Formatos soportados: .xlsx, .xls</p>
                                            </div>
                                        )}
                                    </div>

                                    {selectedClients.length > 0 && !isParsingExcel && (
                                        <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-between border border-emerald-100/50 dark:border-emerald-900/20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                    <Check size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                                        Clientes cargados: <span className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">{selectedClients.length}</span>
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                        Los nombres, teléfonos y ciudades han sido normalizados automáticamente.
                                                    </p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setStep(2)}
                                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 font-medium shadow-md shadow-blue-500/10"
                                            >
                                                <span>Siguiente paso</span>
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: SELECT GESTORAS */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                        <Users size={16} className="text-blue-500" />
                                        <span>Seleccionar Gestoras</span>
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Selecciona las personas que se encargarán de realizar las llamadas.
                                    </p>
                                </div>
                                <button 
                                    onClick={toggleSelectAllGestoras}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-md"
                                >
                                    {selectedGestoras.length === allGestoras.length ? 'Desmarcar Todas' : 'Seleccionar Todas'}
                                </button>
                            </div>

                            {/* Search bar */}
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar gestora por nombre..."
                                    value={gestoraSearch}
                                    onChange={(e) => setGestoraSearch(e.target.value)}
                                    className="w-full text-sm pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                                />
                            </div>

                            {loadingGestoras ? (
                                <div className="py-8 text-center space-y-2">
                                    <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                                    <p className="text-xs text-slate-500">Cargando lista de gestoras...</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                                    {filteredGestorasList.length === 0 ? (
                                        <div className="py-6 text-center text-xs text-slate-500">
                                            No se encontraron gestoras con el criterio de búsqueda.
                                        </div>
                                    ) : (
                                        Object.entries(gestorasByZone).map(([zoneName, gestorasInZone]) => (
                                            <div key={zoneName} className="space-y-2">
                                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1 mt-2">
                                                    <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                        Zona: {zoneName} ({gestorasInZone.length})
                                                    </h4>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSelectZone(zoneName, gestorasInZone)}
                                                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 rounded cursor-pointer"
                                                    >
                                                        {gestorasInZone.every(g => selectedGestoras.some(sg => sg.id === g.id)) 
                                                            ? 'Desmarcar Zona' 
                                                            : 'Seleccionar Zona'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {gestorasInZone.map(g => {
                                                        const isSel = selectedGestoras.some(sg => sg.id === g.id);
                                                        return (
                                                            <button
                                                                key={g.id}
                                                                type="button"
                                                                onClick={() => toggleGestora(g)}
                                                                className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                                                                    isSel 
                                                                        ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20' 
                                                                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                                                                        isSel ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                                    }`}>
                                                                        {(g.displayName || g.username || 'G').substring(0, 2)}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-slate-800 dark:text-white">{g.displayName || g.username}</p>
                                                                        <p className="text-[10px] text-slate-500">Usuario: {g.username}</p>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    {isSel ? (
                                                                        <CheckSquare className="text-blue-500" size={18} />
                                                                    ) : (
                                                                        <Square className="text-slate-300 dark:text-slate-700" size={18} />
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* Distribution preview banner */}
                            {selectedGestoras.length > 0 && (
                                <div className="p-4 bg-blue-50/50 dark:bg-slate-950/40 rounded-xl border border-blue-100/50 dark:border-slate-800/40 space-y-1">
                                    <p className="text-xs font-semibold text-slate-800 dark:text-white">Vista previa de distribución equitativa:</p>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                        Los <span className="font-semibold text-slate-800 dark:text-white">{selectedClients.length}</span> clientes se repartirán de forma aleatoria. 
                                        Cada gestora recibirá aproximadamente <span className="font-semibold text-blue-600 dark:text-blue-400">{allocationPreview.avg}</span> clientes.
                                        {allocationPreview.remainder > 0 && ` (${allocationPreview.remainder} gestoras recibirán 1 adicional).`}
                                    </p>
                                </div>
                            )}

                            {/* Step Navigation */}
                            <div className="flex justify-between items-center pt-2">
                                <button 
                                    onClick={() => setStep(1)}
                                    className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                                >
                                    <ArrowLeft size={14} />
                                    <span>Atrás</span>
                                </button>
                                <button 
                                    onClick={() => setStep(3)}
                                    disabled={selectedGestoras.length === 0}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-500/10"
                                >
                                    <span>Siguiente: Confirmar</span>
                                    <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CONFIRMATION & SAVE */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Nombre y Detalle de la Campaña</h3>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nombre de Campaña *</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej: Reactivación Segmento Crítico - Junio"
                                        value={campaignName}
                                        onChange={(e) => setCampaignName(e.target.value)}
                                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-400"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Descripción / Instrucciones para las gestoras (Opcional)</label>
                                    <textarea 
                                        rows="2"
                                        placeholder="Detalles sobre qué producto ofrecer, promociones vigentes, etc..."
                                        value={campaignDescription}
                                        onChange={(e) => setCampaignDescription(e.target.value)}
                                        className="w-full text-sm p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-400 resize-none"
                                    />
                                </div>
                            </div>

                            {/* Summary panel */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                                <h4 className="text-xs font-bold text-slate-800 dark:text-white">Resumen de Distribución</h4>
                                
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-850">
                                        <span className="text-slate-500">Origen de clientes:</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{sourceType}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-850">
                                        <span className="text-slate-500">Total clientes:</span>
                                        <span className="font-bold text-blue-600 dark:text-blue-400">{selectedClients.length}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-850">
                                        <span className="text-slate-500">Gestoras asignadas:</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedGestoras.length}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-850">
                                        <span className="text-slate-500">Clientes promedio c/u:</span>
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">~{allocationPreview.avg}</span>
                                    </div>
                                </div>
                            </div>

                            {submitError && (
                                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2 border border-rose-100 dark:border-rose-900/30">
                                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                    <span>{submitError}</span>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-between items-center pt-2">
                                <button 
                                    onClick={() => setStep(2)}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <ArrowLeft size={14} />
                                    <span>Atrás</span>
                                </button>
                                <button 
                                    onClick={handleSubmitCampaign}
                                    disabled={isSubmitting || !campaignName.trim()}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Asignando & Creando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            <span>Crear Campaña y Distribuir</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default CampaignWizard;
