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
const promptTemplateEnem = (texto: string, perfilCorretor: string): string => `
Você é um corretor especialista em redações do ENEM. Adote o seguinte perfil: ${perfilCorretor}.
Sua tarefa é avaliar o texto abaixo com extremo rigor, conforme a Cartilha do Participante. Para cada uma das 5 competências, siga a escala oficial (0, 40, 80, 120, 160, 200) e justifique sua decisão.

Um exemplo para a Competência V (Proposta de Intervenção):
- Nota 200: Apresenta proposta completa com Agente + Ação + Meio/Modo + Finalidade + Detalhamento, articulada à discussão.
- Nota 160: Apresenta 4 dos 5 elementos.
- Nota 120: Apresenta 3 dos 5 elementos ou a proposta não é articulada à discussão.
- Abaixo disso: Apresenta menos de 3 elementos ou desrespeita os direitos humanos.

Texto para avaliação:
"""
${texto}
"""

Sua resposta DEVE ser um único objeto JSON, sem nenhum texto introdutório, final ou comentários, seguindo estritamente esta estrutura:
{
  "notaFinal1000": <number>,
  "tesePrincipal": "...",
  "tituloSugerido": "...",
  "comentarioGeral": "...",
  "competencias": {
    "c1": { "nome": "Competência I...", "nota": <0-200>, "comentario": "...", "pontosFortes": ["..."], "pontosAMelhorar": ["..."] },
    "c2": { "nome": "Competência II...", "nota": <0-200>, "comentario": "...", "pontosFortes": ["..."], "pontosAMelhorar": ["..."] },
    "c3": { "nome": "Competência III...", "nota": <0-200>, "comentario": "...", "pontosFortes": ["..."], "pontosAMelhorar": ["..."] },
    "c4": { "nome": "Competência IV...", "nota": <0-200>, "comentario": "...", "pontosFortes": ["..."], "pontosAMelhorar": ["..."] },
    "c5": { "nome": "Competência V...", "nota": <0-200>, "comentario": "...", "pontosFortes": ["..."], "pontosAMelhorar": ["..."] }
  }
}
INSTRUÇÃO CRÍTICA: A "notaFinal1000" DEVE ser a soma exata das notas das 5 competências.
`;

const analisarSinglePrompt = async (texto: string, perfil: string): Promise<AnaliseENEM | null> => {
    try {
        const prompt = promptTemplateEnem(texto, perfil);
        const respostaLLM = await chamarLLM(prompt);
        const jsonMatch = respostaLLM.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]) as AnaliseENEM;
        if (!parsed.competencias?.c1) return null;

        // Auto-correção da nota
        const c = parsed.competencias;
        parsed.notaFinal1000 = (c.c1.nota || 0) + (c.c2.nota || 0) + (c.c3.nota || 0) + (c.c4.nota || 0) + (c.c5.nota || 0);
        return parsed;
    } catch (e) {
        console.error(`Erro em uma das análises paralelas (perfil: ${perfil}):`, e);
        return null;
    }
};

export async function analisarEnem(texto: string): Promise<AnaliseENEM> {
    if (!texto || texto.trim().length < 50) {
        throw new Error("Texto muito curto para análise.");
    }

    console.log("🤖 Iniciando análise de alta precisão com 3 corretores de IA em paralelo...");

    const perfis = [
        "Você é um corretor muito rigoroso com a norma culta (Competência I) e coesão (Competência IV).",
        "Você é um corretor focado na qualidade da argumentação (Competência III) e no uso do repertório (Competência II).",
        "Você é um corretor criativo, focado na originalidade da tese e na qualidade da proposta de intervenção (Competência V)."
    ];

    const resultados = await Promise.all([
        analisarSinglePrompt(texto, perfis[0]),
        analisarSinglePrompt(texto, perfis[1]),
        analisarSinglePrompt(texto, perfis[2])
    ]);

    const analisesValidas = resultados.filter((r): r is AnaliseENEM => r !== null);

    if (analisesValidas.length === 0) {
        throw new Error("Nenhum dos corretores de IA conseguiu retornar uma análise válida.");
    }
    console.log(`✅ ${analisesValidas.length} de 3 corretores de IA retornaram análises válidas.`);

    // LÓGICA DE CONSENSO: Calcular a média das notas
    const analiseFinal: AnaliseENEM = JSON.parse(JSON.stringify(analisesValidas[0])); // Começa com uma cópia da primeira análise válida

    // Calcula a média para cada competência e para a nota final
    const numAnalises = analisesValidas.length;
    analiseFinal.competencias.c1.nota = Math.round(analisesValidas.reduce((s, a) => s + a.competencias.c1.nota, 0) / numAnalises / 40) * 40;
    analiseFinal.competencias.c2.nota = Math.round(analisesValidas.reduce((s, a) => s + a.competencias.c2.nota, 0) / numAnalises / 40) * 40;
    analiseFinal.competencias.c3.nota = Math.round(analisesValidas.reduce((s, a) => s + a.competencias.c3.nota, 0) / numAnalises / 40) * 40;
    analiseFinal.competencias.c4.nota = Math.round(analisesValidas.reduce((s, a) => s + a.competencias.c4.nota, 0) / numAnalises / 40) * 40;
    analiseFinal.competencias.c5.nota = Math.round(analisesValidas.reduce((s, a) => s + a.competencias.c5.nota, 0) / numAnalises / 40) * 40;

    analiseFinal.notaFinal1000 = Object.values(analiseFinal.competencias).reduce((s, c) => s + c.nota, 0);

    // Combina os comentários (pega o mais detalhado)
    analiseFinal.comentarioGeral = analisesValidas.sort((a, b) => b.comentarioGeral.length - a.comentarioGeral.length)[0].comentarioGeral;

    console.log(`📊 Nota final de consenso calculada: ${analiseFinal.notaFinal1000}/1000`);
    return analiseFinal;
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