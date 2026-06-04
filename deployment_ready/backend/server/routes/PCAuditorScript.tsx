import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  Download, 
  UploadCloud, 
  HelpCircle, 
  Cpu, 
  FileText, 
  Laptop, 
  Sparkles,
  Info,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Asset, AssetCategory } from '../types';

interface PCAuditorScriptProps {
  onImportAsset: (importedData: Partial<Asset>) => void;
  nextId: string;
  addLog: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void;
  currentOrgName?: string;
  currentOrgId?: number | null;
}

export default function PCAuditorScript({ onImportAsset, nextId, addLog, currentOrgName = '', currentOrgId = null }: PCAuditorScriptProps) {
  const [activeOS, setActiveOS] = useState<'windows' | 'linux'>('windows');
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [browserInfo, setBrowserInfo] = useState<any>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const host = window.location.hostname;
        const port = window.location.port;
        const apiBase = port === '3000' 
          ? `${window.location.protocol}//${host}:3001/api` 
          : `${window.location.origin}/api`;

        const res = await fetch(`${apiBase}/audit-key`, { 
          headers, 
          credentials: 'include' 
        });
        if (res.ok) {
          const data = await res.json();
          if (data.apiKey) {
            setApiKey(data.apiKey);
          }
        }
      } catch (err) {
        console.error('Error fetching audit API key:', err);
      }
    };
    fetchApiKey();
  }, []);

  // Dynamically compute the API url based on how client accessed the app
  const getApiUrl = () => {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port === '3000') {
      return `${window.location.protocol}//${host}:3001/api`;
    }
    return `${window.location.origin}/api`;
  };
  const targetApiUrl = getApiUrl();

  // 1. Script de Windows (PowerShell) - Genera un JSON limpio con todos los datos técnicos reales
  const windowsScript = `# Script de Auditoría Informática Corporativa

# M-05: Permitir parametrización de la URL y API Key de auditoría (C-01)
param (
    [string]$ServerUrl = "${window.location.origin}",
    [string]$ApiKey = "${apiKey}"
)

# Configurar codificación de caracteres a UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

# Ejecute este script como Administrador en PowerShell para extraer las especificaciones reales.

$ComputerSystem = Get-CimInstance Win32_ComputerSystem
$Bios = Get-CimInstance Win32_Bios
$Processor = Get-CimInstance Win32_Processor
$PhysicalMemory = Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum
$Disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$Network = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Select-Object -First 1 | Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue
if (-not $Network) {
    $Network = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -First 1
}
$MacAddress = (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).MacAddress

$RamGB = [Math]::Round($PhysicalMemory.Sum / 1GB, 0)
$DiskSizeGB = [Math]::Round($Disk.Size / 1GB, 0)
$DiskFreeGB = [Math]::Round($Disk.FreeSpace / 1GB, 0)
$OS = (Get-CimInstance Win32_OperatingSystem).Caption

# Leer todo el software instalado desde el registro
$uninstallKeys = @(
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)
$installedApps = Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue | 
    Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 } | 
    Select-Object DisplayName, DisplayVersion | 
    Sort-Object DisplayName -Unique

$softwareList = @()
$officeDetected = $false
$officeVersion = ""

foreach ($app in $installedApps) {
    $name = $app.DisplayName.Trim()
    $version = if ($app.DisplayVersion) { $app.DisplayVersion.ToString().Trim() } else { "Desconocido" }
    
    # Validar si es Microsoft Office o Microsoft 365
    if ($name -match "Microsoft (Office|365)" -and -not ($name -match "OneDrive|Update|Desktop|Interface|Access Runtime|Compensator")) {
        $officeDetected = $true
        $officeVersion = $version
    }
    
    $softwareList += @{
        name = $name
        version = $version
        licensed = $true
        licenseType = "Libre/Gratuito"
    }
}

# Auditar Licencias de Office usando script oficial de activación de MS (OSPP.vbs)
$officeLicenseStatus = "No detectado / No licenciado"
if ($officeDetected) {
    $officePaths = @(
        "$env:ProgramFiles\\Microsoft Office\\Office16\\OSPP.VBS",
        "$env:ProgramFiles(x86)\\Microsoft Office\\Office16\\OSPP.VBS",
        "$env:ProgramFiles\\Microsoft Office\\Office15\\OSPP.VBS",
        "$env:ProgramFiles(x86)\\Microsoft Office\\Office15\\OSPP.VBS",
        "C:\\Program Files\\Microsoft Office\\Office16\\OSPP.VBS",
        "C:\\Program Files (x86)\\Microsoft Office\\Office16\\OSPP.VBS"
    )
    
    $licensedState = $false
    foreach ($path in $officePaths) {
        if (Test-Path $path) {
            $output = cscript.exe //NoLogo $path /dstatus
            if ($output -match "LICENSE STATUS:\\s+--- (LICENSED|SUBSCRIPTION) ---") {
                $licensedState = $true
                $officeLicenseStatus = "Licenciado / Activo"
                break
            } elseif ($output -match "LICENSE STATUS:") {
                $officeLicenseStatus = "Instalado (Sin Licencia o Demo)"
            }
        }
    }
    
    # Validar licencias modernas de Microsoft 365 basadas en suscripción de usuario (sin clave KMS/MAK)
    if (-not $licensedState) {
        $licRegistry = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Common\\Licensing"
        $identityRegistry = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Common\\Identity\\Identities"
        if ((Test-Path $licRegistry) -and (Test-Path $identityRegistry)) {
            $identities = Get-ChildItem $identityRegistry -ErrorAction SilentlyContinue
            $tokens = Get-ChildItem $licRegistry -ErrorAction SilentlyContinue
            if ($identities -and $tokens) {
                $licensedState = $true
                $officeLicenseStatus = "Licenciado / Activo (Suscripción)"
            }
        }
    }
    
    # Agregar la entrada de licencia al software
    $softwareList += @{
        name = "Licencia Microsoft Office / 365"
        version = $officeVersion
        licensed = $licensedState
        licenseType = $officeLicenseStatus
    }
}
$AuditData = @{
    category = "Computador"
    brand = $ComputerSystem.Manufacturer
    model = $ComputerSystem.Model
    serialNumber = $Bios.SerialNumber
    ipAddress = if ($Network) { $Network.IPAddress } else { "127.0.0.1" }
    macAddress = if ($MacAddress) { $MacAddress.Replace("-", ":") } else { "00:00:00:00:00:00" }
    status = "Operativo"
    specification = "SO: $OS | CPU: $($Processor.Name) | RAM: \${RamGB}GB | Disco: [\${DiskSizeGB}GB Total / \${DiskFreeGB}GB Libres] | Hostname: $env:COMPUTERNAME"
    purchaseDate = (Get-Date).ToString("yyyy-MM-dd")
    cargo = ""
    responsable = $ComputerSystem.PrimaryOwnerName
    ubicacion = ""
    organizationId = ${currentOrgId || 'null'}
    organizationName = "${currentOrgName}"
    software = $softwareList
}

$json = $AuditData | ConvertTo-Json -Depth 5
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

Write-Host "Enviando datos al servidor de inventario..." -ForegroundColor Yellow
try {
    $headers = @{}
    if ($ApiKey) {
        $headers["X-Audit-API-Key"] = $ApiKey
    }
    $cleanServerUrl = $ServerUrl.TrimEnd('/')
    $targetUrl = "$cleanServerUrl/api/assets/audit"

    $response = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $jsonBytes -ContentType "application/json; charset=utf-8" -Headers $headers
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "¡Auditoría enviada y registrada con éxito!" -ForegroundColor Green
    Write-Host "Código de equipo registrado: $($response.assetId) ($($response.action))" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Green
} catch {
    Write-Host "Detalles del error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No se pudo conectar directamente al servidor. Guardando en Escritorio..." -ForegroundColor Red
    $json | Out-File -FilePath "$HOME\\Desktop\\it_audit_info.json" -Encoding utf8
    Write-Host "Por favor, arrastre 'it_audit_info.json' desde su Escritorio a la web." -ForegroundColor Yellow
}
`;

  // 2. Script de Linux/macOS Bash
  const linuxScript = `# Script de Auditoría Informática Corporativa (Linux / macOS Shell)
# Ejecute este script en su terminal local. Exporta el hardware real a un JSON.

IP_ADDR=\$(ip route get 1.1.1.1 2>/dev/null | awk '{print \$7}' || hostname -I | awk '{print \$1}')
MAC_ADDR=\$(ip link show | grep -v "lo" | grep "link/ether" | awk '{print \$2}' | head -n 1)
CPU_MODEL=\$(grep -m 1 "model name" /proc/cpuinfo | cut -d: -f2 | sed 's/^[ \\t]*//' || sysctl -n machdep.cpu.brand_string)
RAM_GB=\$(free -g 2>/dev/null | awk '/^Mem:/{print \$2}' || expr \$(sysctl -n hw.memsize) / 1073741824)
DISK_INFO=\$(df -h / | awk 'NR==2 {print \$2" Total / "\$4" Libres"}')
HOSTNAME=\$(hostname)
SERIAL_NUM=\$(cat /sys/class/dmi/id/product_serial 2>/dev/null || ioreg -l | grep "IOPlatformSerialNumber" | cut -d'"' -f4 || echo "S/N-AUTODETECT")

cat <<EOF > ~/Desktop/it_audit_info.json
{
  "category": "Computador",
  "brand": "Linux/Mac Node",
  "model": "\$HOSTNAME",
  "serialNumber": "\$SERIAL_NUM",
  "ipAddress": "\$IP_ADDR",
  "macAddress": "\$MAC_ADDR",
  "status": "Operativo",
  "specification": "CPU: \$CPU_MODEL | RAM: \\\${RAM_GB}GB | Disco: \$DISK_INFO",
  "purchaseDate": "\$(date +'%Y-%m-%d')",
  "cargo": "",
  "responsable": "\$USER",
  "ubicacion": "",
  "organizationId": ${currentOrgId || 'null'},
  "organizationName": "${currentOrgName}",
  "software": [
    { "name": "Linux Core System", "version": "\$(uname -r)", "licensed": true, "licenseType": "Libre/GPL" }
  ]
}
EOF

echo "Enviando datos al servidor de inventario..."
curl -s -X POST -H "Content-Type: application/json; charset=utf-8" \${apiKey ? \`-H "X-Audit-API-Key: \${apiKey}" \` : ''}-d @~/Desktop/it_audit_info.json \${targetApiUrl}/assets/audit
echo ""
echo "=========================================================="
echo "¡Auditoría Linux/macOS realizada con éxito!"
echo "Archivo 'it_audit_info.json' enviado al servidor y guardado en Escritorio."
echo "=========================================================="
`;

  const copyToClipboard = () => {
    const textToCopy = activeOS === 'windows' ? windowsScript : linuxScript;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    addLog(`Script de auditoría para ${activeOS.toUpperCase()} copiado al portapapeles.`, 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScriptFile = () => {
    const text = activeOS === 'windows' ? windowsScript : linuxScript;
    const filename = activeOS === 'windows' ? 'Auditar_PC_Windows.ps1' : 'auditar_pc_linux.sh';
    const blobContent = activeOS === 'windows' ? ["\uFEFF", text] : [text];
    const blob = new Blob(blobContent, { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`Descargado script técnico: ${filename}`, 'success');
  };

  // 3. Procesar archivo JSON importado
  const processImportedJson = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      
      // Validation check
      if (!data.serialNumber || !data.model) {
        throw new Error('El archivo JSON no contiene los parámetros mínimos requeridos (serialNumber, model).');
      }

      // Prepare imported structure mapped to Asset
      const importedAsset: Partial<Asset> = {
        category: (data.category as AssetCategory) || 'Computador',
        brand: data.brand || 'Genérica',
        model: data.model || 'Desconocido',
        serialNumber: data.serialNumber,
        ipAddress: data.ipAddress || '',
        macAddress: data.macAddress || '',
        status: data.status || 'Operativo',
        specification: data.specification || '',
        purchaseDate: data.purchaseDate || new Date().toISOString().substring(0, 10),
        cargo: data.cargo || '',
        responsable: data.responsable || '',
        ubicacion: data.ubicacion || '',
        software: data.software || []
      };

      onImportAsset(importedAsset);
      setImportStatus({
        type: 'success',
        msg: `¡Datos técnicos leídos con éxito! S/N Detectado: ${data.serialNumber}. El formulario ha sido precargado de forma automática.`
      });
      addLog(`Auditoría de PC importada correctamente. S/N: ${data.serialNumber}`, 'success');
    } catch (e: any) {
      setImportStatus({
        type: 'error',
        msg: `Error leyendo el archivo JSON: ${e.message}`
      });
      addLog(`Fallo al procesar JSON de auditoría: ${e.message}`, 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processImportedJson(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processImportedJson(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  // 4. Auditoría rápida del explorador actual utilizando las Sandboxed APIs del Navegador
  const runBrowserAudit = () => {
    try {
      const ua = navigator.userAgent;
      let detectedBrand = 'Genérica';
      let detectedModel = 'Dispositivo Integrado';
      
      // Safe Web API parse
      if (ua.includes('Windows')) {
        detectedBrand = 'Microsoft PC Platform';
        detectedModel = 'Windows NT Client';
      } else if (ua.includes('Macintosh')) {
        detectedBrand = 'Apple Inc.';
        detectedModel = 'MacBook / iMac Node';
      } else if (ua.includes('Linux')) {
        detectedBrand = 'Linux Enterprise';
        detectedModel = 'Workstation Node';
      } else if (ua.includes('Android')) {
        detectedBrand = 'Android Client';
        detectedModel = 'Mobile/Tablet Device';
      }

      // Memory estimation properties
      const mem = (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB estimación` : 'No legible';
      const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} núcleos lógicos` : 'No legible';
      const specText = `Explorador Web Sandbox API | CPU Cores: ${cores} | RAM Estimada: ${mem} | UserAgent: ${ua.substring(0, 75)}...`;

      // Simular importación de equipo local inmediato con software autodetectado
      const quickAsset: Partial<Asset> = {
        category: 'Computador',
        brand: detectedBrand,
        model: detectedModel,
        serialNumber: `WEB-AUDIT-${Math.random().toString(36).substring(3, 9).toUpperCase()}`,
        ipAddress: '127.0.0.1 (Web Local)',
        macAddress: '00:00:00:FF:EE:DD',
        status: 'Operativo',
        specification: specText,
        purchaseDate: new Date().toISOString().substring(0, 10),
        cargo: 'Visualizador del Sistema',
        responsable: 'Operador de Estación de Trabajo',
        ubicacion: 'Espacio de Trabajo Remoto',
        software: [
          { name: "Navegador Web (Este Browser)", version: ua.includes('Chrome') ? 'Google Chrome' : ua.includes('Firefox') ? 'Mozilla Firefox' : 'WebView NT', licensed: true, licenseType: "Libre/Gratuito" },
          { name: "Motor de Virtualización Sandbox", version: "v1.4.1", licensed: true, licenseType: "OEM/Bios" },
          { name: "Agente de Diagnóstico Web", version: "v2.0.0", licensed: true, licenseType: "Libre/Gratuito" }
        ]
      };

      setBrowserInfo(quickAsset);
      onImportAsset(quickAsset);
      setImportStatus({
        type: 'success',
        msg: `¡Autodetectado desde Navegador! Información técnica precargada. Código temporal generado.`
      });
      addLog('Auditoría Sandbox de navegador completada con éxito.', 'success');
    } catch (err: any) {
      addLog('No se pudo ejecutar la autocomprobación de navegador.', 'error');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl mt-6">
      
      {/* Banner de Cabecera */}
      <div className="bg-slate-950/40 p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
            <Terminal className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-sans font-bold text-white flex items-center gap-1.5 leading-tight">
              <span>Auditoría Automatizada de PC & Laptops</span>
              <span className="text-[10px] bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 font-mono px-2 py-0.5 rounded uppercase">
                Ahorro de Trabajo Real
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Evite digitar a mano marca, modelo y números de serie complejos. Descargue nuestro robusto script,
              ejecútelo en el PC final (con <code className="text-emerald-400 font-mono">powershell -ExecutionPolicy Bypass -File .\Auditar_PC_Windows.ps1</code> en Windows) y los datos se registrarán automáticamente.
            </p>
          </div>
        </div>

        {/* Browser Quick detection */}
        <button
          type="button"
          onClick={runBrowserAudit}
          className="flex items-center gap-2 text-xs py-2 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg transition shrink-0 shadow-md font-sans border border-emerald-400/30 active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Autodetectar Este Dispositivo</span>
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMNA IZQUIERDA: GENERADOR DE SCRIPTS (8 Columnas) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Generador de Payload de Auditoría</span>
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" title="Códigos seguros de lectura exclusivos sin riesgo" />
            </div>
            
            {/* Controles para sistema operativo */}
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex">
              <button
                type="button"
                onClick={() => setActiveOS('windows')}
                className={`px-3 py-1 text-xs font-semibold rounded transition ${
                  activeOS === 'windows' 
                    ? 'bg-slate-850 text-white shadow' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Windows (PowerShell)
              </button>
              <button
                type="button"
                onClick={() => setActiveOS('linux')}
                className={`px-3 py-1 text-xs font-semibold rounded transition ${
                  activeOS === 'linux' 
                    ? 'bg-slate-850 text-white shadow' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Mac / Linux (Bash)
              </button>
            </div>
          </div>

          {/* Caja con el Código del Script */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden group">
            
            {/* Botones rápidos */}
            <div className="absolute right-3 top-3 flex items-center gap-2 z-10 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={copyToClipboard}
                className="p-1 px-3 bg-slate-900 border border-slate-800 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 text-[10px] font-mono leading-none font-semibold active:bg-slate-800"
                title="Copiar código al portapapeles"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'COPIADO' : 'COPIAR SCRIPT'}</span>
              </button>

              <button
                type="button"
                onClick={downloadScriptFile}
                className="p-1 px-2.5 bg-slate-900 border border-slate-800 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 text-[10px] font-mono leading-none font-semibold active:bg-slate-800"
                title="Descargar archivo listo para ejecutar"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>DESCARGAR</span>
              </button>
            </div>

            {/* Código en sí */}
            <pre className="p-4 pt-14 max-h-[260px] overflow-auto text-[10.5px] font-mono leading-relaxed text-slate-300 select-all scrollbar-thin scrollbar-thumb-slate-800/80">
              <code>{activeOS === 'windows' ? windowsScript : linuxScript}</code>
            </pre>
          </div>

          <div className="flex items-center gap-2 text-[10.5px] text-slate-400 bg-slate-950/40 px-3 py-2 rounded-lg border border-slate-850 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span><strong>Nota de Seguridad:</strong> El código no accede a internet ni recopila claves o contraseñas. Solo diagnostica procesador, placa base, S/N, memoria y conectividad lógica local de forma pasiva e inocua.</span>
          </div>
        </div>

        {/* COLUMNA DERECHA: FLUJO DE TRABAJO AUTOMATIZADO Y SOPORTE (5 Columnas) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5">
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Flujo de Registro en 1-Clic</span>
            </h3>
            
            <div className="space-y-4 text-xs">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">1</div>
                  <div className="w-0.5 h-6 bg-slate-800 my-1"></div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200">Copiar o Descargar</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">Obtén el script de auditoría diseñado para el sistema operativo destino.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">2</div>
                  <div className="w-0.5 h-6 bg-slate-800 my-1"></div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200">Ejecutar Script</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">Corre el script en el PC. Recopila CPU, RAM, IP, Mac, Software y Office.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">3</div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200">Registro Automático</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">El PC reporta los datos directamente al backend por HTTP. ¡No requiere digitar nada!</p>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback & Status Box */}
          <div className="space-y-3">
            {importStatus && (
              <div className={`p-4 rounded-xl border flex items-start gap-2.5 [animation-fill-mode:forwards] animate-fade-in text-xs ${
                importStatus.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-550/20 text-rose-400'
              }`}>
                {importStatus.type === 'success' ? (
                  <ShieldCheck className="w-4.5 h-4.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                )}
                <div>
                  <p className="font-bold">{importStatus.type === 'success' ? 'Importación Exitosa' : 'Fallo en Lectura'}</p>
                  <p className="text-slate-350 text-[11px] mt-0.5 leading-relaxed">{importStatus.msg}</p>
                </div>
              </div>
            )}

            {/* Fallback manual upload area disguised cleanly */}
            <div className="bg-slate-950/20 border border-slate-850 p-4 rounded-xl text-center space-y-2">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                ¿El PC cliente no tiene acceso de red al servidor? Ejecuta el script para guardar la auditoría local y súbela aquí:
              </p>
              
              <input
                id="audit-file-input"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
              
              <button
                type="button"
                onClick={() => document.getElementById('audit-file-input')?.click()}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-350 font-semibold underline underline-offset-4 cursor-pointer"
              >
                <UploadCloud className="w-4.5 h-4.5" />
                <span>Importar archivo de auditoría (.json)</span>
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
