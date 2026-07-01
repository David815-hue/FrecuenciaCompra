import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, History, Loader2, PackageSearch, Phone, RotateCcw, Search, ShieldCheck, UserSearch } from 'lucide-react';
import { getContactSuppressions, normalizePhone, reactivateContact, suppressContact } from '../utils/contactSuppressionUtils';

const groupCustomers = (orders = []) => {
    const map = new Map();
    orders.forEach(order => {
        const normalizedPhone = normalizePhone(order.phone);
        if (!normalizedPhone) return;
        if (!map.has(normalizedPhone)) {
            map.set(normalizedPhone, {
                normalizedPhone,
                phone: order.phone,
                name: order.customerName || order.name || 'Sin nombre',
                identity: order.identity || '',
                city: order.city || '',
                ordersCount: 0,
                totalSpent: 0,
                productsMap: new Map()
            });
        }
        const customer = map.get(normalizedPhone);
        customer.ordersCount += 1;
        customer.totalSpent += parseFloat(order.totalAmount) || 0;
        (order.items || []).forEach(item => {
            const sku = String(item.sku || '').trim();
            const name = String(item.description || sku || 'Producto').trim();
            const key = sku || name.toLowerCase();
            if (!customer.productsMap.has(key)) customer.productsMap.set(key, { sku, name });
        });
    });
    return Array.from(map.values()).map(customer => ({
        ...customer,
        products: Array.from(customer.productsMap.values()),
        productsMap: undefined
    }));
};

const matchesSearch = (customer, query) => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const searchable = [
        customer.name,
        customer.phone,
        customer.normalizedPhone,
        customer.identity,
        customer.city,
        ...(customer.products || []).flatMap(product => [product.sku, product.name])
    ].join(' ').toLowerCase();
    return terms.every(term => searchable.includes(term));
};

const ProductChips = ({ products = [], query = '', limit = 5 }) => {
    const term = query.toLowerCase().trim();
    const ordered = [...products].sort((a, b) => {
        const aMatch = term && `${a.sku} ${a.name}`.toLowerCase().includes(term);
        const bMatch = term && `${b.sku} ${b.name}`.toLowerCase().includes(term);
        return Number(bMatch) - Number(aMatch);
    });
    return (
        <div className="flex flex-wrap gap-1.5">
            {ordered.slice(0, limit).map(product => (
                <span key={product.sku || product.name} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {product.sku && <span className="mr-1 font-mono text-indigo-600 dark:text-indigo-400">{product.sku}</span>}{product.name}
                </span>
            ))}
            {ordered.length > limit && <span className="px-1 py-1 text-[10px] font-bold text-slate-400">+{ordered.length - limit}</span>}
        </div>
    );
};

const ContactSuppressionPanel = ({ currentUser, customersData = [], onSuppressionsChanged }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [mode, setMode] = useState('find');
    const [query, setQuery] = useState('');
    const [target, setTarget] = useState(null);
    const [selectedSku, setSelectedSku] = useState('');

    const loadRecords = async () => {
        setLoading(true);
        setError('');
        try {
            setRecords(await getContactSuppressions({ includeInactive: true }));
        } catch (err) {
            setError(err.message || 'No fue posible cargar la lista.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRecords(); }, []);

    const customers = useMemo(() => groupCustomers(customersData), [customersData]);
    const customerByPhone = useMemo(() => new Map(customers.map(customer => [customer.normalizedPhone, customer])), [customers]);
    const activeRecords = useMemo(() => records.filter(record => record.active !== false), [records]);
    const activeCount = activeRecords.length;
    const inactiveCount = records.filter(record => record.active === false).length;
    const targetSuppressedSkus = useMemo(() => new Set(
        activeRecords
            .filter(record => normalizePhone(record.normalizedPhone || record.phone) === target?.normalizedPhone)
            .map(record => String(record.sku || '').toUpperCase())
            .filter(Boolean)
    ), [activeRecords, target]);

    const searchResults = useMemo(() => {
        if (query.trim().length < 2) return [];
        return customers.filter(customer => matchesSearch(customer, query)).slice(0, 30);
    }, [customers, query]);

    const managedRecords = useMemo(() => records
        .filter(record => mode === 'history' ? record.active === false : record.active !== false)
        .map(record => {
            const customer = customerByPhone.get(normalizePhone(record.normalizedPhone || record.phone));
            return {
                ...record,
                products: record.sku ? [{ sku: record.sku, name: record.productName || 'Producto' }] : (customer?.products || record.products || []),
                customer
            };
        })
        .filter(record => matchesSearch({
            name: record.customerName,
            phone: record.phone,
            normalizedPhone: record.normalizedPhone,
            identity: record.customer?.identity,
            city: record.customer?.city,
            products: record.products
        }, query)), [records, mode, customerByPhone, query]);

    const handleSuppress = async () => {
        if (!target) return;
        const selectedProduct = target.products.find(product => product.sku === selectedSku);
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const result = await suppressContact({
                phone: target.phone,
                customerName: target.name,
                sku: selectedSku,
                productName: selectedProduct?.name || '',
                actor: currentUser
            });
            setSuccess(result.cancelledAssignments > 0 ? `Cliente excluido y ${result.cancelledAssignments} gestiones abiertas cerradas.` : 'Cliente agregado a No contactar.');
            setTarget(null);
            setSelectedSku('');
            await loadRecords();
            onSuppressionsChanged?.();
        } catch (err) {
            setError(err.message || 'No fue posible guardar la exclusión.');
        } finally {
            setSaving(false);
        }
    };

    const handleReactivate = async (record) => {
        if (!window.confirm(`¿Reactivar a ${record.customerName || record.phone}? Podrá incluirse en nuevas bases y campañas.`)) return;
        setError('');
        setSuccess('');
        try {
            await reactivateContact(record, currentUser);
            setSuccess('Cliente reactivado para futuros contactos.');
            await loadRecords();
            onSuppressionsChanged?.();
        } catch (err) {
            setError(err.message || 'No fue posible reactivar al cliente.');
        }
    };

    const changeMode = (nextMode) => {
        setMode(nextMode);
        setQuery('');
        setTarget(null);
        setSelectedSku('');
        setError('');
        setSuccess('');
    };

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <header className="rounded-3xl border border-slate-200/80 bg-white/80 px-6 py-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75 md:px-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">Preferencias de contacto</p>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">No contactar</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Busca por cliente o por los productos que compró. Revisa el contexto antes de marcarlo y administra aquí las exclusiones existentes.</p>
                    </div>
                    <div className="flex gap-6 border-l-0 border-slate-200 pl-0 dark:border-slate-700 lg:border-l lg:pl-6">
                        <div><p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{activeCount}</p><p className="text-xs font-semibold text-slate-500">Marcados</p></div>
                        <div><p className="text-3xl font-bold text-slate-700 dark:text-slate-200">{inactiveCount}</p><p className="text-xs font-semibold text-slate-500">Reactivados</p></div>
                    </div>
                </div>
            </header>

            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
                <div className="border-b border-slate-200 px-5 pt-5 dark:border-slate-800 md:px-6">
                    <div className="flex flex-wrap gap-1">
                        {[
                            { id: 'find', label: 'Buscar clientes', icon: UserSearch },
                            { id: 'active', label: `Marcados (${activeCount})`, icon: Ban },
                            { id: 'history', label: `Historial (${inactiveCount})`, icon: History }
                        ].map(tab => <button key={tab.id} onClick={() => changeMode(tab.id)} className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-xs font-bold transition ${mode === tab.id ? 'bg-slate-100 text-indigo-700 dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}><tab.icon size={15} />{tab.label}</button>)}
                    </div>
                </div>

                <div className="p-5 md:p-6">
                    <label className="relative block">
                        {mode === 'find' ? <PackageSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" /> : <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />}
                        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === 'find' ? 'Buscar por nombre, teléfono, identidad, SKU o producto…' : 'Filtrar por cliente, teléfono, SKU o producto…'} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/40 dark:text-white dark:focus:border-indigo-500" />
                    </label>

                    {(error || success) && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${error ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>{error || success}</div>}

                    {target && (
                        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-bold text-rose-800 dark:text-rose-200">Escoge el SKU para {target.name}</p><p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">El cliente seguirá disponible para los demás productos.</p></div><button onClick={() => { setTarget(null); setSelectedSku(''); }} className="w-fit text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">Cancelar</button></div>
                            <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1 custom-scrollbar">{target.products.filter(product => product.sku).map(product => {
                                const alreadyMarked = targetSuppressedSkus.has(product.sku.toUpperCase());
                                const selected = selectedSku === product.sku;
                                return <button key={product.sku} type="button" disabled={alreadyMarked} onClick={() => setSelectedSku(product.sku)} className={`rounded-lg border px-2.5 py-2 text-left text-[10px] font-semibold transition ${alreadyMarked ? 'cursor-not-allowed border-rose-200 bg-rose-100 text-rose-500 opacity-70 dark:border-rose-900/60 dark:bg-rose-950/40' : selected ? 'border-rose-500 bg-rose-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}><span className={`mr-1.5 font-mono ${selected ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`}>{product.sku}</span>{product.name}{alreadyMarked && <span className="ml-1">· marcado</span>}</button>;
                            })}</div>
                            <div className="mt-4 flex justify-end"><button onClick={handleSuppress} disabled={saving || !selectedSku || targetSuppressedSkus.has(selectedSku.toUpperCase())} className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} No contactar por este SKU</button></div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
                    ) : mode === 'find' ? (
                        query.trim().length < 2 ? <div className="py-16 text-center"><PackageSearch size={34} className="mx-auto text-indigo-400" /><p className="mt-3 font-bold text-slate-700 dark:text-slate-200">Encuentra al cliente desde sus compras</p><p className="mt-1 text-sm text-slate-500">Escribe un nombre, teléfono, SKU o producto.</p></div>
                            : searchResults.length === 0 ? <div className="py-16 text-center"><Search size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-bold text-slate-700 dark:text-slate-200">Sin coincidencias</p><p className="mt-1 text-sm text-slate-500">Prueba con otro nombre, teléfono o SKU.</p></div>
                                : <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">{searchResults.map(customer => {
                                    const markedCount = activeRecords.filter(record => normalizePhone(record.normalizedPhone || record.phone) === customer.normalizedPhone).length;
                                    return <article key={customer.normalizedPhone} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_auto] lg:items-center"><div><p className="font-bold text-slate-900 dark:text-white">{customer.name}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Phone size={12} />{customer.phone}</span>{customer.identity && <span>· {customer.identity}</span>}<span>· {customer.ordersCount} pedidos</span>{markedCount > 0 && <span className="font-bold text-rose-600">· {markedCount} SKU marcados</span>}</p></div><ProductChips products={customer.products} query={query} /><button onClick={() => { setTarget(customer); setSelectedSku(''); setError(''); setSuccess(''); }} className="flex w-fit items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/20"><Ban size={14} /> Elegir SKU</button></article>;
                                })}</div>
                    ) : managedRecords.length === 0 ? (
                        <div className="py-16 text-center"><CheckCircle2 size={34} className="mx-auto text-emerald-500" /><p className="mt-3 font-bold text-slate-700 dark:text-slate-200">{mode === 'history' ? 'No hay clientes reactivados' : 'No hay clientes marcados'}</p><p className="mt-1 text-sm text-slate-500">{query ? 'No hay coincidencias para esta búsqueda.' : 'Los cambios aparecerán aquí con su contexto de compra.'}</p></div>
                    ) : (
                        <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">{managedRecords.map(record => <article key={record.storeKey} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] lg:items-center"><div><p className="font-bold text-slate-900 dark:text-white">{record.customerName || 'Sin nombre'}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Phone size={12} />{record.phone || record.normalizedPhone}</p></div><ProductChips products={record.products} query={query} /><div><p className="text-xs font-bold text-slate-700 dark:text-slate-300">SKU {record.sku || 'Todos'}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(record.updatedAt || record.createdAt).toLocaleString('es-HN')} · {record.updatedBy?.name || record.createdBy?.name || 'Usuario'}</p></div>{record.active !== false ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-100 px-3 py-1.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><Ban size={12} /> No contactar</span> : <button onClick={() => handleReactivate(record)} className="flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"><RotateCcw size={14} /> Reactivar</button>}</article>)}</div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default ContactSuppressionPanel;
