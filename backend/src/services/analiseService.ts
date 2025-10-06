/**
 * Serviço de análise de texto para feedback de redações
 */

export interface AnaliseTexto {
  pontuacao: number;
  pontosPositivos: string[];
  pontosNegativos: string[];
  sugestoes: string[];
  qualidadeOCR: {
    nivel: 'baixa' | 'media' | 'alta';
    problemas: string[];
    confiabilidade: number;
  };
  estatisticas: {
    palavras: number;
    caracteres: number;
    paragrafos: number;
    frases: number;
  };
}

export const analisarTexto = (texto: string): AnaliseTexto => {
  const textoLimpo = texto.trim();
  
  // Estatísticas básicas
  const palavras = textoLimpo ? textoLimpo.split(/\s+/).filter(p => p.length > 0) : [];
  const caracteres = textoLimpo.length;
  const paragrafos = textoLimpo.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  const frases = textoLimpo.split(/[.!?]+/).filter(f => f.trim().length > 0).length;

  // Análise da qualidade do OCR
  const qualidadeOCR = analisarQualidadeOCR(textoLimpo);
  
  // Análise do conteúdo
  const pontuacao = calcularPontuacao(textoLimpo, qualidadeOCR.confiabilidade);
  const pontosPositivos = identificarPontosPositivos(textoLimpo, palavras.length);
  const pontosNegativos = identificarPontosNegativos(textoLimpo, qualidadeOCR);
  const sugestoes = gerarSugestoes(textoLimpo, qualidadeOCR, palavras.length);

  return {
    pontuacao,
    pontosPositivos,
    pontosNegativos,
    sugestoes,
    qualidadeOCR,
    estatisticas: {
      palavras: palavras.length,
      caracteres,
      paragrafos,
      frases
    }
  };
};

const analisarQualidadeOCR = (texto: string) => {
  const problemas: string[] = [];
  let confiabilidade = 100;

  if (!texto || texto.trim().length === 0) {
    return {
      nivel: 'baixa' as const,
      problemas: ['Nenhum texto foi detectado na imagem'],
      confiabilidade: 0
    };
  }

  // Detectar caracteres estranhos ou malformados
  const caracteresEstranhos = texto.match(/[^\w\s\p{L}\p{N}\p{P}]/gu);
  if (caracteresEstranhos && caracteresEstranhos.length > 0) {
    problemas.push('Caracteres não reconhecidos detectados');
    confiabilidade -= 20;
  }

  // Detectar palavras muito fragmentadas
  const palavrasCurtas = texto.split(/\s+/).filter(p => p.length === 1 || p.length === 2);
  const totalPalavras = texto.split(/\s+/).length;
  const proporcaoFragmentada = palavrasCurtas.length / totalPalavras;
  
  if (proporcaoFragmentada > 0.3) {
    problemas.push('Muitas palavras fragmentadas - possível problema de qualidade da imagem');
    confiabilidade -= 30;
  }

  // Detectar falta de espaçamento
  const palavrasColadas = texto.match(/[a-záéíóúâêîôûãõç]{15,}/gi);
  if (palavrasColadas && palavrasColadas.length > 0) {
    problemas.push('Palavras muito longas detectadas - possível falta de espaçamento');
    confiabilidade -= 15;
  }

  // Detectar ausência de pontuação
  const temPontuacao = /[.!?,:;]/.test(texto);
  if (!temPontuacao && texto.length > 50) {
    problemas.push('Nenhuma pontuação detectada');
    confiabilidade -= 10;
  }

  // Detectar repetições estranhas
  const repeticoes = texto.match(/(.{2,})\1{2,}/g);
  if (repeticoes && repeticoes.length > 0) {
    problemas.push('Padrões repetitivos detectados');
    confiabilidade -= 15;
  }

  let nivel: 'baixa' | 'media' | 'alta' = 'alta';
  if (confiabilidade < 40) nivel = 'baixa';
  else if (confiabilidade < 70) nivel = 'media';

  return { nivel, problemas, confiabilidade };
};

const calcularPontuacao = (texto: string, confiabilidadeOCR: number): number => {
  if (!texto || texto.trim().length === 0) return 0;

  const palavras = texto.split(/\s+/).filter(p => p.length > 0);
  let pontos = 0;

  // Pontuação base por extensão
  if (palavras.length >= 150) pontos += 30;
  else if (palavras.length >= 100) pontos += 20;
  else if (palavras.length >= 50) pontos += 10;
  else pontos += 5;

  // Pontuação por estrutura
  const temParagrafos = texto.split(/\n\s*\n/).length > 1;
  if (temParagrafos) pontos += 10;

  const temPontuacao = /[.!?]/.test(texto);
  if (temPontuacao) pontos += 10;

  // Penalizar por baixa qualidade OCR
  pontos = pontos * (confiabilidadeOCR / 100);

  return Math.min(pontos, 100);
};

const identificarPontosPositivos = (texto: string, numPalavras: number): string[] => {
  const pontos: string[] = [];

  if (numPalavras >= 150) {
    pontos.push('Texto com extensão adequada para uma redação');
  }

  if (/[.!?]/.test(texto)) {
    pontos.push('Presença de pontuação detectada');
  }

  if (texto.split(/\n\s*\n/).length > 1) {
    pontos.push('Estrutura de parágrafos identificada');
  }

  const palavrasComplexas = texto.match(/\b\w{8,}\b/g);
  if (palavrasComplexas && palavrasComplexas.length > 5) {
    pontos.push('Vocabulário variado detectado');
  }

  if (/\b(portanto|contudo|entretanto|além disso|por outro lado|consequentemente)\b/i.test(texto)) {
    pontos.push('Conectores argumentativos identificados');
  }

  return pontos.length > 0 ? pontos : ['Texto extraído com sucesso'];
};

const identificarPontosNegativos = (texto: string, qualidadeOCR: any): string[] => {
  const pontos: string[] = [];

  if (qualidadeOCR.nivel === 'baixa') {
    pontos.push('Qualidade de OCR baixa - texto pode estar incompleto');
  }

  const palavras = texto.split(/\s+/).filter(p => p.length > 0);
  if (palavras.length < 50) {
    pontos.push('Texto muito curto para uma redação completa');
  }

  if (!/[.!?]/.test(texto) && texto.length > 50) {
    pontos.push('Ausência de pontuação final');
  }

  const proporcaoMinusculas = (texto.match(/[a-z]/g) || []).length / texto.length;
  if (proporcaoMinusculas < 0.3 && texto.length > 20) {
    pontos.push('Possível problema com detecção de maiúsculas/minúsculas');
  }

  // Verificar se há muitos caracteres especiais
  const caracteresEspeciais = (texto.match(/[^\w\s\p{L}\p{P}]/gu) || []).length;
  if (caracteresEspeciais > texto.length * 0.1) {
    pontos.push('Muitos caracteres não reconhecidos');
  }

  return pontos;
};

const gerarSugestoes = (texto: string, qualidadeOCR: any, numPalavras: number): string[] => {
  const sugestoes: string[] = [];

  if (qualidadeOCR.nivel === 'baixa') {
    sugestoes.push('Tente usar uma imagem com melhor qualidade e contraste');
    sugestoes.push('Certifique-se de que o texto está bem iluminado e nítido');
  }

  if (numPalavras < 100) {
    sugestoes.push('Considere desenvolver mais o texto para atingir o mínimo recomendado');
  }

  if (qualidadeOCR.problemas.includes('Muitas palavras fragmentadas')) {
    sugestoes.push('A imagem pode estar com resolução baixa - tente uma imagem maior');
  }

  if (qualidadeOCR.problemas.includes('Nenhuma pontuação detectada')) {
    sugestoes.push('Verifique se a pontuação está clara na imagem original');
  }

  if (sugestoes.length === 0) {
    sugestoes.push('Continue desenvolvendo o texto e revise a estrutura argumentativa');
  }

  return sugestoes;
};