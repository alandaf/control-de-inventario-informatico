# Script de Auditoría Informática Corporativa

# M-05: Permitir parametrización de la URL y API Key de auditoría (C-01)
param (
    [string]$ServerUrl = "https://inventarioti.simarp.net",
    [string]$ApiKey = "simarp_inventario_secret_token_key_2026"
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
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
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
        "$env:ProgramFiles\Microsoft Office\Office16\OSPP.VBS",
        "$env:ProgramFiles(x86)\Microsoft Office\Office16\OSPP.VBS",
        "$env:ProgramFiles\Microsoft Office\Office15\OSPP.VBS",
        "$env:ProgramFiles(x86)\Microsoft Office\Office15\OSPP.VBS",
        "C:\Program Files\Microsoft Office\Office16\OSPP.VBS",
        "C:\Program Files (x86)\Microsoft Office\Office16\OSPP.VBS"
    )
    
    $licensedState = $false
    foreach ($path in $officePaths) {
        if (Test-Path $path) {
            $output = cscript.exe //NoLogo $path /dstatus
            if ($output -match "LICENSE STATUS:\s+--- (LICENSED|SUBSCRIPTION) ---") {
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
        $licRegistry = "HKCU:\Software\Microsoft\Office\16.0\Common\Licensing"
        $identityRegistry = "HKCU:\Software\Microsoft\Office\16.0\Common\Identity\Identities"
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
    specification = "SO: $OS | CPU: $($Processor.Name) | RAM: ${RamGB}GB | Disco: [${DiskSizeGB}GB Total / ${DiskFreeGB}GB Libres] | Hostname: $env:COMPUTERNAME"
    purchaseDate = (Get-Date).ToString("yyyy-MM-dd")
    cargo = ""
    responsable = $ComputerSystem.PrimaryOwnerName
    ubicacion = ""
    organizationId = 2
    organizationName = "IP Piloto Pardo"
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
    $json | Out-File -FilePath "$HOME\Desktop\it_audit_info.json" -Encoding utf8
    Write-Host "Por favor, arrastre 'it_audit_info.json' desde su Escritorio a la web." -ForegroundColor Yellow
}
