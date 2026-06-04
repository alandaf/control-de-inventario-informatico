# Auditoría de Seguridad — Control de Inventario Informático

**Fecha:** 03 de junio de 2026  
**Objetivo:** Evaluación integral de seguridad de la aplicación `Control de Inventario Informático` (simarp.net)  
**Alcance:** Frontend (React + Vite), Backend (Node.js + Express), Base de datos (MariaDB), Proxy (PHP), Scripts de auditoría, Configuración del servidor  

---

## Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| **Total de hallazgos** | 24 |
| **Críticos** | 9 |
| **Altos** | 7 |
| **Medios** | 5 |
| **Bajos** | 3 |
| **Mitigaciones existentes** | 11 |

---

## 1. HALLAZGOS CRÍTICOS

### C-01: Endpoint público sin autenticación `/api/assets/audit`

**Archivo:** `server/routes/assets.ts:308`  
**Riesgo:** **CRÍTICO** — Cualquier persona con la URL puede insertar, actualizar y modificar activos en la base de datos del inventario sin necesidad de token JWT. Esto permite:
- Inundar la base de datos con datos falsos
- Modificar equipos existentes (se identifican por serialNumber)
- Insertar software con licenseKeys arbitrarios
- Denegación de servicio llenando la BD

**Evidencia:**
```typescript
// Línea 308 - Sin authenticateToken
router.post('/audit', async (req: Request, res: Response, next: NextFunction) => {
```

**Solución:** Agregar el middleware `authenticateToken` a esta ruta, o bien implementar un token de API específico para los scripts de auditoría.

---

### C-02: Credenciales hardcodeadas en el código fuente

**Archivos:** `server/auth.ts:14`, `server/index.ts:49`, `server/db.ts:16-18`  
**Riesgo:** **CRÍTICO** — Credenciales de administrador y secretos criptográficos con valores por defecto hardcodeados en el código:

```typescript
// auth.ts:14
const SECRET = process.env.JWT_SECRET || 'simarp_inventario_secret_token_key_2026';

// index.ts:49
const adminPass = process.env.ADMIN_PASS || 'Chito001_';

// db.ts:16-18
user: process.env.DB_USER || 'root',
password: process.env.DB_PASSWORD || '',
database: process.env.DB_NAME || 'simarpne_inventarioTI',
```

**Solución:** Eliminar los fallbacks hardcodeados. Si no hay variables de entorno, el servidor debe rechazar iniciar.

---

### C-03: Archivo `.env` contiene credenciales en texto plano

**Archivo:** `.env`  
**Riesgo:** **CRÍTICO** — El archivo `.env` local contiene:
- `ADMIN_PASS=Chito001_`
- `JWT_SECRET=simarp_inventario_secret_token_key_2026`
- `DB_USER=root`, `DB_PASSWORD=` (vacía), `DB_NAME=simarpne_inventarioTI`

Si este archivo se expone (error de deploy, backup, compartición), cualquier persona tiene acceso completo al sistema.

**Solución:** 
- Rotar inmediatamente todas las credenciales
- Usar un gestor de secretos o variables de entorno del servidor
- Asegurar que `.env` está en `.gitignore` (sí lo está)

---

### C-04: Deployment artifacts exponen credenciales

**Archivo:** `deployment_ready/backend/.env`  
**Riesgo:** **CRÍTICO** — El directorio `deployment_ready/` contiene artefactos de despliegue con campos de credenciales parcialmente poblados y los archivos completos del backend. Cualquiera con acceso al repositorio o al servidor puede ver la configuración exacta de despliegue.

**Solución:** Excluir `deployment_ready/` del repositorio o eliminar archivos sensibles de este directorio.

---

### C-05: Licencias de software en texto plano en el código fuente

**Archivos:** `server/defaultInventory.ts`, `server/seed.ts`, `server/routes/assets.ts:273-288`  
**Riesgo:** **CRÍTICO** — Licencias de software reales o simuladas están hardcodeadas en el código:
```
W269N-WFGWX-YVC9B-4J6C9-T83GX
SQL-5542-PROD-LNC
YTMG3-N6DKC-DKB77-7M9GH-8HVX7
M365-CORP-DESPACHOS
ACAD-3D-9921-X9
VEEAM-LIC-KEY-99
```

Si alguna de estas claves es real, representa una violación de licencias de software con posibles consecuencias legales y económicas.

**Solución:** Eliminar todas las claves de licencia del código. Usar marcadores de posición o cargarlas desde una fuente segura.

---

### C-06: DB_HOST en localhost con autenticación débil

**Archivo:** `.env`, `db.ts`  
**Riesgo:** **CRÍTICO** — La base de datos MariaDB se conecta como `root` sin contraseña. Si el servidor Node.js se expone a través del proxy PHP, un atacante podría intentar ataques de inyección o, peor aún, si hay una vulnerabilidad de SSRF o socket, podría comprometer la base de datos.

**Solución:** Crear un usuario de base de datos dedicado con privilegios mínimos y una contraseña fuerte.

---

### C-07: Token JWT secreto débil y sin rotación

**Archivo:** `server/auth.ts:14`  
**Riesgo:** **CRÍTICO** — El secreto JWT `simarp_inventario_secret_token_key_2026` es una frase predecible en español. Un atacante que obtenga este secreto (por ejemplo, en un repositorio público) puede forjar tokens y autenticarse como administrador. Además:
- No hay rotación automática de secretos
- Los tokens duran 24 horas sin posibilidad de renovación temprana

**Solución:** Usar un secreto JWT generado criptográficamente (ej: `openssl rand -base64 64`). Considerar usar RS256 con un par de llaves asimétricas.

---

### C-08: Token de sesión almacenado en localStorage

**Archivo:** `src/App.tsx:47`  
**Riesgo:** **CRÍTICO** — El token JWT se almacena en `localStorage`:
```typescript
const [token, setToken] = useState<string>(() => localStorage.getItem('admin_token') || '');
```
Esto es vulnerable a ataques XSS. Aunque React escapa output HTML, cualquier vulnerabilidad XSS en la aplicación (o en dependencias) expone el token.

**Solución:** Usar cookies `HttpOnly` y `Secure` para almacenar el token de sesión.

---

### C-09: Servidor Express escucha en `0.0.0.0` sin firewall de aplicación

**Archivos:** `vite.config.ts:16`, `server/index.ts:168`  
**Riesgo:** **CRÍTICO** — El servidor de desarrollo y producción escuchan en `0.0.0.0`:
```typescript
// server/index.ts:168
app.listen(PORT, '0.0.0.0', () => {
// vite.config.ts:16
server: { port: 3000, host: '0.0.0.0' }
```
En desarrollo, el servidor Vite expone toda la aplicación a la red local. En producción, el backend Express está vinculado a todas las interfaces de red. Aunque el proxy PHP es el punto de entrada, el backend aún es accesible directamente en el puerto 3001.

**Solución:** En producción, vincular `127.0.0.1` en lugar de `0.0.0.0`. El proxy PHP ya se encarga de exponer la API.

---

## 2. HALLAZGOS ALTOS

### A-01: Sin protección contra fuerza bruta en WebSocket/HMR

**Archivo:** `vite.config.ts:24`  
**Riesgo:** **ALTO** — Vite HMR está habilitado en producción si `DISABLE_HMR` no está configurado. Esto permite:
- Conexiones WebSocket al servidor de desarrollo
- Posible ejecución de código arbitrario a través de HMR

**Solución:** Asegurar que `DISABLE_HMR=true` en producción o deshabilitar HMR explícitamente.

---

### A-02: Logging de auditoría insuficiente

**Archivo:** `server/audit.ts:7-11`  
**Riesgo:** **ALTO** — El sistema de auditoría solo escribe a `console.log`:
```typescript
console.log(`[AUDIT] [${timestamp}] ...`);
```
- No hay persistencia en archivos o base de datos
- En producción, los logs se pierden al reiniciar el servidor (a menos que PM2 los capture)
- No hay alertas ni monitoreo de eventos sospechosos
- No hay logs de accesos a datos (GET /api/assets)

**Solución:** Implementar un sistema de logging persistente con rotación, almacenamiento en base de datos y alertas para eventos de seguridad.

---

### A-03: Tasa de rate limiting en memoria volátil

**Archivo:** `server/auth.ts:164`  
**Riesgo:** **ALTO** — El rate limiter de login usa un `Map` en memoria:
```typescript
const loginRateLimitMap = new Map<string, RateLimitInfo>();
```
- Se pierde al reiniciar el servidor
- No funciona en entornos multi-proceso (PM2 cluster mode)
- Un atacante con IP rotativa puede evadirlo

**Solución:** Usar una solución de rate limiting externa (Redis, base de datos) o un middleware como `express-rate-limit` con almacenamiento persistente.

---

### A-04: Blacklist de tokens en memoria volátil

**Archivo:** `server/auth.ts:35`  
**Riesgo:** **ALTO** — Los tokens revocados se almacenan en un `Map` en memoria:
```typescript
const revokedTokens = new Map<string, number>();
```
- Se pierde al reiniciar el servidor (todos los tokens revocados vuelven a ser válidos)
- No funciona en multi-proceso
- La limpieza solo ocurre cada 30 minutos

**Solución:** Almacenar la blacklist en Redis o en la base de datos.

---

### A-05: Sin control de acceso basado en roles (RBAC)

**Archivo:** `server/auth.ts:137-154`  
**Riesgo:** **ALTO** — El sistema de autenticación tiene un solo rol (`admin`) y no hay diferenciación de permisos:
- Todos los usuarios autenticados pueden leer, crear, modificar y eliminar cualquier activo
- No hay roles de solo lectura, auditor, superadmin, etc.
- El rol está hardcodeado en la generación del token

**Solución:** Implementar un sistema de roles (admin, auditor, editor, view-only) y permisos granulares.

---

### A-06: Sin protección CSRF en el proxy PHP

**Archivo:** `api.php`  
**Riesgo:** **ALTO** — El proxy PHP reenvía todas las cabeceras y métodos HTTP sin verificar el origen de la solicitud:
```php
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
```
Aunque Express tiene CORS configurado, el proxy PHP no valida el origen ni implementa tokens CSRF.

**Solución:** Agregar verificación de origen y tokens CSRF en el proxy PHP, o asegurar que CORS esté correctamente configurado.

---

### A-07: Exposición de información del servidor en errores

**Archivo:** `server/index.ts:155-162`  
**Riesgo:** **ALTO** — El manejador de errores global muestra el mensaje de error real en errores no-500:
```typescript
res.status(status).json({
    error: status === 500 ? 'Error interno del servidor.' : (err.message || 'Error en la petición.')
});
```
Esto puede exponer información interna:
- Errores de base de datos con nombres de tablas y columnas
- Errores de sintaxis con rutas de archivos
- Stack traces

**Solución:** En producción, nunca mostrar mensajes de error internos. Usar IDs de error correlacionados con logs.

---

## 3. HALLAZGOS MEDIOS

### M-01: Sin validación de origen CORS en el proxy PHP

**Archivo:** `api.php`  
**Riesgo:** **MEDIO** — El proxy PHP no establece cabeceras CORS. Depende completamente de Express. Si Express falla, las cabeceras CORS no se envían. Además, el proxy reenvía cabeceras desde el backend al cliente sin sanitización:
```php
foreach ($header_lines as $line) {
    if ($line && stripos($line, 'Transfer-Encoding:') === false && stripos($line, 'Connection:') === false) {
        header($line);
    }
}
```

**Solución:** Configurar cabeceras CORS explícitamente en el proxy PHP también.

---

### M-02: Input validation insuficiente en campos de texto

**Archivo:** `server/routes/assets.ts`  
**Riesgo:** **MEDIO** — La validación de entrada permite contenido arbitrario en campos como `cargo`, `responsable`, `ubicacion`, `specification` sin restricción de caracteres especiales. Aunque se usan consultas parametrizadas (previniendo SQL Injection), no hay sanitización contra:
- XSS almacenado (los datos se renderizan en el frontend React, pero React escapa)
- Inyección de caracteres de control
- Longitud excesiva (solo en brand/model/serialNumber hay límite de 150)

**Solución:** Agregar validación de longitud y contenido para todos los campos de texto.

---

### M-03: Endpoint de reset sin autenticación de dos factores

**Archivo:** `server/index.ts:109-132`  
**Riesgo:** **MEDIO** — El reset de base de datos solo requiere:
1. Token JWT válido (un solo factor)
2. Cabecera `X-Confirm-Reset: confirm-delete-all-assets` (predecible)

Un atacante con un token JWT válido puede destruir toda la base de datos.

**Solución:** Requerir autenticación de dos factores o una contraseña adicional para el reset.

---

### M-04: Versiones de dependencias no actualizadas

**Archivo:** `package.json`  
**Riesgo:** **MEDIO** — Varias dependencias con versiones que pueden tener vulnerabilidades conocidas:
- `express@^4.21.2` — Última estable, pero revisar CVEs
- `mariadb@^3.5.2` — Versión reciente
- `dotenv@^17.2.3` — Última estable
- `jspdf@^4.2.1` — Revisar vulnerabilidades de XSS en versiones anteriores
- `xlsx@^0.18.5` — Revisar vulnerabilidades conocidas

**Solución:** Ejecutar `npm audit` regularmente y mantener dependencias actualizadas.

---

### M-05: Script de PowerShell con la URL del servidor hardcodeada

**Archivo:** `Auditar_PC_Windows.ps1:128`  
**Riesgo:** **MEDIO** — El script independiente (standalone) tiene la URL del servidor hardcodeada:
```powershell
$response = Invoke-RestMethod -Uri "https://inventarioti.simarp.net/api/assets/audit" -Method Post ...
```
- Si el endpoint es público (C-01), cualquiera que ejecute este script puede enviar datos
- Si el dominio cambia, el script queda obsoleto
- Exposición de la URL interna de la API

**Solución:** Hacer la URL configurable o leerla de un archivo de configuración.

---

## 4. HALLAZGOS BAJOS

### B-01: Cabecera `X-Powered-By` deshabilitada pero no otras

**Archivo:** `server/index.ts:33`  
**Riesgo:** **BAJO** — `app.disable('x-powered-by')` está correctamente implementado, pero no se deshabilitan otras cabeceras informativas.

**Solución:** Verificar y deshabilitar todas las cabeceras que revelen información del servidor.

---

### B-02: Logging de contraseñas en eventos fallidos

**Archivo:** `server/index.ts:56`  
**Riesgo:** **BAJO** — Aunque no se loguea la contraseña explícitamente, el objeto `{ username }` se loguea en intentos fallidos:
```typescript
auditLog('LOGIN_FAILED', { username }, req);
```
Si en el futuro se agrega más información del request body, se podría loguear la contraseña.

**Solución:** Asegurar que nunca se logueen contraseñas ni datos sensibles.

---

### B-03: Puerto de Vite Development Server expuesto

**Archivo:** `vite.config.ts:15-16`  
**Riesgo:** **BAJO** — El servidor de desarrollo de Vite se expone en `0.0.0.0:3000`:
```typescript
server: {
    port: 3000,
    host: '0.0.0.0',
```
En un entorno de desarrollo compartido, otros usuarios de la red pueden acceder al servidor de desarrollo.

**Solución:** En desarrollo local, usar `localhost` o `127.0.0.1`. Solo usar `0.0.0.0` si es necesario para acceso remoto.

---

## 5. BUENAS PRÁCTICAS EXISTENTES (MITIGACIONES)

| # | Práctica | Archivo |
|---|---|---|
| ✅ Uso de consultas parametrizadas (SQL Injection prevenido) | `server/db.ts`, `server/routes/assets.ts` |
| ✅ Cabeceras de seguridad HTTP (CSP, HSTS, X-Frame-Options, etc.) | `server/index.ts:34-41` |
| ✅ CORS restringido a orígenes conocidos | `server/index.ts:27-30` |
| ✅ JWT con expiración de 24 horas | `server/auth.ts:76` |
| ✅ Rate limiting en login (5 intentos/15 min) | `server/auth.ts:166-192` |
| ✅ Blacklist de tokens revocados | `server/auth.ts:35-45` |
| ✅ Auditoría de eventos de seguridad | `server/audit.ts` |
| ✅ Validación de formato IP/MAC | `server/routes/assets.ts:28-38` |
| ✅ Cabecera de confirmación para reset | `server/index.ts:110-111` |
| ✅ X-Powered-By deshabilitado | `server/index.ts:33` |
| ✅ Expiración automática de sesión en frontend (401 → logout) | `src/App.tsx:103` |

---

## 6. RECOMENDACIONES PRIORIZADAS

### Inmediatas (1-2 días)

1. **Rotar credenciales**: Cambiar `ADMIN_PASS`, `JWT_SECRET`, crear usuario DB con contraseña
2. **Proteger endpoint `/api/assets/audit`**: Agregar autenticación
3. **Eliminar secretos del código**: Remover fallbacks hardcodeados en `auth.ts`, `index.ts`, `db.ts`
4. **Eliminar archivos sensibles de `deployment_ready/`**: Borrar o sanitizar

### Corto plazo (1 semana)

5. **Migrar sesiones a cookies `HttpOnly`**: Reemplazar `localStorage`
6. **Implementar logging persistente**: Almacenar auditoría en archivos o BD
7. **Mover rate limiting y blacklist a Redis/BD**: Para soportar multi-proceso
8. **Implementar RBAC**: Roles básicos (admin, auditor, view-only)
9. **Eliminar licencias del código fuente**: Reemplazar con placeholders

### Mediano plazo (1 mes)

10. **Implementar 2FA para operaciones destructivas**
11. **Configurar WAF (Web Application Firewall)** en el servidor
12. **Realizar pruebas de penetración** exhaustivas
13. **Automatizar `npm audit`** en el pipeline de CI/CD

---

## 7. CONCLUSIÓN

La aplicación **Control de Inventario Informático** tiene una arquitectura sólida con buenas prácticas como consultas parametrizadas y cabeceras de seguridad. Sin embargo, presenta **9 vulnerabilidades críticas** que requieren atención inmediata, siendo las más urgentes:

- **Endpoint público sin autenticación** que permite modificar la base de datos
- **Credenciales y secretos hardcodeados** tanto en código como en archivos de configuración
- **Licencias de software expuestas** en el código fuente
- **Almacenamiento inseguro del token JWT** en localStorage
- **Secreto JWT débil** sin rotación

La combinación del endpoint público (C-01) con el script de PowerShell (M-05) significa que *cualquier persona con acceso a la red* puede ejecutar el script y modificar el inventario sin autenticación.

Se recomienda abordar los hallazgos críticos de forma inmediata y establecer un proceso de revisión de seguridad continua.

---

*Documento generado el 03 de junio de 2026 mediante auditoría manual de código fuente.*
