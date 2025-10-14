
import { chamarLLM } from './openaiService';

// --- Interfaces para a Análise Estruturada do ENEM ---

export interface DetalheCompetencia {
    nome: string; // Ex: "Competência I: Demonstrar domínio da modalidade escrita formal da língua portuguesa."
    nota: number; // Nota de 0 a 200 (em múltiplos de 40)
    comentario: string;
    pontosFortes: string[];
    pontosAMelhorar: string[];
}

export interface AnaliseENEM {
    notaFinal1000: number;
    tesePrincipal: string; // A tese identificada pelo LLM
    tituloSugerido: string;
    comentarioGeral: string;
    competencias: {
        c1: DetalheCompetencia;
        c2: DetalheCompetencia;
        c3: DetalheCompetencia;
        c4: DetalheCompetencia;
        c5: DetalheCompetencia;
    };
    textoUsadoParaAnalise: string;
}

/**
 * Gera um prompt detalhado para o LLM, instruindo-o a avaliar uma redação
 * segundo os critérios rigorosos e a escala de pontuação do ENEM.
 * @param texto O texto da redação a ser avaliada.
 */
const promptTemplateEnem = (texto: string): string => `
Você é um corretor especialista em redações do ENEM, agindo com extremo rigor e precisão, conforme a "Cartilha do Participante". Sua tarefa é avaliar o texto a seguir. Pense passo a passo para cada competência antes de gerar a resposta final.

A avaliação de cada competência DEVE seguir a escala oficial: 0, 40, 80, 120, 160 ou 200 pontos.

Texto para avaliação:
"""
${texto}
"""

Sua resposta DEVE ser um único objeto JSON, sem nenhum texto introdutório ou final. A estrutura do JSON é a seguinte:

{
  "notaFinal1000": <number>,
  "tesePrincipal": "Identifique e transcreva a tese central defendida no texto.",
  "tituloSugerido": "Crie um título criativo e coerente com o tema e a tese da redação.",
  "comentarioGeral": "Escreva um parágrafo de feedback geral (2-3 frases) resumindo a performance do autor, destacando o principal ponto positivo e a principal área para desenvolvimento.",
  "competencias": {
    "c1": { "nome": "Competência I: Domínio da norma culta", "nota": <0-200>, "comentario": "Justifique a nota com base em desvios gramaticais, de convenções e de escolha vocabular.", "pontosFortes": ["Exemplo de ponto forte."], "pontosAMelhorar": ["Exemplo de desvio específico encontrado."] },
    "c2": { "nome": "Competência II: Compreensão do tema e repertório", "nota": <0-200>, "comentario": "Avalie a abordagem completa ao tema, a estrutura dissertativa e o uso produtivo do repertório sociocultural.", "pontosFortes": ["Uso produtivo do repertório."], "pontosAMelhorar": ["Repertório apenas expositivo."] },
    "c3": { "nome": "Competência III: Coerência e argumentação", "nota": <0-200>, "comentario": "Analise o projeto de texto, a seleção de argumentos e a progressão lógica das ideias.", "pontosFortes": ["Clara progressão temática entre parágrafos."], "pontosAMelhorar": ["Argumento contraditório ou mal desenvolvido."] },
    "c4": { "nome": "Competência IV: Coesão textual", "nota": <0-200>, "comentario": "Verifique o uso de conectivos e a articulação entre frases e parágrafos. Evite generalidades.", "pontosFortes": ["Bom uso de conectivos interparágrafos."], "pontosAMelhorar": ["Repetição excessiva da palavra 'problema'."] },
    "c5": { "nome": "Competência V: Proposta de intervenção", "nota": <0-200>, "comentario": "A proposta contém os 5 elementos obrigatórios (Agente, Ação, Meio, Finalidade, Detalhamento)? É articulada com a discussão?", "pontosFortes": ["Proposta com os 5 elementos bem definidos."], "pontosAMelhorar": ["Faltou o detalhamento do agente ou da ação."] }
  },
  "notaCoerente": <boolean>
}

INSTRUÇÃO CRÍTICA: A "notaFinal1000" DEVE ser a soma exata das notas das 5 competências. O campo "notaCoerente" deve ser 'true' se a soma estiver correta, e 'false' caso contrário. Verifique sua matemática antes de responder.
`;

/**
 * Envia o texto de uma redação para ser analisado por um LLM com base nos critérios do ENEM.
 * @param texto O texto completo da redação.
 * @returns Uma promessa que resolve com o objeto de análise estruturado.
 */
export async function analisarEnem(texto: string): Promise<AnaliseENEM> {
    if (!texto || texto.trim().length < 50) {
        throw new Error("Texto muito curto para uma análise ENEM significativa.");
    }

    const prompt = promptTemplateEnem(texto);
    const respostaLLM = await chamarLLM(prompt, 2048, 0.2);

    try {
        const jsonMatch = respostaLLM.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('LLM não retornou um JSON válido.');

        const parsed: any = JSON.parse(jsonMatch[0]);
        if (!parsed.competencias?.c1) throw new Error('A estrutura do JSON retornado está incompleta.');

        // --- INÍCIO DA VALIDAÇÃO E CORREÇÃO DA NOTA ---
        const c = parsed.competencias;
        const somaManual = (c.c1.nota || 0) + (c.c2.nota || 0) + (c.c3.nota || 0) + (c.c4.nota || 0) + (c.c5.nota || 0);

        if (somaManual !== parsed.notaFinal1000) {
            console.warn(`Correção de nota: IA reportou ${parsed.notaFinal1000}, mas a soma correta é ${somaManual}. Corrigindo...`);
            parsed.notaFinal1000 = somaManual;
        }
        // --- FIM DA VALIDAÇÃO E CORREÇÃO DA NOTA ---

        return parsed as AnaliseENEM;

    } catch (err: any) {
        console.error('Falha ao parsear a análise ENEM do LLM:', err.message);
        console.error('Resposta bruta do LLM:', respostaLLM);
        throw new Error(`Ocorreu um erro ao processar a análise da redação: ${err.message}`);
    }
}

/**
 * Usa o LLM para corrigir erros de OCR, formatação e gramática básica.
 * @param texto O texto bruto extraído do OCR.
 * @returns Um objeto contendo o texto formatado.
 */
export async function formatarTextoComLLM(texto: string): Promise<{ textoFormatado: string }> {
    if (!texto || texto.trim().length === 0) {
        return { textoFormatado: "" };
    }

    const prompt = `
        Você é um assistente de limpeza de texto. Sua tarefa é pegar o texto abaixo, que foi extraído de uma redação manuscrita por OCR, e realizar as seguintes ações:
        1. Corrija erros óbvios de OCR e digitação (ex: "motivncao" -> "motivação").
        2. Junte palavras que foram separadas incorretamente.
        3. Organize o texto em parágrafos, adicionando uma quebra de linha dupla entre eles.
        4. Preserve a intenção original e as palavras do autor o máximo possível. Não adicione conteúdo novo.
        5. Remova qualquer texto que seja claramente lixo de OCR ou instruções.

        Texto bruto:
        """
        ${texto}
        """

        Retorne APENAS o texto limpo e formatado, sem nenhum comentário ou explicação adicional.
    `;

    try {
        const textoFormatado = await chamarLLM(prompt, texto.length + 500, 0.1);
        return { textoFormatado };
    } catch (err: any) {
        console.warn(`Formatação com LLM falhou, retornando texto original. Erro: ${err.message}`);
        // Em caso de falha, retorna o texto original para não quebrar o fluxo
        return { textoFormatado: texto };
    }
}