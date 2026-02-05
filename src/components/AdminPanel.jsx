import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, UserPlus, Edit2, Trash2, Search, Shield, User, X,
    Loader2, CheckCircle, AlertCircle, Eye, EyeOff
} from 'lucide-react';
import { getAllUsers, createUser, updateUser, deleteUser } from '../utils/authUtils';
import { getGestoresByZona } from '../config/gestores';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all'); // 'all', 'admin', 'gestora'
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
    const [selectedUser, setSelectedUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        displayName: '',
        role: 'gestora'
    });
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Load users on mount
    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        const result = await getAllUsers();
        if (result.success) {
            setUsers(result.users);
        }
        setLoading(false);
    };

    // Filter users based on search and role
    const filteredUsers = users.filter(user => {
        const matchesSearch =
            user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.displayName.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesRole = filterRole === 'all' || user.role === filterRole;

        return matchesSearch && matchesRole;
    });

    const handleOpenCreateModal = () => {
        setModalMode('create');
        setSelectedUser(null);
        setFormData({
            username: '',
            password: '',
            displayName: '',
            role: 'gestora'
        });
        setFormError('');
        setShowModal(true);
    };

    const handleOpenEditModal = (user) => {
        setModalMode('edit');
        setSelectedUser(user);
        setFormData({
            username: user.username,
            password: '',
            displayName: user.displayName,
            role: user.role
        });
        setFormError('');
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setFormError('');
        setSelectedUser(null);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (formError) setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);

        try {
            // Validation
            if (modalMode === 'create') {
                if (!formData.username || !formData.password || !formData.displayName) {
                    throw new Error('Todos los campos son requeridos');
                }
                if (formData.password.length < 6) {
                    throw new Error('La contraseña debe tener al menos 6 caracteres');
                }
            }

            // Validate gestora name exists in gestores.js
            if (formData.role === 'gestora') {
                const allGestores = getGestoresByZona();
                const gestorExists = allGestores.some(g => g.nombre === formData.displayName);
                if (!gestorExists) {
                    throw new Error(`El nombre "${formData.displayName}" no corresponde a ningún gestor conocido en gestores.js`);
                }
            }

            let result;
            if (modalMode === 'create') {
                result = await createUser(formData);
            } else {
                const updates = {
                    displayName: formData.displayName,
                    role: formData.role
                };
                if (formData.password) {
                    if (formData.password.length < 6) {
                        throw new Error('La contraseña debe tener al menos 6 caracteres');
                    }
                    updates.password = formData.password;
                }
                result = await updateUser(selectedUser.id, updates);
            }

            if (result.success) {
                setSuccessMessage(modalMode === 'create' ? 'Usuario creado exitosamente' : 'Usuario actualizado exitosamente');
                setTimeout(() => setSuccessMessage(''), 3000);
                handleCloseModal();
                loadUsers();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            setFormError(error.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (user) => {
        const adminCount = users.filter(u => u.role === 'admin').length;

        if (user.role === 'admin' && adminCount <= 1) {
            alert('No puedes eliminar el último administrador del sistema');
            return;
        }

        if (!confirm(`¿Estás seguro de eliminar al usuario "${user.displayName}"?`)) {
            return;
        }

        const result = await deleteUser(user.id);
        if (result.success) {
            setSuccessMessage('Usuario eliminado exitosamente');
            setTimeout(() => setSuccessMessage(''), 3000);
            loadUsers();
        } else {
            alert('Error al eliminar usuario: ' + result.error);
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Success Toast */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-xl shadow-xl"
                    >
                        <CheckCircle size={20} />
                        <span className="font-medium">{successMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Users size={32} strokeWidth={2.5} />
                        Gestión de Usuarios
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Administra usuarios y permisos del sistema
                    </p>
                </div>
                <button
                    onClick={handleOpenCreateModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                >
                    <UserPlus size={20} />
                    Crear Usuario
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-slate-800 rounded-2xl p-4 mb-6 shadow-lg transition-colors duration-500">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="px-4 py-2.5 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                    >
                        <option value="all">Todos los roles</option>
                        <option value="admin">Administradores</option>
                        <option value="gestora">Gestoras</option>
                    </select>
                </div>
            </div>

            {/* Users List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={40} className="animate-spin text-indigo-600" />
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="text-center py-20">
                    <Users size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">
                        {searchTerm || filterRole !== 'all' ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredUsers.map((user) => (
                        <motion.div
                            key={user.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-slate-800 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-200"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${user.role === 'admin'
                                        ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                                        : 'bg-gradient-to-br from-indigo-500 to-violet-600'
                                        }`}>
                                        {user.displayName.charAt(0).toUpperCase()}
                                    </div>

                                    {/* User Info */}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                                {user.displayName}
                                            </h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${user.role === 'admin'
                                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                                                }`}>
                                                {user.role === 'admin' ? (
                                                    <span className="flex items-center gap-1">
                                                        <Shield size={12} />
                                                        Admin
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <User size={12} />
                                                        Gestora
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            @{user.username}
                                        </p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                            Creado: {new Date(user.createdAt).toLocaleDateString('es-HN')}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleOpenEditModal(user)}
                                        className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                                        title="Editar usuario"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(user)}
                                        className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                                        title="Eliminar usuario"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCloseModal}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {modalMode === 'create' ? 'Crear Usuario' : 'Editar Usuario'}
                                </h2>
                                <button
                                    onClick={handleCloseModal}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Username */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                        Usuario {modalMode === 'edit' && <span className="text-slate-400 text-xs">(no editable)</span>}
                                    </label>
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleFormChange}
                                        disabled={modalMode === 'edit' || formLoading}
                                        required={modalMode === 'create'}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        placeholder="usuario123"
                                    />
                                </div>

                                {/* Password */}
                                {(modalMode === 'create' || modalMode === 'edit') && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                            Contraseña {modalMode === 'edit' && <span className="text-slate-400 font-normal text-xs">(Opcional)</span>}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                name="password"
                                                value={formData.password}
                                                onChange={handleFormChange}
                                                disabled={formLoading}
                                                required={modalMode === 'create'}
                                                className="w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                placeholder={modalMode === 'create' ? "Mínimo 6 caracteres" : "Dejar en blanco para mantener actual"}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Display Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                        Nombre Completo
                                    </label>
                                    <input
                                        type="text"
                                        name="displayName"
                                        value={formData.displayName}
                                        onChange={handleFormChange}
                                        disabled={formLoading}
                                        required
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        placeholder="Ej: Karen Lino"
                                    />
                                    {formData.role === 'gestora' && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            Debe coincidir exactamente con un nombre en gestores.js
                                        </p>
                                    )}
                                </div>

                                {/* Role */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                        Rol
                                    </label>
                                    <select
                                        name="role"
                                        value={formData.role}
                                        onChange={handleFormChange}
                                        disabled={formLoading}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-all"
                                    >
                                        <option value="gestora">Gestora</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>

                                {/* Error Message */}
                                {formError && (
                                    <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-400 text-sm">
                                        <AlertCircle size={16} className="flex-shrink-0" />
                                        <span>{formError}</span>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        disabled={formLoading}
                                        className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={formLoading}
                                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {formLoading ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Guardando...
                                            </>
                                        ) : (
                                            modalMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminPanel;
