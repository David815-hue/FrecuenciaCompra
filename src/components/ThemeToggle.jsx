import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = ({ theme, toggleTheme }) => {
    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className={`
                relative flex items-center justify-between gap-2 px-1 py-1 w-12 h-7 rounded-full transition-colors duration-300 shadow-inner
                ${isDark ? 'bg-slate-800' : 'bg-indigo-100'}
            `}
            aria-label="Alternar tema"
        >
            <motion.div
                className={`
                    absolute top-0.5 bottom-0.5 w-6 h-6 rounded-full shadow-sm flex items-center justify-center z-10
                    ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-indigo-50'}
                `}
                animate={{
                    x: isDark ? 20 : 0,
                    rotate: isDark ? 360 : 0
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                {isDark ? (
                    <Moon size={12} className="text-indigo-400" />
                ) : (
                    <Sun size={14} className="text-amber-500" />
                )}
            </motion.div>
        </button>
    );
};

export default ThemeToggle;
