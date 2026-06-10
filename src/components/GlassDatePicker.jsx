import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    parseISO,
    startOfMonth,
    startOfWeek,
    startOfDay,
    isAfter
} from 'date-fns';
import { es } from 'date-fns/locale';

const WEEK_DAYS = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

const GlassDatePicker = ({ 
    value, 
    onChange, 
    placeholder = 'dd/mm/aaaa', 
    maxDate, 
    minDate,
    align = 'left',
    position = 'down' 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);
    const dropdownRef = useRef(null);
    const [coords, setCoords] = useState(null);

    const selectedDate = useMemo(() => {
        if (!value) return null;
        try {
            const parsed = parseISO(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
            return null;
        }
    }, [value]);

    const parsedMaxDate = useMemo(() => {
        if (!maxDate) return null;
        try {
            const parsed = typeof maxDate === 'string' ? parseISO(maxDate) : maxDate;
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
            return null;
        }
    }, [maxDate]);

    const parsedMinDate = useMemo(() => {
        if (!minDate) return null;
        try {
            const parsed = typeof minDate === 'string' ? parseISO(minDate) : minDate;
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
            return null;
        }
    }, [minDate]);

    const isDisabled = useMemo(() => {
        return (day) => {
            const dayStart = startOfDay(day);
            if (parsedMaxDate && isAfter(dayStart, startOfDay(parsedMaxDate))) {
                return true;
            }
            if (parsedMinDate && isAfter(startOfDay(parsedMinDate), dayStart)) {
                return true;
            }
            return false;
        };
    }, [parsedMaxDate, parsedMinDate]);

    const [viewDate, setViewDate] = useState(selectedDate || new Date());

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
            setViewDate(selectedDate || new Date());
            updateCoords();
            
            // Add scroll and resize listeners to reposition the portal dropdown
            window.addEventListener('resize', updateCoords);
            window.addEventListener('scroll', updateCoords, true);
        }
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }, [isOpen, selectedDate]);

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

    const monthStart = startOfMonth(viewDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    // Dynamic dropdown styles for Portal position
    const dropdownStyle = useMemo(() => {
        if (!coords) return { display: 'none' };
        
        const dropdownWidth = 300;
        const dropdownHeight = 330; // Approx calendar height
        const margin = 8;
        
        let top = 0;
        let left = 0;
        
        if (position === 'up') {
            top = coords.top - dropdownHeight - margin;
            if (top < margin) {
                top = coords.bottom + margin;
            }
        } else {
            top = coords.bottom + margin;
            if (top + dropdownHeight > window.innerHeight - margin) {
                top = coords.top - dropdownHeight - margin;
            }
        }
        
        if (align === 'right') {
            left = coords.left + coords.width - dropdownWidth;
            if (left < margin) {
                left = margin;
            }
        } else {
            left = coords.left;
            if (left + dropdownWidth > window.innerWidth - margin) {
                left = window.innerWidth - dropdownWidth - margin;
            }
        }
        
        return {
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${dropdownWidth}px`,
            zIndex: 9999
        };
    }, [coords, position, align]);

    return (
        <div ref={wrapperRef} className="relative w-full md:w-auto">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="w-full min-w-[140px] px-3.5 py-2 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:border-indigo-400/60 dark:hover:border-indigo-500/50 hover:bg-white/95 dark:hover:bg-slate-900/95 transition-all flex items-center justify-between gap-2.5 active:scale-[0.98]"
            >
                <span className={selectedDate ? 'text-slate-800 dark:text-slate-100 font-semibold' : 'text-slate-400 dark:text-slate-500'}>
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : placeholder}
                </span>
                <Calendar size={15} className="text-indigo-500 dark:text-indigo-400 opacity-80" />
            </button>

            {isOpen && createPortal(
                <div 
                    ref={dropdownRef}
                    style={dropdownStyle}
                    className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800/95 rounded-2xl shadow-[0_20px_50px_rgba(99,102,241,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] p-4 transition-all duration-200 ease-out animate-in fade-in"
                >
                    <div className="flex items-center justify-between mb-4 px-1">
                        <button
                            type="button"
                            onClick={() => setViewDate((prev) => addMonths(prev, -1))}
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/40 border border-slate-200/50 dark:border-slate-800/50 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-95 flex items-center justify-center shadow-sm"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold capitalize text-slate-800 dark:text-slate-100 tracking-wide">
                            {format(viewDate, 'MMMM yyyy', { locale: es })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setViewDate((prev) => addMonths(prev, 1))}
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/40 border border-slate-200/50 dark:border-slate-800/50 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-95 flex items-center justify-center shadow-sm"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEK_DAYS.map((label) => (
                            <div key={label} className="text-[10px] font-bold text-slate-400 dark:text-slate-500 text-center py-1 tracking-wider uppercase">
                                {label}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day) => {
                            const inMonth = isSameMonth(day, viewDate);
                            const selected = selectedDate && isSameDay(day, selectedDate);
                            const disabled = isDisabled(day);
                            const today = isSameDay(day, new Date());

                            return (
                                <button
                                    type="button"
                                    key={day.toISOString()}
                                    disabled={disabled}
                                    onClick={() => {
                                        if (disabled) return;
                                        onChange(format(day, 'yyyy-MM-dd'));
                                        setIsOpen(false);
                                    }}
                                    className={`h-8 rounded-xl text-xs font-semibold transition-all flex items-center justify-center relative ${
                                        selected
                                            ? 'bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md shadow-indigo-500/35 scale-105 font-bold'
                                            : disabled
                                                ? 'text-slate-300 dark:text-slate-700 opacity-25 cursor-not-allowed pointer-events-none'
                                                : today
                                                    ? 'text-indigo-600 dark:text-indigo-400 border border-indigo-500/40 bg-indigo-50/20 dark:bg-indigo-950/20 hover:scale-105 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/50 font-bold'
                                                    : inMonth
                                                        ? 'text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-105'
                                                        : 'text-slate-450 dark:text-slate-500 hover:bg-slate-100/40 dark:hover:bg-slate-800/40 hover:scale-105'
                                    }`}
                                >
                                    {format(day, 'd')}
                                    {today && !selected && (
                                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/65 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                        >
                            Borrar
                        </button>
                        <button
                            type="button"
                            disabled={isDisabled(new Date())}
                            onClick={() => {
                                if (isDisabled(new Date())) return;
                                onChange(format(new Date(), 'yyyy-MM-dd'));
                                setIsOpen(false);
                            }}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                isDisabled(new Date())
                                    ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50'
                                    : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                            }`}
                        >
                            Hoy
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default GlassDatePicker;
