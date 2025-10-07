import { chamarLLM } from './openaiService';
import { analisarTexto } from './analiseService';

export interface DetalheCompetencia {
  nota: number;
  comentario: string;
  problemas: string[];
  orientacoes: string[]; // ações concretas para melhorar
}

export interface AnaliseENEM {
  notaGeral: number;
  breakdown: {
    tese: number;
    argumentos: number;
    coesao: number;
    repertorio: number;
    norma: number;
  };
  // detalhamento por competência com problemas e orientações práticas
  detalhamento?: {
    tese?: DetalheCompetencia;
    argumentos?: DetalheCompetencia;
    coesao?: DetalheCompetencia;
    repertorio?: DetalheCompetencia;
    norma?: DetalheCompetencia;
  };
  comentarios: string[];
  pontosFavoraveis: string[];
  pontosMelhoria: string[];
  sugestoes: string[];
  textoUsado: string;
}

const promptTemplate = (texto: string) => `Você é um avaliador de redações segundo os critérios oficiais do ENEM.

Para cada uma das 5 competências abaixo, avalie o texto e responda de forma estruturada:
- Competência I (tese/posicionamento) - peso: 30%
- Competência II (argumentação e desenvolvimento) - peso: 30%
- Competência III (coerência e coesão) - peso: 20%
- Competência IV (repertório sociocultural) - peso: 10%
- Competência V (norma culta da língua escrita) - peso: 10%

Para cada competência, devolva:
- nota: um número entre 0 e 10 (com até uma casa decimal)
- comentario: uma justificativa breve (1-2 frases)
- problemas: lista (até 4) de pontos específicos detectados naquela competência
- orientacoes: lista (até 4) de ações concretas que o autor pode tomar para melhorar

Calcule a notaGeral como soma ponderada das notas acima (usar pesos indicados) e devolva com 2 casas decimais.

Retorne APENAS um JSON com estas chaves: notaGeral, breakdown, detalhamento, comentarios, pontosFavoraveis, pontosMelhoria, sugestoes, textoUsado

O campo "breakdown" deve conter as notas numéricas por competência (chaves: tese, argumentos, coesao, repertorio, norma).
O campo "detalhamento" deve conter, para cada competência, um objeto com nota, comentario, problemas e orientacoes.

Texto a ser avaliado:
---INICIO TEXTO---
${texto}
---FIM TEXTO---
`;

export async function analisarEnem(texto: string): Promise<AnaliseENEM> {
  if (!texto || texto.trim().length === 0) {
    return {
      notaGeral: 0,
      breakdown: { tese: 0, argumentos: 0, coesao: 0, repertorio: 0, norma: 0 },
      detalhamento: {},
      comentarios: ['Nenhum texto para avaliar.'],
      pontosFavoraveis: [],
      pontosMelhoria: [],
      sugestoes: [],
      textoUsado: texto,
    };
  }

  // Se não houver chave de API, usar fallback local (analiseService)
  if (!process.env.OPENAI_API_KEY) {
    const local = analisarTexto(texto);
    const notaGeral = Math.round((local.pontuacao / 100) * 10 * 100) / 100; // escala 0-100 -> 0-10
    const fallbackDetailed = {
      tese: { nota: Math.min(10, notaGeral), comentario: 'Avaliação automática (fallback)', problemas: local.pontosNegativos.slice(0,3), orientacoes: local.sugestoes.slice(0,3) },
      argumentos: { nota: Math.min(10, notaGeral), comentario: 'Avaliação automática (fallback)', problemas: local.pontosNegativos.slice(0,3), orientacoes: local.sugestoes.slice(0,3) },
      coesao: { nota: Math.min(10, Math.round((local.estatisticas.frases > 0 ? 6 : 3))), comentario: 'Estrutura estimada', problemas: [], orientacoes: [] },
      repertorio: { nota: 0, comentario: 'Sem repertório detectado (fallback)', problemas: [], orientacoes: [] },
      norma: { nota: Math.min(10, Math.round(Math.max(0, local.qualidadeOCR.confiabilidade) / 10 * 100) / 100), comentario: 'Avaliação com base na qualidade do texto', problemas: local.qualidadeOCR.problemas.slice(0,3), orientacoes: local.sugestoes.slice(0,3) }
    };

    return {
      notaGeral,
      breakdown: {
        tese: fallbackDetailed.tese.nota,
        argumentos: fallbackDetailed.argumentos.nota,
        coesao: fallbackDetailed.coesao.nota,
        repertorio: fallbackDetailed.repertorio.nota,
        norma: fallbackDetailed.norma.nota,
      },
      detalhamento: fallbackDetailed,
      comentarios: local.pontosPositivos,
      pontosFavoraveis: local.pontosPositivos,
      pontosMelhoria: local.pontosNegativos,
      sugestoes: local.sugestoes,
      textoUsado: texto,
    };
  }

  const prompt = promptTemplate(texto);
  const res = await chamarLLM(prompt, 1200);

  // Tentar parsear JSON do LLM
  try {
    const firstJsonMatch = res.match(/\{[\s\S]*\}/);
    if (!firstJsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(firstJsonMatch[0]);
    return {
      notaGeral: parsed.notaGeral || 0,
      breakdown: parsed.breakdown || { tese: 0, argumentos: 0, coesao: 0, repertorio: 0, norma: 0 },
      detalhamento: parsed.detalhamento || parsed.detalhamento || {},
      comentarios: parsed.comentarios || [],
      pontosFavoraveis: parsed.pontosFavoraveis || [],
      pontosMelhoria: parsed.pontosMelhoria || [],
      sugestoes: parsed.sugestoes || [],
      textoUsado: parsed.textoUsado || texto,
    };
  } catch (err) {
    return {
      notaGeral: 0,
      breakdown: { tese: 0, argumentos: 0, coesao: 0, repertorio: 0, norma: 0 },
      detalhamento: {},
      comentarios: ['Não foi possível gerar análise estruturada. Saída bruta: ' + String(res).substring(0, 500)],
      pontosFavoraveis: [],
      pontosMelhoria: [],
      sugestoes: [],
      textoUsado: texto,
    };
  }
}

/**
 * Formata/normaliza o texto extraído pelo OCR usando o LLM para deixá-lo mais compreensível
 * Retorna o texto reformatado (sem outras meta-informações)
 */
export type FormatarResultado = {
  textoFormatado: string;
  correcoes: Array<{ original: string; sugerido: string; motivo?: string }>;
};

export async function formatarTextoComLLM(texto: string): Promise<FormatarResultado> {
  if (!texto || texto.trim().length === 0) return { textoFormatado: texto, correcoes: [] };
  const prompt = `Você é um assistente que formata um texto extraído por OCR de uma redação.\n\nReceba o texto abaixo e retorne APENAS um JSON com DUAS CHAVES: "textoFormatado" (o texto reescrito e corrigido) e "correcoes" (uma lista de objetos com {original, sugerido, motivo}).\n\nO texto formatado deve preservar o sentido original, corrigir erros de OCR e erros ortográficos/gramaticais óbvios, e organizar parágrafos adequadamente. A lista de correcoes deve conter somente correções que o modelo sugere (não aplique no texto, apenas liste).\n\nRetorne apenas o JSON. Não inclua comentários extras.\n\n---INICIO TEXTO---\n${texto}\n---FIM TEXTO---`;

  try {
    const { chamarLLM } = await import('./openaiService');
    const res = await chamarLLM(prompt, 1000);
    try {
      const firstJsonMatch = String(res).match(/\{[\s\S]*\}/);
      if (firstJsonMatch) {
        const parsed = JSON.parse(firstJsonMatch[0]);
        return {
          textoFormatado: (parsed.textoFormatado || parsed.text || parsed.textFormatted || '').trim(),
          correcoes: parsed.correcoes || parsed.corrections || []
        };
      }
      // se não veio JSON, considerar toda a resposta como texto formatado
      return { textoFormatado: String(res).trim(), correcoes: [] };
    } catch (err) {
      console.warn('Falha ao parsear JSON de formatarTextoComLLM:', err);
      return { textoFormatado: String(res).trim(), correcoes: [] };
    }
  } catch (err) {
    console.warn('formatarTextoComLLM falhou:', err);
    return { textoFormatado: texto, correcoes: [] };
  }
}
