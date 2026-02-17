import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    startOfWeek
} from 'date-fns';
import { es } from 'date-fns/locale';

const WEEK_DAYS = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

const GlassDatePicker = ({ value, onChange, placeholder = 'dd/mm/aaaa' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const selectedDate = useMemo(() => {
        if (!value) return null;
        try {
            const parsed = parseISO(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
            return null;
        }
    }, [value]);

    const [viewDate, setViewDate] = useState(selectedDate || new Date());

    useEffect(() => {
        if (isOpen) {
            setViewDate(selectedDate || new Date());
        }
    }, [isOpen, selectedDate]);

    useEffect(() => {
        const handleOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
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

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="min-w-[140px] px-3 py-2 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/50 dark:border-slate-700/60 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-[0_8px_24px_rgba(31,38,135,0.14)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:border-indigo-300/60 dark:hover:border-indigo-500/50 transition-all flex items-center justify-between gap-2"
            >
                <span className={selectedDate ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}>
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : placeholder}
                </span>
                <Calendar size={14} className="text-indigo-500 dark:text-indigo-400" />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 z-[120] w-[290px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/50 dark:border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(31,38,135,0.25)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.55)] p-3">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <button
                            type="button"
                            onClick={() => setViewDate((prev) => addMonths(prev, -1))}
                            className="w-8 h-8 rounded-lg bg-white/60 dark:bg-slate-800/70 border border-white/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold capitalize text-slate-800 dark:text-slate-100">
                            {format(viewDate, 'MMMM yyyy', { locale: es })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setViewDate((prev) => addMonths(prev, 1))}
                            className="w-8 h-8 rounded-lg bg-white/60 dark:bg-slate-800/70 border border-white/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {WEEK_DAYS.map((label) => (
                            <div key={label} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 text-center py-1">
                                {label}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day) => {
                            const inMonth = isSameMonth(day, viewDate);
                            const selected = selectedDate && isSameDay(day, selectedDate);

                            return (
                                <button
                                    type="button"
                                    key={day.toISOString()}
                                    onClick={() => {
                                        onChange(format(day, 'yyyy-MM-dd'));
                                        setIsOpen(false);
                                    }}
                                    className={`h-8 rounded-lg text-xs font-semibold transition-all ${selected
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/40'
                                        : inMonth
                                            ? 'text-slate-700 dark:text-slate-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                                            : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                                        }`}
                                >
                                    {format(day, 'd')}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                            Borrar
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onChange(format(new Date(), 'yyyy-MM-dd'));
                                setIsOpen(false);
                            }}
                            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                        >
                            Hoy
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlassDatePicker;
