export type AssetCategory = 'Computador' | 'Portátil' | 'Servidor' | 'Redes' | 'Impresora' | 'Monitoreo / Seguridad' | 'Otro';

export type AssetStatus = 'Operativo' | 'En Mantenimiento' | 'En Stock' | 'Dado de Baja';

export interface SoftwareItem {
  name: string;
  version: string;
  licensed: boolean;
  licenseKey?: string;
  licenseType: 'Comercial/Licencia Activa' | 'Suscripción Corp' | 'OEM/Bios' | 'Libre/Gratuito' | 'Sin Licenciar/Demo';
}

export interface Organization {
  id: number;
  name: string;
  username?: string;
  password?: string;
  description?: string;
  created_at?: string;
}

export interface Asset {
  id: string; // Asset code, e.g., TI-001
  category: AssetCategory;
  brand: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  macAddress: string;
  status: AssetStatus;
  specification: string; // RAM, CPU, Storage, etc.
  purchaseDate: string;
  // The three columns to be filled details by the user:
  cargo: string;
  responsable: string;
  ubicacion: string;
  organizationId?: number;
  organizationName?: string;
  notes?: string;
  aiReport?: string;
  aiReportDate?: string;
  software?: SoftwareItem[];
}

export interface InventoryStats {
  totalAssets: number;
  assignedCount: number;
  unassignedCount: number;
  pendingClassification: number; // Empty cargo, responsable or ubicacion
  byCategory: Record<AssetCategory, number>;
  byStatus: Record<AssetStatus, number>;
}

export interface ObsolescenceReplacement {
  brand: string;
  model: string;
  estimatedPrice: string;
  reason: string;
  priority: 'alta' | 'media' | 'baja';
}

export interface ObsolescenceReport {
  score: number;          // 0-10: 0=nuevo/óptimo, 10=obsoleto total
  level: 'optimo' | 'aceptable' | 'atención' | 'crítico' | 'obsoleto';
  diagnosis: string;
  estimatedLifeLeft: string;
  strengths?: string[];
  weaknesses?: string[];
  replacements: ObsolescenceReplacement[];
  recommendation: string;
}
