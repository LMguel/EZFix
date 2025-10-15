import { chamarLLM } from './openaiService'; // Voltamos a usar o serviço do Azure OpenAI

// --- Interfaces para a Análise Estruturada do ENEM ---
export interface DetalheCompetencia {
    nome: string;
    nota: number;
    comentario: string;
    pontosFortes: string[];
    pontosAMelhorar: string[];
}
export interface AnaliseENEM {
    notaFinal1000: number;
    tesePrincipal: string;
    tituloSugerido: string;
    comentarioGeral: string;
    competencias: {
        c1: DetalheCompetencia; c2: DetalheCompetencia; c3: DetalheCompetencia; c4: DetalheCompetencia; c5: DetalheCompetencia;
    };
}

// --- PROMPT COMPLETO E CORRIGIDO ---
const promptTemplateEnem = (texto: string): string => `
Você é um corretor especialista em redações do ENEM, agindo com extremo rigor e precisão, conforme a "Cartilha do Participante". Sua tarefa é avaliar o texto a seguir.

A avaliação de cada competência DEVE seguir a escala oficial: 0, 40, 80, 120, 160 ou 200 pontos.

Texto para avaliação:
"""
${texto}
"""

Sua resposta DEVE ser um único objeto JSON, sem nenhum texto introdutório, final ou comentários. A estrutura do JSON deve ser estritamente a seguinte:
{
  "notaFinal1000": <number>,
  "tesePrincipal": "Identifique e transcreva a tese central defendida no texto em uma única frase.",
  "tituloSugerido": "Crie um título criativo e coerente com o tema e a tese da redação.",
  "comentarioGeral": "Escreva um parágrafo de feedback geral (2-3 frases) resumindo a performance do autor, destacando o principal ponto positivo e a principal área para desenvolvimento.",
  "competencias": {
    "c1": { "nome": "Competência I: Domínio da norma culta", "nota": <0|40|80|120|160|200>, "comentario": "Justifique a nota com base nos desvios gramaticais, de convenções e de escolha vocabular.", "pontosFortes": ["Exemplo de ponto forte encontrado no texto."], "pontosAMelhorar": ["Exemplo de desvio específico encontrado."] },
    "c2": { "nome": "Competência II: Compreensão do tema e repertório", "nota": <0|40|80|120|160|200>, "comentario": "Avalie a abordagem completa ao tema, a estrutura dissertativa e o uso produtivo do repertório sociocultural.", "pontosFortes": ["Uso produtivo de repertório pertinente."], "pontosAMelhorar": ["Repertório apenas expositivo ou tangenciamento do tema."] },
    "c3": { "nome": "Competência III: Coerência e argumentação", "nota": <0|40|80|120|160|200>, "comentario": "Analise o projeto de texto, a seleção de argumentos e a progressão lógica das ideias em defesa de um ponto de vista.", "pontosFortes": ["Clara progressão temática entre parágrafos."], "pontosAMelhorar": ["Argumento contraditório ou mal desenvolvido."] },
    "c4": { "nome": "Competência IV: Coesão textual", "nota": <0|40|80|120|160|200>, "comentario": "Verifique o uso de conectivos e a articulação entre frases e parágrafos.", "pontosFortes": ["Bom uso de conectivos interparágrafos."], "pontosAMelhorar": ["Repetição excessiva de palavras ou falta de coesão."] },
    "c5": { "nome": "Competência V: Proposta de intervenção", "nota": <0|40|80|120|160|200>, "comentario": "A proposta contém os 5 elementos (Agente, Ação, Meio, Finalidade, Detalhamento)? É articulada com a discussão?", "pontosFortes": ["Proposta com os 5 elementos bem definidos."], "pontosAMelhorar": ["Faltou o detalhamento do agente ou da ação."] }
  }
}
INSTRUÇÃO CRÍTICA: A "notaFinal1000" DEVE ser a soma exata das notas das 5 competências. Responda APENAS com o objeto JSON.
`;


export async function analisarEnem(texto: string): Promise<AnaliseENEM> {
    if (!texto || texto.trim().length < 50) {
        throw new Error("Texto muito curto para análise.");
    }
    const prompt = promptTemplateEnem(texto);
    const respostaLLM = await chamarLLM(prompt);
    try {
        const jsonMatch = respostaLLM.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("\n--- RESPOSTA BRUTA DA IA (NÃO-JSON) ---");
            console.error(respostaLLM);
            console.error("--------------------------------------\n");
            throw new Error('LLM não retornou um JSON válido.');
        }
        const parsed: any = JSON.parse(jsonMatch[0]);
        if (!parsed.competencias?.c1) throw new Error('A estrutura do JSON retornado está incompleta.');

        const c = parsed.competencias;
        const somaManual = (c.c1.nota || 0) + (c.c2.nota || 0) + (c.c3.nota || 0) + (c.c4.nota || 0) + (c.c5.nota || 0);
        if (somaManual !== parsed.notaFinal1000) {
            console.warn(`Correção de nota: IA reportou ${parsed.notaFinal1000}, mas a soma é ${somaManual}. Corrigindo...`);
            parsed.notaFinal1000 = somaManual;
        }
        return parsed as AnaliseENEM;
    } catch (err: any) {
        console.error('Falha ao parsear a análise ENEM do LLM:', err.message);
        throw new Error(`Ocorreu um erro ao processar a análise: ${err.message}`);
    }
}

export async function formatarTextoComLLM(texto: string): Promise<{ textoFormatado: string }> {
    if (!texto || texto.trim().length === 0) {
        return { textoFormatado: texto };
    }
    const prompt = `Corrija e formate o seguinte texto extraído por OCR, organizando-o em parágrafos. Retorne apenas o texto limpo.\n\nTexto Bruto:\n"""${texto}"""`;
    try {
        const textoFormatado = await chamarLLM(prompt);
        return { textoFormatado };
    } catch (err: any) {
        console.warn(`Formatação com LLM falhou, retornando texto original. Erro: ${err.message}`);
        return { textoFormatado: texto };
    }
}