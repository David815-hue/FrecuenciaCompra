import React, { useEffect, useMemo } from 'react';
import { X, Package, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ProductDetailsModal = ({ isOpen, onClose, customerName, monthLabel, orderCount, items }) => {
    // Close on ESC key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Group and sort products
    const products = useMemo(() => {
        if (!items || items.length === 0) return [];

        // Group by SKU
        const grouped = items.reduce((acc, item) => {
            const key = item.sku || 'N/A';
            if (!acc[key]) {
                acc[key] = {
                    sku: item.sku || 'N/A',
                    description: item.description || 'Sin descripción',
                    quantity: 0,
                    total: 0
                };
            }
            acc[key].quantity += item.quantity || 0;
            acc[key].total += item.total || 0;
            return acc;
        }, {});

        // Sort by quantity (descending)
        return Object.values(grouped).sort((a, b) => b.quantity - a.quantity);
    }, [items]);

    const totalAmount = useMemo(() => {
        return products.reduce((sum, p) => sum + p.total, 0);
    }, [products]);

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
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        onClick={onClose}
                    />

                    {/* Modal Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                        className="relative bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="relative bg-white px-8 py-6 flex-shrink-0 border-b border-slate-100 z-10">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                                            Detalle de Compra
                                        </span>
                                        <span className="text-slate-400 text-sm font-medium">
                                            {monthLabel}
                                        </span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                                        {customerName}
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-full transition-all duration-200"
                                    aria-label="Cerrar"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Stats Bar */}
                        <div className="bg-slate-50/50 px-8 py-3 border-b border-slate-100 flex gap-6 text-sm">
                            <div className="flex items-center gap-2 text-slate-600">
                                <Package size={16} className="text-indigo-500" />
                                <span className="font-medium">{products.length} productos distintos</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                                <ShoppingCart size={16} className="text-emerald-500" />
                                <span className="font-medium">{orderCount} pedidos en el mes</span>
                            </div>
                        </div>

                        {/* Products List */}
                        <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50/30 custom-scrollbar">
                            {products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <Package size={64} className="opacity-10 mb-4" />
                                    <p className="text-lg font-medium">No hay productos disponibles</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {products.map((product, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.02, duration: 0.3 }}
                                            className="bg-white border boundary-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-slate-50 to-white rounded-bl-full -mr-8 -mt-8 z-0" />

                                            <div className="relative z-10 flex items-start gap-4">
                                                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-lg shadow-inner">
                                                    {product.quantity}x
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded tracking-tight">
                                                            SKU: {product.sku}
                                                        </span>
                                                        {product.total > 0 && (
                                                            <span className="font-bold text-slate-900 text-sm">
                                                                L. {product.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="text-slate-700 font-medium text-sm leading-snug line-clamp-2" title={product.description}>
                                                        {product.description}
                                                    </p>

                                                    {product.total > 0 && (
                                                        <p className="text-slate-400 text-[11px] mt-1.5 text-right">
                                                            L. {(product.total / product.quantity).toFixed(2)} c/u
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {products.length > 0 && totalAmount > 0 && (
                            <div className="bg-white border-t border-slate-100 px-8 py-5 flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-20">
                                <div className="flex items-center justify-end gap-3">
                                    <div className="text-right">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Total del mes</p>
                                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                            <span className="text-lg text-slate-400 font-medium mr-1">L.</span>
                                            {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ProductDetailsModal;
