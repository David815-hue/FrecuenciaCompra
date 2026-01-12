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
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-6 flex-shrink-0">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                                            <ShoppingCart size={20} />
                                        </div>
                                        {customerName}
                                    </h2>
                                    <div className="flex items-center gap-4 text-indigo-100">
                                        <p className="text-lg font-medium capitalize">{monthLabel}</p>
                                        <span className="text-sm bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full">
                                            {orderCount} {orderCount === 1 ? 'pedido' : 'pedidos'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="ml-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Products List */}
                        <div className="flex-1 overflow-y-auto px-8 py-6">
                            {products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <Package size={48} className="opacity-20 mb-4" />
                                    <p className="text-lg font-medium">No hay productos disponibles</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {products.map((product, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03, duration: 0.2 }}
                                            className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:bg-slate-100 hover:border-slate-300 transition-all group"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-3 mb-1">
                                                        <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-medium">
                                                            {product.sku}
                                                        </span>
                                                        <span className="text-emerald-600 font-bold text-sm bg-emerald-50 px-2 py-0.5 rounded">
                                                            x{product.quantity}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-700 font-medium text-sm leading-relaxed">
                                                        {product.description}
                                                    </p>
                                                </div>
                                                {product.total > 0 && (
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-slate-900 font-bold text-lg">
                                                            L. {product.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                        <p className="text-slate-400 text-xs">
                                                            L. {(product.total / product.quantity).toFixed(2)} c/u
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {products.length > 0 && (
                            <div className="bg-slate-50 border-t border-slate-200 px-8 py-5 flex-shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="text-slate-600">
                                        <p className="text-sm font-medium">Total de productos diferentes:</p>
                                        <p className="text-2xl font-bold text-slate-900">{products.length}</p>
                                    </div>
                                    {totalAmount > 0 && (
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-slate-600 mb-1">Total del mes:</p>
                                            <p className="text-3xl font-bold text-indigo-600">
                                                L. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    )}
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
