import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import pool from '../db';

const router = Router();

function safeJsonStringify(obj: any, indent?: number): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }, indent);
}

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface ObsolescenceReport {
  score: number;          // 0-10: 0=nuevo, 10=completamente obsoleto
  level: 'optimo' | 'aceptable' | 'atención' | 'crítico' | 'obsoleto';
  diagnosis: string;      // Diagnóstico textual
  estimatedLifeLeft: string; // Ej: "2 años", "6 meses", "Fin de vida"
  strengths: string[];    // Aspectos positivos del equipo
  weaknesses: string[];   // Aspectos negativos / limitaciones
  replacements: Array<{
    brand: string;
    model: string;
    estimatedPrice: string;
    reason: string;
    priority: 'alta' | 'media' | 'baja';
  }>;
  recommendation: string; // Acción recomendada resumida
}

// ── Endpoint: POST /api/ai/obsolescence ─────────────────────────────────────
router.post('/obsolescence', async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(503).json({
      error: 'Servicio de IA no configurado. Configure GEMINI_API_KEY en el servidor.'
    });
    return;
  }

  const { assetId, brand, model, category, specification, purchaseDate, notes, force = false } = req.body;

  if (!brand || !model || !category) {
    res.status(400).json({ error: 'Se requieren los campos brand, model y category.' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Si no se fuerza el análisis y tenemos un assetId, verificar si ya existe reporte en BD
    if (assetId && !force) {
      const cached = await conn.query('SELECT ai_report, ai_report_date FROM assets WHERE id = ?', [assetId]);
      if (cached.length > 0 && cached[0].ai_report) {
        try {
          const report = JSON.parse(cached[0].ai_report);
          res.json({
            success: true,
            report,
            cached: true,
            date: cached[0].ai_report_date
          });
          return;
        } catch (parseErr) {
          console.warn('[AI] Error parseando reporte cacheado, re-analizando...', parseErr);
        }
      }
    }

    // Calcular edad aproximada del equipo
    let ageText = 'desconocida';
    if (purchaseDate) {
      const purchased = new Date(purchaseDate);
      const now = new Date();
      const years = (now.getTime() - purchased.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (years < 1) {
        ageText = `${Math.round(years * 12)} meses`;
      } else {
        ageText = `${years.toFixed(1)} años`;
      }
    }

    // ── Prompt estructurado ───────────────────────────────────────────────────
    const prompt = `Eres un experto en tecnología informática corporativa especializado en gestión del ciclo de vida de activos TI.

Analiza el siguiente equipo de inventario informático y proporciona un informe de obsolescencia detallado:

**Datos del Equipo:**
- Categoría: ${category}
- Marca: ${brand}
- Modelo: ${model}
- Especificaciones técnicas: ${specification || 'No especificadas'}
- Fecha de adquisición: ${purchaseDate || 'Desconocida'} (Antigüedad: ${ageText})
- Observaciones: ${notes || 'Ninguna'}

**Instrucciones:**
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin markdown, sin texto adicional):

{
  "score": <número del 0 al 10, donde 0=nuevo/óptimo y 10=obsoleto total>,
  "level": <uno de: "optimo", "aceptable", "atención", "crítico", "obsoleto">,
  "diagnosis": "<diagnóstico técnico detallado de 2-3 oraciones explicando el estado del equipo>",
  "estimatedLifeLeft": "<tiempo de vida útil estimado restante, ej: '3 años', '18 meses', 'Fin de vida útil'>",
  "strengths": ["<fortaleza 1>", "<fortaleza 2>"],
  "weaknesses": ["<debilidad 1>", "<debilidad 2>", "<debilidad 3>"],
  "replacements": [
    {
      "brand": "<marca del equipo sugerido>",
      "model": "<modelo específico sugerido>",
      "estimatedPrice": "<precio estimado en USD, ej: '$450 - $600'>",
      "reason": "<razón técnica por la que este equipo es una buena alternativa>",
      "priority": "<'alta', 'media' o 'baja'>"
    }
  ],
  "recommendation": "<acción concreta recomendada: Mantener / Programar reemplazo / Reemplazar inmediatamente / Reasignar a tarea menor>"
}

Proporciona entre 2 y 3 alternativas de reemplazo realistas y disponibles en el mercado actual.
Considera el tipo de organización (inventario informático corporativo) y enfócate en la relación precio/rendimiento.`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const rawText = response.text || '';
    const jsonStr = rawText.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let report: ObsolescenceReport;
    try {
      report = JSON.parse(jsonStr);
    } catch {
      // Si el JSON falla, intentar extraerlo del texto
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        report = JSON.parse(match[0]);
      } else {
        throw new Error('La IA no devolvió un JSON válido');
      }
    }

    // Validar campos mínimos
    if (typeof report.score !== 'number' || !report.diagnosis) {
      throw new Error('Respuesta de IA incompleta o inválida');
    }

    // Sanitizar: eliminar cualquier propiedad circular antes de guardar/enviar
    report = JSON.parse(safeJsonStringify(report));

    // 2. Guardar en base de datos si tenemos assetId
    if (assetId) {
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await conn.query(
        'UPDATE assets SET ai_report = ?, ai_report_date = ? WHERE id = ?',
        [safeJsonStringify(report), nowStr, assetId]
      );
    }

    res.json({
      success: true,
      report,
      cached: false,
      date: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[AI] Error en análisis de obsolescencia:', err);

    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('403')) {
      res.status(401).json({ error: 'Clave de API de Gemini inválida. Verifique GEMINI_API_KEY.' });
      return;
    }
    if (err.message?.includes('quota') || err.message?.includes('429')) {
      res.status(429).json({ error: 'Límite de solicitudes a la IA alcanzado. Intente en unos minutos.' });
      return;
    }

    const errorMsg = err.message || 'Error durante el análisis de IA';
    console.error('[AI] Stack:', err.stack);
    next(new Error(errorMsg));
  } finally {
    if (conn) conn.release();
  }
});

// ── Endpoint: POST /api/ai/obsolescence/bulk ─────────────────────────────────
// Analiza múltiples activos en paralelo (máx 5 para no saturar la API)
router.post('/obsolescence/bulk', async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(503).json({ error: 'Servicio de IA no configurado.' });
    return;
  }

  const { assets } = req.body as { assets: any[] };
  if (!assets || !Array.isArray(assets) || assets.length === 0) {
    res.status(400).json({ error: 'Se requiere un array de activos.' });
    return;
  }

  // Limitar a 10 activos por llamada para no saturar
  const limited = assets.slice(0, 10);

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Procesar en lotes de 3 para respetar rate limits
    const results: Record<string, any> = {};
    const batchSize = 3;

    for (let i = 0; i < limited.length; i += batchSize) {
      const batch = limited.slice(i, i + batchSize);
      await Promise.all(batch.map(async (asset) => {
        const ageText = asset.purchaseDate
          ? (() => {
              const years = (Date.now() - new Date(asset.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
              return years < 1 ? `${Math.round(years * 12)} meses` : `${years.toFixed(1)} años`;
            })()
          : 'desconocida';

        const prompt = `Analiza este equipo de inventario TI y responde SOLO con JSON válido (sin markdown):
Categoría: ${asset.category}, Marca: ${asset.brand}, Modelo: ${asset.model}
Specs: ${asset.specification || 'N/A'}, Antigüedad: ${ageText}

Formato JSON requerido:
{"score":<0-10>,"level":"<optimo|aceptable|atención|crítico|obsoleto>","diagnosis":"<2 oraciones>","estimatedLifeLeft":"<tiempo>","recommendation":"<acción>","replacements":[{"brand":"<marca>","model":"<modelo>","estimatedPrice":"<precio USD>","reason":"<razón>","priority":"<alta|media|baja>"}]}`;

        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
          });
          
          let jsonStr = (response.text || '').trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
          const match = jsonStr.match(/\{[\s\S]*\}/);
          if (match) results[asset.id] = JSON.parse(match[0]);
        } catch {
          results[asset.id] = { error: 'No se pudo analizar este equipo' };
        }
      }));

      // Pausa entre lotes
      if (i + batchSize < limited.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({ success: true, results, analyzed: Object.keys(results).length });
  } catch (err: any) {
    next(err);
  }
});

export default router;
