import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

const GlassSelect = ({ value, onChange, options = [], position = 'down' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);
    const dropdownRef = useRef(null);
    const [coords, setCoords] = useState(null);

    const selectedOption = useMemo(() => {
        return options.find(opt => opt.value === value) || options[0];
    }, [value, options]);

    const updateCoords = () => {
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updateCoords();
            window.addEventListener('resize', updateCoords);
            window.addEventListener('scroll', updateCoords, true);
        }
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleOutside = (event) => {
            const clickedOnButton = wrapperRef.current && wrapperRef.current.contains(event.target);
            const clickedOnDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
            
            if (!clickedOnButton && !clickedOnDropdown) {
                setIsOpen(false);
            }
        };

        const handleEsc = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, []);

    const dropdownStyle = useMemo(() => {
        if (!coords) return { display: 'none' };
        
        const dropdownWidth = coords.width; // Match button width!
        const estimatedHeight = options.length * 36 + 16; // Estimate height based on option count
        const dropdownHeight = Math.min(estimatedHeight, 260); // Cap at max-h-[260px]
        const margin = 4;
        
        let top = 0;
        let left = coords.left;
        
        if (position === 'up') {
            top = coords.top - dropdownHeight - margin;
            if (top < 8) {
                top = coords.bottom + margin;
            }
        } else {
            top = coords.bottom + margin;
            if (top + dropdownHeight > window.innerHeight - 8) {
                top = coords.top - dropdownHeight - margin;
            }
        }
        
        return {
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${dropdownWidth}px`,
            zIndex: 9999
        };
    }, [coords, position, options]);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="w-full text-left text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-2.5 outline-none hover:border-indigo-400/60 dark:hover:border-indigo-500/50 hover:bg-white/80 dark:hover:bg-slate-900/80 transition-all text-slate-800 dark:text-white flex items-center justify-between gap-2 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.02)] active:scale-[0.99]"
            >
                <span className="truncate font-medium">
                    {selectedOption ? selectedOption.label : 'Seleccionar...'}
                </span>
                <ChevronDown size={16} className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div 
                    ref={dropdownRef}
                    style={dropdownStyle}
                    className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800/95 rounded-2xl shadow-[0_20px_50px_rgba(31,38,135,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.65)] p-2 max-h-[260px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    <div className="space-y-0.5">
                        {options.map((opt) => {
                            const isSelected = opt.value === value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-xl flex items-center justify-between transition-all ${
                                        isSelected
                                            ? 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 font-bold'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                                    }`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {isSelected && <Check size={14} className="text-indigo-500 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default GlassSelect;
