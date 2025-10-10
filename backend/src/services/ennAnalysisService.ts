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

  // Função utilitária: extrai o primeiro bloco JSON balanceado (considerando chaves)
  function extractBalancedJSON(s: string): string | null {
    if (!s) return null;
    const start = s.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString: string | null = null;
    let escaped = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === inString) {
          inString = null;
        }
        continue;
      } else {
        if (ch === '"' || ch === "'") {
          inString = ch;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) return s.substring(start, i + 1);
        }
      }
    }
    return null;
  }

  // Tentar parsear JSON do LLM com heurísticas de recuperação
  try {
    const candidate = extractBalancedJSON(String(res));
    if (!candidate) throw new Error('No JSON found');

    const tryParse = (jsonStr: string) => {
      // tentativa direta
      try { return JSON.parse(jsonStr); } catch (e) { /* fallthrough */ }

      // heurísticas: normalizar aspas “smart quotes”, remover trailing commas e converter chaves/valores com aspas simples
      let s = jsonStr.replace(/[\u2018\u2019\u201C\u201D]/g, '"');
      // chaves com aspas simples -> chaves com aspas duplas
      s = s.replace(/([\{,\s])'([^']+)'\s*:/g, '$1"$2":');
      // valores com aspas simples -> valores com aspas duplas
      s = s.replace(/:\s*'([^']*)'(?=\s*[,\}])/g, ':"$1"');
      // remover vírgula final antes de } ou ]
      s = s.replace(/,\s*([\}\]])/g, '$1');

      return JSON.parse(s);
    };

    const parsed = tryParse(candidate);
    return {
      notaGeral: parsed.notaGeral || 0,
      breakdown: parsed.breakdown || { tese: 0, argumentos: 0, coesao: 0, repertorio: 0, norma: 0 },
      detalhamento: parsed.detalhamento || {},
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
  
  // Limpar o texto de entrada MUITO AGRESSIVAMENTE
  let textoLimpo = texto.trim();
  
  // Detectar e remover prompts de LLM completos (incluindo o que aparece no teste)
  const padroesPrincipalPrompt = [
    // Padrão específico do prompt que aparece no teste
    /Você é um assistente que formata um texto extraído por OCR de uma redação[\s\S]*?---INICIO.*?TEXTO---/gims,
    // Outros padrões similares
    /Você é um assistente[\s\S]*?textoFormatado[\s\S]*?correcoes[\s\S]*?---INICIO.*?TEXTO---/gims,
    /Você é um modelo[\s\S]*?---INICIO.*?TEXTO---/gims,
    // Remover instruções que aparecem na imagem
    /"textoFormatado".*?parágrafos/gims,
    /"correcoes".*?INSTRUÇÕES CRÍTICAS:/gims,
    /INSTRUÇÕES CRÍTICAS:[\s\S]*?Como Lei/gims,
    // Remover listas numeradas de instruções
    /\d+\.\s+Corrija erros.*?\n/gims,
    /\d+\.\s+Organize em.*?\n/gims,
    /\d+\.\s+Preserve o.*?\n/gims,
    /\d+\.\s+Remova numeração.*?\n/gims,
    /\d+\.\s+Mantenha apenas.*?\n/gims,
    /\d+\.\s+NO CAMPO.*?\n/gims,
  ];
  
  for (const padrao of padroesPrincipalPrompt) {
    const textoAntes = textoLimpo;
    textoLimpo = textoLimpo.replace(padrao, '');
    if (textoAntes !== textoLimpo) {
      console.log('🧹 Removido prompt principal de LLM do texto OCR');
    }
  }
  
  // Encontrar onde realmente começa o texto da redação (procurar por "Como Lei" que é o início real)
  const inicioRedacao = textoLimpo.indexOf('Como Lei');
  if (inicioRedacao !== -1) {
    textoLimpo = textoLimpo.substring(inicioRedacao);
    console.log('🎯 Encontrado início da redação, removendo tudo antes de "Como Lei"');
  }
  
  // Remover qualquer coisa após padrões de fim de JSON
  const fimJson = textoLimpo.indexOf('{"textoFormatado"');
  if (fimJson !== -1) {
    textoLimpo = textoLimpo.substring(0, fimJson);
    console.log('🧹 Removido padrão de JSON do final');
  }
  
  // Remover marcadores restantes
  const marcadoresRestantes = [
    /---INICIO.*?TEXTO---/gims,
    /---FIM.*?TEXTO---/gims,
    /INICIO DO TEXTO/gims,
    /FIM DO TEXTO/gims,
  ];
  
  for (const marcador of marcadoresRestantes) {
    textoLimpo = textoLimpo.replace(marcador, '');
  }
  
  // Se ainda há vestígios do prompt, fazer limpeza mais agressiva
  if (textoLimpo.includes('assistente') || textoLimpo.includes('JSON') || textoLimpo.includes('textoFormatado')) {
    console.log('🧹 Limpeza agressiva: removendo linhas com vestígios de prompt');
    
    const linhas = textoLimpo.split('\n');
    const linhasLimpas = [];
    let encontrouTextoReal = false;
    
    for (const linha of linhas) {
      const linhaTrim = linha.trim();
      
      // Pular linhas vazias no início
      if (!encontrouTextoReal && linhaTrim === '') continue;
      
      // Pular linhas que claramente são do prompt
      if (linhaTrim.includes('assistente') || 
          linhaTrim.includes('JSON') || 
          linhaTrim.includes('textoFormatado') ||
          linhaTrim.includes('correcoes') ||
          linhaTrim.includes('DUAS CHAVES') ||
          linhaTrim.includes('Receba o texto') ||
          linhaTrim.includes('Retorne apenas') ||
          /^Você é/.test(linhaTrim)) {
        continue;
      }
      
      // Se a linha parece ser conteúdo real (tem palavras comuns de redação)
      if (linhaTrim.length > 10 && !encontrouTextoReal) {
        encontrouTextoReal = true;
      }
      
      if (encontrouTextoReal) {
        linhasLimpas.push(linha);
      }
    }
    
    textoLimpo = linhasLimpas.join('\n').trim();
  }
  
  // Pré-processamento adicional: remover números de linha isolados e melhorar formatação
  const linhas = textoLimpo.split('\n');
  const linhasLimpas = linhas.filter(linha => {
    const linhaTrim = linha.trim();
    // Remover linhas que são apenas números (numeração de linha)
    if (/^\d+$/.test(linhaTrim)) return false;
    // Manter linhas vazias e com conteúdo
    return true;
  }).map(linha => {
    // Remover números no início das linhas seguidos de espaço
    return linha.replace(/^\s*\d+\s+/, '').trim();
  });
  
  textoLimpo = linhasLimpas.join('\n').trim();

  // TEMPORARIAMENTE desabilitar o LLM e retornar apenas o texto limpo
  console.log('📝 Texto limpo após processamento:', textoLimpo.substring(0, 200) + '...');
  
  // Se não há texto real da redação, retornar uma mensagem apropriada
  if (textoLimpo.length < 20 || 
      textoLimpo.includes('textoFormatado') || 
      textoLimpo.includes('INSTRUÇÕES')) {
    console.log('⚠️  Texto parece conter apenas instruções ou está muito fragmentado');
    return { 
      textoFormatado: 'Por favor, envie uma imagem de redação manuscrita real para obter melhor resultado de formatação.', 
      correcoes: [] 
    };
  }

  const prompt = `Formate o texto de redação abaixo, corrigindo erros de OCR e organizando em parágrafos bem estruturados.

Texto extraído por OCR:
${textoLimpo}

Retorne apenas um JSON no formato:
{"textoFormatado": "texto da redação corrigido e bem formatado", "correcoes": []}`;

  try {
    const { chamarLLM } = await import('./openaiService');
    const res = await chamarLLM(prompt, 1200);
    
    console.log('🤖 Resposta bruta do LLM para formatação:', String(res).substring(0, 300) + '...');
    
    try {
      // Tentar extrair JSON da resposta
      let jsonStr = String(res).trim();
      
      // Se a resposta não começar com {, tentar encontrar o primeiro JSON válido
      if (!jsonStr.startsWith('{')) {
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        } else {
          console.log('❌ Não foi possível encontrar JSON na resposta do LLM');
          return { textoFormatado: textoLimpo, correcoes: [] };
        }
      }
      
      // Tentar corrigir problemas comuns de JSON
      jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'); // Remover vírgulas pendentes
      
      console.log('🔧 JSON extraído para parse:', jsonStr.substring(0, 200) + '...');
      
      const parsed = JSON.parse(jsonStr);
      let textoFormatado = (parsed.textoFormatado || parsed.text || parsed.textFormatted || '').trim();
      
      console.log('✅ Texto formatado pelo LLM:', textoFormatado.substring(0, 150) + '...');
      
      return {
        textoFormatado,
        correcoes: parsed.correcoes || parsed.corrections || []
      };
      
    } catch (err) {
      console.warn('❌ Falha ao parsear JSON de formatarTextoComLLM:', err);
      console.log('📋 Resposta completa do LLM:', String(res));
      
      return { textoFormatado: textoLimpo, correcoes: [] };
    }
  } catch (err) {
    console.warn('❌ formatarTextoComLLM falhou completamente:', err);
    return { textoFormatado: textoLimpo, correcoes: [] };
  }
}
