import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Laptop, 
  Server, 
  Network, 
  Printer, 
  Search, 
  Filter, 
  Plus, 
  Download, 
  RefreshCw, 
  Trash2, 
  Edit, 
  AlertTriangle, 
  CheckCircle, 
  FileText, 
  Terminal, 
  X, 
  Save, 
  Undo, 
  Eye, 
  Monitor, 
  Info,
  Cpu,
  CornerDownRight,
  Database,
  ArrowUpDown,
  Layers,
  Key,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Brain
} from 'lucide-react';
import { Asset, AssetCategory, AssetStatus, InventoryStats, SoftwareItem, Organization } from './types';
import StatsDashboard from './components/StatsDashboard';
import AdminTerminalLog, { LogEntry } from './components/AdminTerminalLog';
import AssetFormModal from './components/AssetFormModal';
import PCAuditorScript from './components/PCAuditorScript';
import AssetSoftwareManager from './components/AssetSoftwareManager';
import LoginScreen from './components/LoginScreen';
import OrganizationManagerModal from './components/OrganizationManagerModal';
import ObsolescencePanel from './components/ObsolescencePanel';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export default function App() {
  // --- STATE ---
  const [token, setToken] = useState<string>(() => localStorage.getItem('admin_token') || '');
  const [role, setRole] = useState<string>(() => localStorage.getItem('admin_role') || 'admin');
  const [orgId, setOrgId] = useState<number | null>(() => {
    const saved = localStorage.getItem('admin_org_id');
    return saved ? Number(saved) : null;
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('Todos');

  // Super Admin Organizations CRUD State
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgUser, setNewOrgUser] = useState('');
  const [newOrgPass, setNewOrgPass] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgUser, setEditOrgUser] = useState('');
  const [editOrgPass, setEditOrgPass] = useState('');
  const [editOrgDesc, setEditOrgDesc] = useState('');
  const [orgError, setOrgError] = useState<string | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('Todos');
  const [filterPendingManual, setFilterPendingManual] = useState(false);
  const [sortField, setSortField] = useState<keyof Asset>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // Administrative log entries
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected row for inspection panel
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);

  // Asset being analyzed for obsolescence with AI
  const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);

  const API_BASE = '/api';

  const handleLoginSuccess = (newToken: string, newRole: string, newOrgId?: number) => {
    localStorage.setItem('admin_token', newToken);
    localStorage.setItem('admin_role', newRole);
    setToken(newToken);
    setRole(newRole);
    if (newOrgId !== undefined) {
      localStorage.setItem('admin_org_id', String(newOrgId));
      setOrgId(newOrgId);
    } else {
      localStorage.removeItem('admin_org_id');
      setOrgId(null);
    }
  };

  const handleLogout = useCallback(async () => {
    const tokenToRevoke = localStorage.getItem('admin_token') || token;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_org_id');
    setToken('');
    setRole('admin');
    setOrgId(null);
    setAssets([]);
    setSelectedOrgFilter('Todos');
    if (tokenToRevoke) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenToRevoke}` }
        });
      } catch (e) {
        // Ignore network errors on logout
      }
    }
  }, [token]);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const defaultHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
    const mergedInit: RequestInit = {
      ...init,
      credentials: 'include', // Enforce cookies support (C-08)
      headers: {
        ...defaultHeaders,
        ...init?.headers,
      }
    };

    try {
      const res = await fetch(input, mergedInit);
      if (res.status === 401) {
        handleLogout();
        addLog('Sesión expirada o no autorizada. Por favor, inicia sesión de nuevo.', 'error');
        throw new Error('Unauthorized');
      }
      return res;
    } catch (err) {
      throw err;
    }
  }, [token, handleLogout]);

  // --- FETCH ORGANIZATIONS FROM API ---
  const fetchOrganizations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authenticatedFetch(`${API_BASE}/organizations`);
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
      }
    } catch (e) {
      console.error('Error fetching organizations:', e);
    }
  }, [token, authenticatedFetch]);

  // --- FETCH ASSETS FROM API ON MOUNT ---
  const fetchAssets = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await authenticatedFetch(`${API_BASE}/assets`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAssets(data);
        addLog('Base de datos de inventario cargada.', 'success');
      } else if (data && data.error) {
        addLog(`Error del servidor de base de datos: ${data.error}`, 'error');
      } else {
        addLog('Respuesta inesperada del servidor.', 'error');
      }
    } catch (e) {
      if ((e as Error).message !== 'Unauthorized') {
        addLog('Error conectando al servidor. Verifique que el API esté corriendo.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [token, authenticatedFetch]);

  useEffect(() => {
    if (token) {
      fetchAssets();
      fetchOrganizations();
    }
  }, [token, fetchAssets, fetchOrganizations]);

  // --- SUPER ADMIN ORGANIZATIONS CRUD HANDLERS ---
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) {
      setOrgError('El nombre de la organización es requerido.');
      return;
    }
    if (!newOrgUser.trim()) {
      setOrgError('El nombre de usuario administrador es requerido.');
      return;
    }
    if (!newOrgPass.trim()) {
      setOrgError('La contraseña administradora es requerida.');
      return;
    }
    setOrgError(null);
    try {
      const res = await authenticatedFetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newOrgName.trim(), 
          username: newOrgUser.trim(), 
          password: newOrgPass.trim(), 
          description: newOrgDesc.trim() 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewOrgName('');
        setNewOrgUser('');
        setNewOrgPass('');
        setNewOrgDesc('');
        await fetchOrganizations();
        addLog(`Organización "${newOrgName.trim()}" creada con éxito.`, 'success');
      } else {
        setOrgError(data.error || 'Error creando organización.');
      }
    } catch (err) {
      setOrgError('Error de conexión al crear organización.');
    }
  };

  const handleUpdateOrg = async (id: number) => {
    if (!editOrgName.trim()) {
      setOrgError('El nombre de la organización es requerido.');
      return;
    }
    if (!editOrgUser.trim()) {
      setOrgError('El nombre de usuario administrador es requerido.');
      return;
    }
    setOrgError(null);
    try {
      const res = await authenticatedFetch(`${API_BASE}/organizations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editOrgName.trim(), 
          username: editOrgUser.trim(), 
          password: editOrgPass.trim(), 
          description: editOrgDesc.trim() 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingOrgId(null);
        setEditOrgPass('');
        await fetchOrganizations();
        await fetchAssets();
        addLog(`Organización ID ${id} modificada con éxito.`, 'info');
      } else {
        setOrgError(data.error || 'Error modificando organización.');
      }
    } catch (err) {
      setOrgError('Error de conexión al modificar organización.');
    }
  };

  const handleDeleteOrg = async (id: number, nameOrg: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la organización "${nameOrg}"?\nATENCIÓN: Se borrarán permanentemente TODOS los equipos y licencias asociados a esta organización.`)) {
      return;
    }
    setOrgError(null);
    try {
      const res = await authenticatedFetch(`${API_BASE}/organizations/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchOrganizations();
        await fetchAssets();
        addLog(`Organización "${nameOrg}" y todo su inventario eliminados con éxito.`, 'warning');
      } else {
        setOrgError(data.error || 'Error eliminando organización.');
      }
    } catch (err) {
      setOrgError('Error de conexión al eliminar organización.');
    }
  };

  const startEditOrg = (org: Organization) => {
    setEditingOrgId(org.id);
    setEditOrgName(org.name);
    setEditOrgUser(org.username || '');
    setEditOrgPass('');
    setEditOrgDesc(org.description || '');
  };

  // --- LOGGING UTILITY ---
  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('es-CL', { hour12: false });
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      level,
      message
    };
    setLogs(prev => [...prev, newLog]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // --- STATS CALCULATION ---
  const statsAssets = useMemo(() => {
    if (role === 'super_admin' && selectedOrgFilter !== 'Todos') {
      return assets.filter(a => String(a.organizationId) === selectedOrgFilter);
    }
    return assets;
  }, [assets, role, selectedOrgFilter]);

  const stats = useMemo<InventoryStats>(() => {
    const emptyStats: InventoryStats = {
      totalAssets: statsAssets.length,
      assignedCount: 0,
      unassignedCount: 0,
      pendingClassification: 0,
      byCategory: {
        'Computador': 0,
        'Portátil': 0,
        'Servidor': 0,
        'Redes': 0,
        'Impresora': 0,
        'Monitoreo / Seguridad': 0,
        'Otro': 0
      },
      byStatus: {
        'Operativo': 0,
        'En Mantenimiento': 0,
        'En Stock': 0,
        'Dado de Baja': 0
      }
    };

    statsAssets.forEach(asset => {
      // Manual columns filled condition (Check if Cargo or Responsable or Ubicación is filled)
      const hasCargo = asset.cargo && asset.cargo.trim().length > 0;
      const hasResponsable = asset.responsable && asset.responsable.trim().length > 0;
      const hasUbicacion = asset.ubicacion && asset.ubicacion.trim().length > 0;

      if (hasCargo && hasResponsable && hasUbicacion) {
        emptyStats.assignedCount++;
      } else {
        emptyStats.unassignedCount++;
      }

      if (!hasCargo || !hasResponsable || !hasUbicacion) {
        emptyStats.pendingClassification++;
      }

      emptyStats.byCategory[asset.category] = (emptyStats.byCategory[asset.category] || 0) + 1;
      emptyStats.byStatus[asset.status] = (emptyStats.byStatus[asset.status] || 0) + 1;
    });

    return emptyStats;
  }, [statsAssets]);

  // --- NEXT ID GENERATOR ---
  const nextId = useMemo(() => {
    if (assets.length === 0) return 'TI-001';
    const ids = assets.map(a => {
      const num = parseInt(a.id.replace('TI-', ''), 10);
      return isNaN(num) ? 0 : num;
    });
    const maxNum = Math.max(...ids);
    const nextNum = maxNum + 1;
    return `TI-${String(nextNum).padStart(3, '0')}`;
  }, [assets]);

  // --- FILTER & SORT LOGIC ---
  const filteredAssets = useMemo(() => {
    let result = [...assets];

    // Organization filter (Super Admin only)
    if (role === 'super_admin' && selectedOrgFilter !== 'Todos') {
      result = result.filter(a => String(a.organizationId) === selectedOrgFilter);
    }

    // Category
    if (selectedCategory !== 'Todos') {
      result = result.filter(a => a.category === selectedCategory);
    }

    // Status
    if (selectedStatus !== 'Todos') {
      result = result.filter(a => a.status === selectedStatus);
    }

    // Pending Manual input check (At least one of cargo, responsable, or ubicacion is empty)
    if (filterPendingManual) {
      result = result.filter(a => {
        return !a.cargo?.trim() || !a.responsable?.trim() || !a.ubicacion?.trim();
      });
    }

    // Search query (Fuzzy search multiple fields)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(a => 
        a.id.toLowerCase().includes(q) ||
        a.brand.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.ipAddress.toLowerCase().includes(q) ||
        a.macAddress.toLowerCase().includes(q) ||
        a.specification.toLowerCase().includes(q) ||
        a.cargo.toLowerCase().includes(q) ||
        a.responsable.toLowerCase().includes(q) ||
        a.ubicacion.toLowerCase().includes(q) ||
        (a.notes && a.notes.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      let fieldA = a[sortField]?.toString().toLowerCase() || '';
      let fieldB = b[sortField]?.toString().toLowerCase() || '';
      
      // Handle prefix ID custom sorting if sorted by ID
      if (sortField === 'id') {
        const numA = parseInt(a.id.replace('TI-', ''), 10);
        const numB = parseInt(b.id.replace('TI-', ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortOrder === 'asc' ? numA - numB : numB - numA;
        }
      }

      if (fieldA < fieldB) return sortOrder === 'asc' ? -1 : 1;
      if (fieldA > fieldB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [assets, searchQuery, selectedCategory, selectedStatus, filterPendingManual, sortField, sortOrder, role, selectedOrgFilter]);

  const handleSort = (field: keyof Asset) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // --- ACTIONS ---

  // Inline edit handler for Cargo, Responsable, Ubicación
  const handleInlineEdit = (id: string, field: 'cargo' | 'responsable' | 'ubicacion', value: string) => {
    setAssets(prev => prev.map(asset =>
      asset.id === id ? { ...asset, [field]: value } : asset
    ));
  };

  const handleInlineEditBlur = async (id: string, field: string, value: string) => {
    try {
      const body: Record<string, string> = {};
      const asset = assets.find(a => a.id === id);
      if (!asset) return;
      body.cargo = asset.cargo;
      body.responsable = asset.responsable;
      body.ubicacion = asset.ubicacion;
      await authenticatedFetch(`${API_BASE}/assets/${id}/manual`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      addLog(`Columna manual "${field.toUpperCase()}" de ${id} actualizada a: "${value || '(vacío)'}"`, 'info');
    } catch (e) {
      addLog(`Error guardando columna manual: ${id}`, 'error');
    }
  };

  // Add or update asset from Modal
  const handleSaveAsset = async (asset: Asset) => {
    try {
      const exists = assets.some(a => a.id === asset.id);
      if (exists) {
        await authenticatedFetch(`${API_BASE}/assets/${asset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asset),
        });
        setAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
        addLog(`Registro de equipo modificado con éxito: ${asset.id} (${asset.brand} ${asset.model})`, 'success');
      } else {
        await authenticatedFetch(`${API_BASE}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asset),
        });
        setAssets(prev => [...prev, asset]);
        addLog(`Nuevo equipo registrado con el código: ${asset.id} (${asset.brand} ${asset.model})`, 'success');
      }
    } catch (e) {
      addLog('Error guardando equipo en el servidor.', 'error');
    }
    setIsModalOpen(false);
    setEditingAsset(null);
  };

  // Import Asset from Automated Script JSON
  const handleImportAsset = async (importedData: Partial<Asset>) => {
    try {
      const existingIndex = assets.findIndex(
        (a) => a.serialNumber?.trim().toLowerCase() === importedData.serialNumber?.trim().toLowerCase()
      );

      if (existingIndex !== -1) {
        const existingAsset = assets[existingIndex];
        const updatedAsset: Asset = {
          ...existingAsset,
          ...importedData,
          cargo: existingAsset.cargo?.trim() || importedData.cargo || '',
          responsable: existingAsset.responsable?.trim() || importedData.responsable || '',
          ubicacion: existingAsset.ubicacion?.trim() || importedData.ubicacion || '',
        } as Asset;
        await authenticatedFetch(`${API_BASE}/assets/${existingAsset.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedAsset),
        });
        setAssets(prev => prev.map(a => a.id === existingAsset.id ? updatedAsset : a));
        addLog(`Equipo preexistente actualizado con reporte de auditoría (Código: ${existingAsset.id}, S/N: ${importedData.serialNumber})`, 'success');
      } else {
        const res = await authenticatedFetch(`${API_BASE}/next-id`);
        const { nextId: newId } = await res.json();
        const newAsset: Asset = {
          category: importedData.category || 'Computador',
          brand: importedData.brand || 'Genérica',
          model: importedData.model || 'Desconocido',
          serialNumber: importedData.serialNumber || 'S/N-AUTODETECT',
          ipAddress: importedData.ipAddress || '',
          macAddress: importedData.macAddress || '',
          status: importedData.status || 'Operativo',
          specification: importedData.specification || '',
          purchaseDate: importedData.purchaseDate || new Date().toISOString().substring(0, 10),
          cargo: importedData.cargo || '',
          responsable: importedData.responsable || '',
          ubicacion: importedData.ubicacion || '',
          id: newId,
          software: importedData.software || [],
        };
        await authenticatedFetch(`${API_BASE}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAsset),
        });
        setAssets(prev => [...prev, newAsset]);
        addLog(`Nuevo equipo registrado vía Auditoría de PC (Código: ${newAsset.id}, S/N: ${importedData.serialNumber})`, 'success');
      }
    } catch (e) {
      addLog('Error importando equipo desde auditoría.', 'error');
    }
  };

  // --- SOFTWARE MANAGEMENT FUNCTIONS ---
  const handleAddSoftwareToAsset = async (assetId: string, newSoftware: SoftwareItem) => {
    try {
      if (assets.find(a => a.id === assetId)?.software?.some(s => s.name.toLowerCase() === newSoftware.name.toLowerCase())) {
        addLog(`El software "${newSoftware.name}" ya se encuentra registrado en este dispositivo.`, 'warning');
        return;
      }
      await authenticatedFetch(`${API_BASE}/assets/${assetId}/software`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSoftware),
      });
      setAssets(prev => prev.map(a =>
        a.id === assetId ? { ...a, software: [...(a.software || []), newSoftware] } : a
      ));
      addLog(`Software "${newSoftware.name}" registrado correctamente en el equipo ${assetId}.`, 'success');
    } catch (e) {
      addLog('Error registrando software.', 'error');
    }
  };

  const handleToggleSoftwareLicense = async (assetId: string, softwareName: string) => {
    try {
      await authenticatedFetch(`${API_BASE}/assets/${assetId}/software/${encodeURIComponent(softwareName)}/toggle`, {
        method: 'PATCH',
      });
      setAssets(prev => prev.map(a =>
        a.id === assetId
          ? {
              ...a,
              software: a.software?.map(s =>
                s.name === softwareName
                  ? { ...s, licensed: !s.licensed, licenseType: !s.licensed ? 'Comercial/Licencia Activa' : 'Sin Licenciar/Demo' }
                  : s
              )
            }
          : a
      ));
      addLog(`Licenciamiento del software: "${softwareName}" en equipo ${assetId} cambiado.`, 'info');
    } catch (e) {
      addLog('Error alternando licencia.', 'error');
    }
  };

  const handleRemoveSoftwareFromAsset = async (assetId: string, softwareName: string) => {
    try {
      await authenticatedFetch(`${API_BASE}/assets/${assetId}/software/${encodeURIComponent(softwareName)}`, {
        method: 'DELETE',
      });
      setAssets(prev => prev.map(a =>
        a.id === assetId ? { ...a, software: a.software?.filter(s => s.name !== softwareName) } : a
      ));
      addLog(`Software "${softwareName}" quitado del equipo ${assetId}.`, 'warning');
    } catch (e) {
      addLog('Error eliminando software.', 'error');
    }
  };

  const handleAutoProvisionRecommendedSoftware = async (assetId: string, category: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE}/assets/${assetId}/software/provision`, {
        method: 'POST',
      });
      const data = await res.json();
      setAssets(prev => prev.map(a =>
        a.id === assetId ? { ...a, software: data.software } : a
      ));
      addLog(`Sincronización de suite de software estándar aplicada al equipo ${assetId}.`, 'success');
    } catch (e) {
      addLog('Error provisionando software.', 'error');
    }
  };

  // Delete inventory item
  const handleDeleteAsset = async (id: string) => {
    const assetToDelete = assets.find(a => a.id === id);
    if (!assetToDelete) return;

    if (window.confirm(`¿Está seguro de que desea eliminar el equipo de inventario ${id} (${assetToDelete.brand} ${assetToDelete.model})?`)) {
      try {
        await authenticatedFetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' });
        setAssets(prev => prev.filter(a => a.id !== id));
        addLog(`Equipo eliminado permanente del inventario: ${id}`, 'warning');
        if (inspectedAssetId === id) setInspectedAssetId(null);
      } catch (e) {
        addLog('Error eliminando equipo.', 'error');
      }
    }
  };

  // Reset defaults
  const handleResetDefaults = async () => {
    if (window.confirm('¿Está seguro de que desea ELIMINAR todos los activos del inventario? Esta acción no se puede deshacer y dejará el inventario vacío.')) {
      const passcode = window.prompt('Para continuar, introduzca el CÓDIGO DE VERIFICACIÓN de seguridad (RESET_PASSCODE):');
      if (passcode === null) return; // Cancelled
      if (!passcode.trim()) {
        alert('Debe ingresar un código válido.');
        return;
      }
      try {
        const res = await authenticatedFetch(`${API_BASE}/reset`, { 
          method: 'POST',
          headers: {
            'X-Confirm-Reset': 'confirm-delete-all-assets',
            'X-Reset-Passcode': passcode.trim()
          }
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Código incorrecto');
        }
        await fetchAssets();
        setSearchQuery('');
        setSelectedCategory('Todos');
        setSelectedStatus('Todos');
        setFilterPendingManual(false);
        setSelectedOrgFilter('Todos');
        setInspectedAssetId(null);
        addLog('Inventario limpiado completamente. Todos los activos han sido eliminados.', 'warning');
      } catch (e: any) {
        addLog(`Error restableciendo inventario: ${e.message}`, 'error');
        alert(`Error restableciendo inventario: ${e.message}`);
      }
    }
  };

  // --- EXPORTS ---

  // High Fidelity Excel Export utilizing XLSX SheetJS
  const handleExportToExcel = () => {
    try {
      const excelRows = assets.map(item => ({
        'Código de Activo': item.id,
        'Categoría': item.category,
        'Marca': item.brand,
        'Modelo': item.model,
        'Número de Serie (S/N)': item.serialNumber,
        'Especificación Técnica': item.specification,
        'Dirección IP': item.ipAddress || 'Sin IP',
        'Dirección MAC': item.macAddress || 'Sin MAC',
        'Fecha Adquisición': item.purchaseDate,
        'Estado': item.status,
        'Organización': item.organizationName || '',
        'Observaciones': item.notes || '',
        // The three manual fill columns clearly designated
        'CARGO RESPONSAL (Llenado Manual)': item.cargo || '',
        'RESPONSABLE (Llenado Manual)': item.responsable || '',
        'UBICACIÓN FÍSICA (Llenado Manual)': item.ubicacion || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      
      // Auto-fit column widths
      const colWidths = Object.keys(excelRows[0] || {}).map(key => {
        const maxLength = Math.max(
          key.length,
          ...excelRows.map(row => String((row as any)[key] || '').length)
        );
        return { wch: maxLength + 3 };
      });
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario_TI');
      
      // Trigger download
      XLSX.writeFile(workbook, `Invetario_TI_Control_Admin_${new Date().toISOString().split('T')[0]}.xlsx`);
      addLog('Exportación Excel completada. Archivo generado con columnas manuales y técnicas.', 'success');
    } catch (e: any) {
      addLog(`Error exportando a Excel: ${e.message}`, 'error');
    }
  };

  // High Fidelity PDF export utilizing jsPDF
  const handleExportToPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const PAGE_W = 297;
      const PAGE_H = 210;
      const TABLE_X = 10;
      const TABLE_W = 277;
      const MARGIN_BOTTOM = 12;
      const ROW_PAD = 2;
      const FONT_SIZE = 7;
      const LINE_H = 3.6;    // altura de una linea de texto a 7pt

      const title = 'REPORTE MAESTRO DE INVENTARIO INFORMATICO Y ASIGNACION';
      const subtitle = `Generado: ${new Date().toLocaleString('es-ES')}`;
      const isSuperAdminPDF = role === 'super_admin';

      const cols = isSuperAdminPDF ? [
        { label: 'ID',                x: TABLE_X,       w: 11 },
        { label: 'Categoria / Modelo',x: TABLE_X + 11,  w: 40 },
        { label: 'Organizacion',      x: TABLE_X + 51,  w: 28 },
        { label: 'Num. Serie',        x: TABLE_X + 79,  w: 25 },
        { label: 'IP / MAC Red',      x: TABLE_X + 104, w: 34 },
        { label: 'Estado',            x: TABLE_X + 138, w: 18 },
        { label: 'Cargo Custodio',    x: TABLE_X + 156, w: 25 },
        { label: 'Responsable',       x: TABLE_X + 181, w: 25 },
        { label: 'Ubicacion',         x: TABLE_X + 206, w: 25 },
        { label: 'Observaciones',     x: TABLE_X + 231, w: 46 },
      ] : [
        { label: 'ID',                x: TABLE_X,       w: 11 },
        { label: 'Categoria / Modelo',x: TABLE_X + 11,  w: 55 },
        { label: 'Num. Serie',        x: TABLE_X + 66,  w: 28 },
        { label: 'IP / MAC Red',      x: TABLE_X + 94,  w: 40 },
        { label: 'Estado',            x: TABLE_X + 134, w: 18 },
        { label: 'Cargo Custodio',    x: TABLE_X + 152, w: 28 },
        { label: 'Responsable',       x: TABLE_X + 180, w: 28 },
        { label: 'Ubicacion Fisica',  x: TABLE_X + 208, w: 27 },
        { label: 'Observaciones',     x: TABLE_X + 235, w: 42 },
      ];

      // Divide texto en lineas segun el ancho de la columna
      const getLines = (text: string, colW: number): string[] => {
        doc.setFontSize(FONT_SIZE);
        return doc.splitTextToSize(text || '-', colW - 2) as string[];
      };

      const drawPageHeader = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, PAGE_W, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(title, TABLE_X, 10);
        doc.setTextColor(180, 190, 200);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(subtitle, TABLE_X, 17);
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.8);
        doc.line(0, 22, PAGE_W, 22);
      };

      const drawTableHeader = (y: number): number => {
        const H = 8;
        doc.setFillColor(30, 41, 59);
        doc.rect(TABLE_X, y, TABLE_W, H, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(FONT_SIZE);
        doc.setFont('Helvetica', 'bold');
        cols.forEach(col => { doc.text(col.label, col.x + 1, y + 5.2); });
        return y + H;
      };

      drawPageHeader();

      // Caja de metricas
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(TABLE_X, 26, TABLE_W, 10, 'FD');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8);
      doc.setFont('Helvetica', 'bold');
      doc.text('Metricas del Inventario:', TABLE_X + 2, 33);
      doc.setFont('Helvetica', 'normal');
      doc.text(
        `Total Activos: ${stats.totalAssets}   Asignados: ${stats.assignedCount}   Sin Asignar: ${stats.unassignedCount}   Pendientes: ${stats.pendingClassification}`,
        TABLE_X + 48, 33
      );

      let y = drawTableHeader(40);

      filteredAssets.forEach((asset, idx) => {
        const catModel = `${asset.category} - ${asset.brand} ${asset.model}`;

        // Calcular lineas de cada columna para determinar la altura de la fila
        doc.setFontSize(FONT_SIZE);
        const catLines    = getLines(catModel, cols[1].w);
        const notesCol    = isSuperAdminPDF ? cols[9] : cols[8];
        const notesLines  = getLines(asset.notes || '-', notesCol.w);
        // IP y MAC en 2 sublíneas fijas
        const maxLines    = Math.max(catLines.length, notesLines.length, 2);
        const ROW_H       = maxLines * LINE_H + ROW_PAD * 2;

        // Salto de pagina
        if (y + ROW_H > PAGE_H - MARGIN_BOTTOM) {
          doc.addPage();
          drawPageHeader();
          y = drawTableHeader(26);
        }

        // Fondo zebra
        doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
        doc.rect(TABLE_X, y, TABLE_W, ROW_H, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(TABLE_X, y + ROW_H, TABLE_X + TABLE_W, y + ROW_H);

        const textY = y + ROW_PAD + LINE_H;

        // ID (siempre negrita)
        doc.setTextColor(30, 41, 59);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(FONT_SIZE);
        doc.text(asset.id, cols[0].x + 1, textY);
        doc.setFont('Helvetica', 'normal');

        // Categoria / Modelo — MULTILINEA COMPLETA
        doc.setTextColor(15, 23, 42);
        doc.text(catLines, cols[1].x + 1, textY);
        doc.setTextColor(30, 41, 59);

        if (isSuperAdminPDF) {
          const orgLines = getLines(asset.organizationName || '-', cols[2].w);
          doc.text(orgLines.slice(0, 2), cols[2].x + 1, textY);
          doc.text(getLines(asset.serialNumber, cols[3].w)[0], cols[3].x + 1, textY);

          // IP linea 1, MAC linea 2 (gris)
          doc.text(getLines(asset.ipAddress || 'S/IP', cols[4].w)[0], cols[4].x + 1, textY);
          doc.setFontSize(FONT_SIZE - 0.5);
          doc.setTextColor(100, 116, 139);
          doc.text(getLines(asset.macAddress || 'S/MAC', cols[4].w)[0], cols[4].x + 1, textY + LINE_H + 0.3);
          doc.setFontSize(FONT_SIZE);
          doc.setTextColor(30, 41, 59);

          doc.text(getLines(asset.status, cols[5].w)[0],           cols[5].x + 1, textY);
          doc.setFont('Helvetica', 'bold');
          doc.text(getLines(asset.cargo || '-', cols[6].w)[0],     cols[6].x + 1, textY);
          doc.text(getLines(asset.responsable || '-', cols[7].w)[0], cols[7].x + 1, textY);
          doc.text(getLines(asset.ubicacion || '-', cols[8].w)[0], cols[8].x + 1, textY);
          doc.setFont('Helvetica', 'normal');
          doc.text(notesLines.slice(0, maxLines), cols[9].x + 1, textY);

        } else {
          doc.text(getLines(asset.serialNumber, cols[2].w)[0],     cols[2].x + 1, textY);

          // IP linea 1, MAC linea 2 (gris)
          doc.text(getLines(asset.ipAddress || 'S/IP', cols[3].w)[0], cols[3].x + 1, textY);
          doc.setFontSize(FONT_SIZE - 0.5);
          doc.setTextColor(100, 116, 139);
          doc.text(getLines(asset.macAddress || 'S/MAC', cols[3].w)[0], cols[3].x + 1, textY + LINE_H + 0.3);
          doc.setFontSize(FONT_SIZE);
          doc.setTextColor(30, 41, 59);

          doc.text(getLines(asset.status, cols[4].w)[0],           cols[4].x + 1, textY);
          doc.setFont('Helvetica', 'bold');
          doc.text(getLines(asset.cargo || '-', cols[5].w)[0],     cols[5].x + 1, textY);
          doc.text(getLines(asset.responsable || '-', cols[6].w)[0], cols[6].x + 1, textY);
          doc.text(getLines(asset.ubicacion || '-', cols[7].w)[0], cols[7].x + 1, textY);
          doc.setFont('Helvetica', 'normal');
          doc.text(notesLines.slice(0, maxLines), cols[8].x + 1, textY);
        }

        y += ROW_H;
      });

      // Pie de pagina en todas las paginas
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Pagina ${i} de ${pageCount}  |  Acceso de Administrador Autorizado`, TABLE_X, PAGE_H - 4);
        doc.text('SISTEMA DE INVENTARIO TI - DOCUMENTO CONFIDENCIAL', 195, PAGE_H - 4);
      }

      doc.save(`Inventario_TI_Reporte_${new Date().toISOString().split('T')[0]}.pdf`);
      addLog('Reporte de Auditoria PDF exportado correctamente.', 'success');
    } catch (e: any) {
      addLog(`Error generando reporte PDF: ${e.message}`, 'error');
    }
  };


  // Trigger standard browser window print (Highly useful option for landscape clean outputs)
  const handlePrintSystem = () => {
    addLog('Invocada cola de impresión del sistema. Preparando formato de página.', 'info');
    window.print();
  };

  const inspectedAsset = useMemo(() => {
    return assets.find(a => a.id === inspectedAssetId) || null;
  }, [assets, inspectedAssetId]);

  if (!token) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} apiUrl={API_BASE} />;
  }

  return (
    <div id="admin-inventory-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* 1. PC ADMINISTRATOR STYLE TOP NAV BAR */}
      <header id="admin-header" className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-40 print:hidden shadow-md">
        <div className="max-w-[95%] xl:max-w-[1550px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Brand/Indicator */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium tracking-tight text-white px-2 py-0.5 bg-slate-800 rounded border border-slate-700">
                  PC-ADMIN-NODE01
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-[10px] font-mono text-emerald-400">SYS_ADMIN_ENGAGED</span>
              </div>
              <h1 className="text-lg font-sans font-extrabold text-white tracking-tight mt-0.5 flex flex-wrap items-center gap-2">
                <span>Consola General de Inventario Informático</span>
                {role !== 'super_admin' && orgId && (
                  <span className="text-xs font-mono font-medium tracking-tight text-emerald-400 px-2.5 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/25">
                    {organizations.find(o => o.id === orgId)?.name || 'Organización'}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* User profile & Actions */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="text-right hidden md:block">
              <p className="text-xs font-medium text-slate-200">
                {role === 'super_admin' ? 'Super Administrador' : 'Administrador de TI'}
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="text-[10px] font-mono text-emerald-400 hover:text-emerald-350 underline cursor-pointer bg-transparent border-0 p-0 mt-0.5"
              >
                Cerrar Sesión
              </button>
            </div>
            <div className="h-8 w-px bg-slate-800 hidden md:block"></div>
            
            {role !== 'super_admin' && (
              <button
                id="btn-restablecer"
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-lg transition text-xs font-medium"
                title="Limpiar inventario (eliminar todos los activos)"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Limpiar Inventario</span>
              </button>
            )}

            {role !== 'super_admin' && (
              <button
                id="btn-nuevo-activo"
                type="button"
                onClick={() => {
                  setEditingAsset(null);
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 font-semibold text-slate-950 rounded-lg transition text-xs shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Activo TI</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 max-w-[95%] xl:max-w-[1550px] w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {role === 'super_admin' ? (
          <div className="space-y-6">
            {/* Super Admin Welcome Banner */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-start gap-4 shadow-lg">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white font-sans">Portal Global de Super Administrador</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Desde este panel de control puede dar de alta, modificar y eliminar las organizaciones de la plataforma. 
                  Tenga en cuenta que al eliminar una organización se eliminará **toda su base de datos de inventario y software asociado en cascada**.
                </p>
              </div>
            </div>

            {/* Organizations Management Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form to create organization */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 h-fit">
                <h3 className="text-sm font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  Registrar Nueva Organización
                </h3>
                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">NOMBRE DE LA ORGANIZACIÓN</label>
                    <input
                      type="text"
                      placeholder="Ej: Sucursal Valparaíso, Central"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">DESCRIPCIÓN / DETALLES</label>
                    <textarea
                      placeholder="Detalles de ubicación, contacto u observaciones..."
                      value={newOrgDesc}
                      onChange={(e) => setNewOrgDesc(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">USUARIO PARA EL LOGIN</label>
                    <input
                      type="text"
                      placeholder="Ej: admin_valpo"
                      value={newOrgUser}
                      onChange={(e) => setNewOrgUser(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">CONTRASEÑA PARA EL LOGIN</label>
                    <input
                      type="password"
                      placeholder="Contraseña de la organización"
                      value={newOrgPass}
                      onChange={(e) => setNewOrgPass(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 rounded-lg text-xs px-3 py-2 outline-none"
                    />
                  </div>
                  {orgError && (
                    <p className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded p-2">{orgError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Organización</span>
                  </button>
                </form>
              </div>

              {/* List of registered organizations */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Organizaciones Registradas ({organizations.length})</span>
                  </h3>
                </div>

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/40 overflow-hidden">
                  {organizations.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">Cargando organizaciones...</div>
                  ) : (
                    organizations.map((org) => {
                      const isEditing = editingOrgId === org.id;
                      return (
                        <div key={org.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          {isEditing ? (
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/20 p-3 rounded-lg border border-slate-800">
                              <div>
                                <label className="block text-[10px] text-slate-500 font-mono mb-1">NOMBRE</label>
                                <input
                                  type="text"
                                  value={editOrgName}
                                  onChange={(e) => setEditOrgName(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 outline-none text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 font-mono mb-1">DESCRIPCIÓN</label>
                                <input
                                  type="text"
                                  value={editOrgDesc}
                                  onChange={(e) => setEditOrgDesc(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded px-2.5 py-1.5 outline-none text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 font-mono mb-1">USUARIO LOGIN</label>
                                <input
                                  type="text"
                                  value={editOrgUser}
                                  onChange={(e) => setEditOrgUser(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 outline-none text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 font-mono mb-1">NUEVA CONTRASEÑA (DEJAR EN BLANCO PARA MANTENER)</label>
                                <input
                                  type="password"
                                  placeholder="Contraseña nueva opcional..."
                                  value={editOrgPass}
                                  onChange={(e) => setEditOrgPass(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 outline-none text-xs"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white text-sm">{org.name}</span>
                                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                  ID: {org.id}
                                </span>
                                <span className="text-[10px] font-mono bg-slate-800 text-emerald-450 px-1.5 py-0.5 rounded border border-slate-700">
                                  Usuario: {org.username}
                                </span>
                              </div>
                              {org.description && (
                                <p className="text-slate-400 text-[11px] leading-relaxed">{org.description}</p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 shrink-0 justify-end">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrg(org.id)}
                                  className="p-1 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>Guardar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingOrgId(null)}
                                  className="p-1 px-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditOrg(org)}
                                  className="p-1.5 text-slate-450 hover:bg-slate-800 hover:text-white rounded transition cursor-pointer"
                                  title="Editar organización"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrg(org.id, org.name)}
                                  className="p-1.5 text-slate-450 hover:bg-slate-800 hover:text-rose-500 rounded transition cursor-pointer"
                                  title="Eliminar organización (Borrará todo su inventario)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* PRINT ONLY HEADER */}
            <div className="hidden print:block text-slate-950 p-4 border-b border-black mb-6">
              <h1 className="text-2xl font-bold">Consola General de Inventario Informático</h1>
              <p className="text-sm">Ficha Maestra - Control de Custodia y Clasificación Físico/Lógica</p>
              <div className="grid grid-cols-2 text-xs mt-4 gap-2">
                <div><strong>Administrador:</strong> andres.landa.f@gmail.com</div>
                <div><strong>Fecha Emisión:</strong> {new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</div>
              </div>
            </div>

            {/* 2. STATS OVERVIEW CARDS */}
            <div className="print:hidden">
              <StatsDashboard stats={stats} totalBeforeFilter={assets.length} />
            </div>

        {/* 3. SEARCH & CONTROL FILTERS BAR */}
        <div id="filter-controls-card" className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 print:hidden shadow-lg space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Search inputs */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                id="input-buscar-filtro"
                type="text"
                placeholder="Buscar por S/N, Modelo, Marca, IP, MAC, Responsable o Cargo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-200 text-sm rounded-lg pl-9 pr-4 py-2.5 transition"
              />
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                  <Filter className="w-3 h-3 text-slate-400" /> CATEGORÍA
                </span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Todos">Todas las categorías</option>
                  <option value="Computador">Computadores</option>
                  <option value="Portátil">Portátiles</option>
                  <option value="Servidor">Servidores</option>
                  <option value="Redes">Dispositivos de Red</option>
                  <option value="Impresora">Impresoras</option>
                  <option value="Monitoreo / Seguridad">Monitoreo / Seguridad</option>
                  <option value="Otro">Otros activos</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">ESTADO</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Todos">Todos los estados</option>
                  <option value="Operativo">Operativos</option>
                  <option value="En Mantenimiento">En Mantenimiento</option>
                  <option value="En Stock">En Stock</option>
                  <option value="Dado de Baja">Dados de Baja</option>
                </select>
              </div>

              {role === 'super_admin' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">ORGANIZACIÓN</span>
                  <select
                    value={selectedOrgFilter}
                    onChange={(e) => setSelectedOrgFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Todos">Todas las organizaciones</option>
                    {organizations.map(org => (
                      <option key={org.id} value={String(org.id)}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Quick toggle check buttons */}
          <div className="pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            
            {/* Mandatory classification filter toggle */}
            <label id="toggle-pendientes" className="relative flex items-center gap-2.5 cursor-pointer select-none group text-xs text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={filterPendingManual}
                onChange={(e) => setFilterPendingManual(e.target.checked)}
                className="rounded border-slate-800 focus:ring-offset-slate-950 text-emerald-500 focus:ring-emerald-500 bg-slate-950 h-4.5 w-4.5 transition cursor-pointer"
              />
              <span className="group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Mostrar únicamente equipos con campos obligatorios vacíos (Cargo / Responsable / Ubicación)
              </span>
            </label>

            {/* Exporting & Print tools row */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mr-1 hidden sm:inline">Exportar:</span>
              
              <button
                id="btn-excel"
                type="button"
                onClick={handleExportToExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/10 hover:border-emerald-500/30 rounded-lg transition text-xs font-semibold"
                title="Generar planilla de cálculo Excel completa"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>EXCEL</span>
              </button>

              <button
                id="btn-pdf"
                type="button"
                onClick={handleExportToPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/10 hover:border-sky-500/30 rounded-lg transition text-xs font-semibold"
                title="Generar Reporte de Auditoría en PDF vectorizado"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>PDF Directo</span>
              </button>

              <button
                id="btn-print"
                type="button"
                onClick={handlePrintSystem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition text-xs font-semibold"
                title="Imprimir tabla formateada"
              >
                <Eye className="w-4 h-4 text-slate-300" />
                <span>Imprimir / PDF Fis</span>
              </button>
            </div>
          </div>
        </div>

        {/* WARNING EXPLANATION BANNER */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3.5 print:hidden">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0 border border-emerald-500/20">
            <Info className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-300 space-y-1.5">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wide font-mono">Control y Asignación de Inventario (Instrucciones de Llenado)</h4>
            <p>
              Como Administrador del sistema, el hardware, las IPs y las direcciones MAC se cargan automáticamente desde el relevo técnico de IT. 
              Su tarea de control consiste en **completar directamente las columnas resaltadas (Cargo, Responsable, y Ubicación)** para formalizar la custodia física. 
              Puede escribir y editar **directamente en las casillas correspondientes de la tabla**, o bien usar el botón <Edit className="w-3 h-3 inline text-emerald-400" /> para editar la ficha completa.
            </p>
          </div>
        </div>

        {/* AUTOMATED AUDIT SCRIPT SECTION */}
        <div className="print:hidden">
          <PCAuditorScript 
            onImportAsset={handleImportAsset} 
            nextId={nextId} 
            addLog={addLog} 
            currentOrgName={organizations.find(o => o.id === orgId)?.name || ''}
            currentOrgId={orgId}
          />
        </div>

        {/* 4. MAIN INTERACTIVE DATA GRID TABLE */}
        <div id="inventory-grid-card" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl print:border-none print:bg-white print:text-black">
          
          {/* Table Header Controls */}
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="text-sm font-sans font-bold text-white tracking-tight uppercase">
                Base de Datos Operativa TI ({filteredAssets.length} activos filtrados)
              </h2>
            </div>
            
            {/* Quick Indicators tag */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {filterPendingManual && (
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-mono text-[10px]">
                  FILTRO ACTIVADO: PENDIENTES DE LLENADO
                </span>
              )}
              {searchQuery && (
                <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded font-mono text-[10px]">
                  BÚSQUEDA FILTRADA
                </span>
              )}
            </div>
          </div>

          <div className="overflow-auto w-full max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs font-mono uppercase print:bg-slate-100 print:text-slate-900 print:border-b-2 print:border-black">
                  
                  {/* ID */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('id')}>
                    <div className="flex items-center gap-1.5">
                      <span>CÓDIGO</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* CATEGORY & MODEL */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('brand')}>
                    <div className="flex items-center gap-1.5">
                      <span>CATEGORÍA / MODELO</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* ORGANIZACIÓN (Super Admin only) */}
                  {role === 'super_admin' && (
                    <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('organizationName')}>
                      <div className="flex items-center gap-1.5">
                        <span>ORGANIZACIÓN</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                  )}

                  {/* SERIAL NUMBER */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('serialNumber')}>
                    <div className="flex items-center gap-1.5">
                      <span>NUM. SERIE (S/N)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* NETWORK DETAILS */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950 hidden md:table-cell" onClick={() => handleSort('ipAddress')}>
                    <div className="flex items-center gap-1.5">
                      <span>CONEXIÓN IP / MAC</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* OPERATING STATUS */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1.5">
                      <span>ESTADO</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* USER MANUAL COLUMN 1: CARGO */}
                  <th className="py-3.5 px-4 font-semibold bg-emerald-500/5 text-emerald-400 border-l border-emerald-500/10 cursor-pointer hover:bg-emerald-500/10 select-none print:bg-slate-100 print:text-slate-950" onClick={() => handleSort('cargo')}>
                    <div className="flex items-center gap-1.5">
                      <span>1. CARGO CUSTODIO</span>
                      <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                    </div>
                  </th>

                  {/* USER MANUAL COLUMN 2: RESPONSABLE */}
                  <th className="py-3.5 px-4 font-semibold bg-emerald-500/5 text-emerald-400 border-l border-emerald-500/10 cursor-pointer hover:bg-emerald-500/10 select-none print:bg-slate-100 print:text-slate-950" onClick={() => handleSort('responsable')}>
                    <div className="flex items-center gap-1.5">
                      <span>2. RESPONSABLE</span>
                      <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                    </div>
                  </th>

                  {/* USER MANUAL COLUMN 3: UBICACION */}
                  <th className="py-3.5 px-4 font-semibold bg-emerald-500/5 text-emerald-400 border-l border-emerald-500/10 cursor-pointer hover:bg-emerald-500/10 select-none print:bg-slate-100 print:text-slate-950" onClick={() => handleSort('ubicacion')}>
                    <div className="flex items-center gap-1.5">
                      <span>3. UBICACIÓN FÍSICA</span>
                      <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                    </div>
                  </th>

                  {/* OBSERVACIONES */}
                  <th className="py-3.5 px-4 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/40 select-none print:text-slate-950" onClick={() => handleSort('notes')}>
                    <div className="flex items-center gap-1.5">
                      <span>OBSERVACIONES</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>

                  {/* ROW ACTIONS */}
                  <th className="py-3.5 px-4 font-semibold text-slate-400 text-center print:hidden">ACCIONES</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800 text-sm print:divide-y print:divide-slate-300 print:text-slate-900">
                {loading ? (
                  <tr>
                    <td colSpan={role === 'super_admin' ? 11 : 10} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-medium">Cargando inventario desde el servidor...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={role === 'super_admin' ? 11 : 10} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                        <p className="text-sm font-medium">No se encontraron activos con los criterios de búsqueda actales.</p>
                        <p className="text-xs text-slate-600">Pruebe desmarcando filtros o cambiando la palabra buscada.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => {
                    const isInspected = inspectedAssetId === asset.id;
                    const hasEmptyManual = !asset.cargo?.trim() || !asset.responsable?.trim() || !asset.ubicacion?.trim();

                    // Status styled classes helper
                    const statusColors = {
                      'Operativo': 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 print:text-black print:bg-emerald-100',
                      'En Mantenimiento': 'bg-amber-500/10 border-amber-500/30 text-amber-400 print:text-black print:bg-amber-100',
                      'En Stock': 'bg-sky-500/10 border-sky-500/30 text-sky-400 print:text-black print:bg-sky-100',
                      'Dado de Baja': 'bg-rose-500/10 border-rose-500/30 text-rose-400 print:text-black print:bg-rose-100'
                    };

                    return (
                      <React.Fragment key={asset.id}>
                        <tr 
                          id={`row-${asset.id}`}
                          className={`hover:bg-slate-800/30 transition-all ${
                            isInspected ? 'bg-slate-850/80' : ''
                          } ${
                            hasEmptyManual ? 'bg-amber-500/[0.01]' : ''
                          } print:bg-white`}
                        >
                          {/* Asset ID */}
                          <td className="py-2.5 px-4 font-mono font-bold text-white selection:bg-slate-700 print:text-slate-900">
                            <span className="flex items-center gap-1">
                              {asset.id}
                              {hasEmptyManual && (
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" title="Información de usuario pendiente" />
                              )}
                            </span>
                          </td>

                          {/* Category, Brand, Model */}
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              {/* Inline mini icon */}
                              {asset.category === 'Servidor' && <Server className="w-3.5 h-3.5 text-indigo-400 print:hidden" />}
                              {asset.category === 'Redes' && <Network className="w-3.5 h-3.5 text-sky-400 print:hidden" />}
                              {asset.category === 'Computador' && <Monitor className="w-3.5 h-3.5 text-emerald-400 print:hidden" />}
                              {asset.category === 'Portátil' && <Laptop className="w-3.5 h-3.5 text-amber-400 print:hidden" />}
                              {asset.category === 'Impresora' && <Printer className="w-3.5 h-3.5 text-slate-400 print:hidden" />}
                              
                              <div className="text-slate-200 font-medium print:text-slate-900">
                                <span className="text-xs font-mono px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 mr-1.5 print:bg-slate-200 print:text-slate-800">
                                  {asset.category}
                                </span>
                                {asset.brand} <span className="text-white font-semibold print:text-black">{asset.model}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 max-w-[250px] truncate hidden sm:block print:block">
                              {asset.specification}
                            </div>
                          </td>

                          {/* Serial S/N */}
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-300 print:text-slate-900">
                            {asset.serialNumber}
                          </td>

                          {/* Net IP & MAC */}
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-300 hidden md:table-cell print:bleed">
                            {asset.ipAddress ? (
                              <div className="text-slate-200 font-medium">{asset.ipAddress}</div>
                            ) : (
                              <div className="text-slate-600 font-normal">-- Sin IP asignada --</div>
                            )}
                            <div className="text-[10px] text-slate-500 tracking-wider">MAC: {asset.macAddress || 'No mapeada'}</div>
                          </td>

                          {/* Operation status */}
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${statusColors[asset.status]}`}>
                              {asset.status}
                            </span>
                          </td>

                          {/* ORGANIZACIÓN (Super Admin only) */}
                          {role === 'super_admin' && (
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-300 print:text-slate-900">
                              <span className="px-2 py-0.5 bg-slate-800 rounded border border-slate-750 text-slate-350 text-[10px]">
                                {asset.organizationName || `Org ${asset.organizationId}`}
                              </span>
                            </td>
                          )}

                          {/* ========================================================== */}
                          {/* THREE MANUAL COLUMNS WITH CONCISE, DIRECT INLINE INPUTS */}
                          {/* ========================================================== */}

                          {/* USER COLUMN 1: CARGO */}
                          <td className="py-2 px-3 border-l border-emerald-500/10 bg-emerald-500/[0.01] print:bg-white">
                            <div className="relative group/cell">
                              <input
                                id={`input-cargo-${asset.id}`}
                                type="text"
                                value={asset.cargo}
                                placeholder="Escribir cargo..."
                                onChange={(e) => handleInlineEdit(asset.id, 'cargo', e.target.value)}
                                onBlur={(e) => handleInlineEditBlur(asset.id, 'cargo', e.target.value)}
                                className={`w-24 sm:w-28 bg-slate-900 border text-white text-xs rounded px-2 py-1.5 focus:outline-none transition ${
                                  !asset.cargo.trim() 
                                    ? 'border-amber-500/40 bg-amber-500/5 placeholder-amber-500/40' 
                                    : 'border-slate-800 focus:border-emerald-500'
                                } print:border-none print:p-0 print:text-slate-900`}
                              />
                            </div>
                          </td>

                          {/* USER COLUMN 2: RESPONSABLE */}
                          <td className="py-2 px-3 border-l border-emerald-500/10 bg-emerald-500/[0.01] print:bg-white">
                            <div className="relative group/cell">
                              <input
                                id={`input-resp-${asset.id}`}
                                type="text"
                                value={asset.responsable}
                                placeholder="Escribir nombre..."
                                onChange={(e) => handleInlineEdit(asset.id, 'responsable', e.target.value)}
                                onBlur={(e) => handleInlineEditBlur(asset.id, 'responsable', e.target.value)}
                                className={`w-24 sm:w-28 bg-slate-900 border text-white text-xs rounded px-2 py-1.5 focus:outline-none transition ${
                                  !asset.responsable.trim() 
                                    ? 'border-amber-500/40 bg-amber-500/5 placeholder-amber-500/40' 
                                    : 'border-slate-800 focus:border-emerald-500'
                                } print:border-none print:p-0 print:text-slate-900`}
                              />
                            </div>
                          </td>

                          {/* USER COLUMN 3: UBICACION */}
                          <td className="py-2 px-3 border-l border-emerald-500/10 bg-emerald-500/[0.01] print:bg-white">
                            <div className="relative group/cell">
                              <input
                                id={`input-ubic-${asset.id}`}
                                type="text"
                                value={asset.ubicacion}
                                placeholder="Escribir ubicación..."
                                onChange={(e) => handleInlineEdit(asset.id, 'ubicacion', e.target.value)}
                                onBlur={(e) => handleInlineEditBlur(asset.id, 'ubicacion', e.target.value)}
                                className={`w-24 sm:w-28 bg-slate-900 border text-white text-xs rounded px-2 py-1.5 focus:outline-none transition ${
                                  !asset.ubicacion.trim() 
                                    ? 'border-amber-500/40 bg-amber-500/5 placeholder-amber-500/40' 
                                    : 'border-slate-800 focus:border-emerald-500'
                                } print:border-none print:p-0 print:text-slate-900`}
                              />
                            </div>
                          </td>

                          {/* OBSERVACIONES */}
                          <td className="py-2.5 px-4 text-xs text-slate-350 print:text-slate-900 max-w-[150px] truncate" title={asset.notes || ''}>
                            {asset.notes || <span className="text-slate-600 font-normal italic">Sin observaciones</span>}
                          </td>

                          {/* ACTIONS */}
                          <td className="py-2 px-4 text-center whitespace-nowrap print:hidden">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setInspectedAssetId(isInspected ? null : asset.id)}
                                className={`p-1.5 rounded transition ${
                                  isInspected 
                                    ? 'bg-slate-700 text-teal-400' 
                                    : 'text-slate-400 hover:bg-slate-850 hover:text-white'
                                }`}
                                title="Ver detalles y auditoria de hardware"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setAnalyzingAssetId(analyzingAssetId === asset.id ? null : asset.id)}
                                className={`p-1.5 rounded transition ${
                                  analyzingAssetId === asset.id
                                    ? 'bg-violet-900 text-violet-400 border border-violet-500/20'
                                    : 'text-slate-400 hover:bg-slate-850 hover:text-violet-400'
                                }`}
                                title="Analizar obsolescencia con IA (Gemini)"
                              >
                                <Brain className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAsset(asset);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:bg-slate-850 hover:text-emerald-400 rounded transition"
                                title="Editar elemento completo"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteAsset(asset.id)}
                                className="p-1.5 text-slate-450 hover:bg-slate-850 hover:text-rose-500 rounded transition"
                                title="Eliminar del inventario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* DETAILED ROW INSPECTOR DRAWER PANEL (Collapsible) */}
                        {isInspected && (
                          <tr className="bg-slate-900/60 print:hidden select-none">
                            <td colSpan={role === 'super_admin' ? 11 : 10} className="py-4 px-6 border-l-2 border-emerald-500">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                
                                {/* Col 1: Tech specifications */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">
                                    <Cpu className="w-3.5 h-3.5" />
                                    <span>Especificación y Hardware</span>
                                  </div>
                                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2.5">
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Ficha de Fabricante:</span>
                                      <span className="text-xs text-white font-medium">{asset.brand} {asset.model}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Detalles Físicos / Componentes:</span>
                                      <span className="text-xs text-slate-300 leading-normal">{asset.specification || 'Sin especificaciones listadas'}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Código de Serie Único:</span>
                                      <code className="text-xs text-amber-400 font-mono bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                                        {asset.serialNumber}
                                      </code>
                                    </div>
                                  </div>
                                </div>

                                {/* Col 2: Network details */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">
                                    <Network className="w-3.5 h-3.5" />
                                    <span>Parametrización Lógica</span>
                                  </div>
                                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2.5">
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Dirección IPv4 del Host:</span>
                                      <code className="text-xs text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                        {asset.ipAddress || 'Sin configurar (Estática/DHCP)'}
                                      </code>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Dirección Física MAC:</span>
                                      <code className="text-xs text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                        {asset.macAddress || 'No documentado'}
                                      </code>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Fecha Ingreso al Sistema:</span>
                                      <span className="text-xs text-slate-300 font-mono">{asset.purchaseDate}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Col 3: Manual columns state auditing */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">
                                    <Database className="w-3.5 h-3.5" />
                                    <span>Auditoría de Custodia</span>
                                  </div>
                                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2.5">
                                    <div className="flex items-center gap-2">
                                      {hasEmptyManual ? (
                                        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 font-mono w-full">
                                          <AlertTriangle className="w-4 h-4" />
                                          <span>PENDIENTE DE AUDITORÍA</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 font-mono w-full">
                                          <CheckCircle className="w-4 h-4" />
                                          <span>CUSTODIA VERIFICADA</span>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-normal">
                                      Este activo requiere que el administrador del PC complete u homologue los campos de
                                      **Cargo**, **Responsable** y **Ubicación** para poder integrarlo a las auditorías anuales corporativas.
                                    </p>
                                    {asset.notes && (
                                      <div className="pt-2.5 border-t border-slate-800">
                                        <span className="text-[10px] text-slate-500 block uppercase font-mono mb-0.5">Observaciones:</span>
                                        <p className="text-xs text-slate-300 leading-normal whitespace-pre-wrap">{asset.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                              </div>

                              {/* Interactive Software & License Inspector Panel */}
                              <AssetSoftwareManager
                                asset={asset}
                                onAddSoftware={handleAddSoftwareToAsset}
                                onToggleLicense={handleToggleSoftwareLicense}
                                onRemoveSoftware={handleRemoveSoftwareFromAsset}
                                onAutoProvision={handleAutoProvisionRecommendedSoftware}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Summary statistics row */}
          <div className="bg-slate-950/40 px-6 py-4 border-t border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-1.5 font-mono">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>SISTEMA LOCAL OPERATIVO</span>
              <span className="text-slate-600">|</span>
              <span>Filtrados {filteredAssets.length} de {assets.length} activos</span>
            </div>
            
            <div className="flex items-center gap-4 text-slate-500 font-mono">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {stats.byStatus['Operativo'] || 0} Operativos</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {stats.byStatus['En Mantenimiento'] || 0} Mant.</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> {stats.byStatus['En Stock'] || 0} Stock</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {stats.byStatus['Dado de Baja'] || 0} Baja</span>
            </div>
          </div>
        </div>
        </>
        )}

        {/* 5. SYSTEM EVENTS LOG CONSOLE */}
        <div className="print:hidden">
          <AdminTerminalLog logs={logs} onClear={handleClearLogs} />
        </div>

      </main>

      {/* 6. GLOBAL FOOTER */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-[95%] xl:max-w-[1550px] w-full mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="p-1 text-[10px] text-slate-400 bg-slate-900 rounded border border-slate-800">
              ESTADO DE LICENCIA: PRO_ADMINISTRADOR
            </span>
          </div>
          <p>© 2026 Terminal Portuario Inteligente - Control de Activos Tecnológica Integrada.</p>
          <p className="text-[11px] text-slate-600">Dispositivo conectado mediante túnel root SSL.</p>
        </div>
      </footer>

      {/* 7. MODALS */}
      <AssetFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAsset(null);
        }}
        onSave={handleSaveAsset}
        editingAsset={editingAsset}
        nextId={nextId}
        organizations={organizations}
        userRole={role}
      />

      {role === 'super_admin' && (
        <OrganizationManagerModal
          isOpen={isOrgModalOpen}
          onClose={() => setIsOrgModalOpen(false)}
          organizations={organizations}
          onRefreshOrgs={fetchOrganizations}
          onRefreshAssets={fetchAssets}
          apiUrl={API_BASE}
          token={token}
          addLog={addLog}
        />
      )}

      {analyzingAssetId && (
        <ObsolescencePanel
          asset={assets.find(a => a.id === analyzingAssetId)!}
          onClose={() => setAnalyzingAssetId(null)}
          authenticatedFetch={authenticatedFetch}
          apiBase={API_BASE}
          onReportGenerated={fetchAssets}
        />
      )}

    </div>
  );
}
