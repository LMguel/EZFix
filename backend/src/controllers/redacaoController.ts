import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { extrairTextoDaImagem, gerarNotaAutomatica, OCRResult } from "../services/ocrService";
import { analisarTexto } from "../services/analiseService";
import { analisarEnem } from "../services/ennAnalysisService";
import { formatarTextoComLLM } from "../services/ennAnalysisService";


const prisma = new PrismaClient();

// Listar todas as redações de um usuário
export const listarRedacoes = async (req: Request, res: Response) => {
    try {
        const usuarioId = req.userId;
        const redacoes = await prisma.redacao.findMany({
            where: { usuarioId },
            include: { avaliacoes: true },
        });
        return res.json(redacoes);
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Obter uma redação específica
export const obterRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
            include: { avaliacoes: true },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        return res.json(redacao);
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Criar nova redação com OCR + nota automática
export const criarRedacao = async (req: Request, res: Response) => {
    try {
        const { titulo } = req.body;
        // imagem pode vir em req.file (upload multipart) ou em req.body.imagemUrl (dataURL/URL)
    const file = (req as any).file as any | undefined;
    const imagemUrl = file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : req.body.imagemUrl;
        const usuarioId = req.userId;

        if (!usuarioId) {
            return res.status(401).json({ erro: "Usuário não autenticado." });
        }

        if (!titulo || !imagemUrl) {
            return res.status(400).json({ erro: "Título e imagem são obrigatórios. Envie arquivo (field 'file') ou imagemUrl." });
        }

        console.log("Criando redação:", { titulo, imageType: imagemUrl.startsWith('data:') ? 'base64' : 'url' });

        // 1) Extrair texto da imagem
        let ocrResult: OCRResult | null = null;
        try {
            ocrResult = await extrairTextoDaImagem(imagemUrl);
        } catch (ocrError: any) {
            console.error("Erro específico no OCR:", ocrError);
            // Se for erro de imagem inválida/truncada, retornar 400 para o frontend evitar re-submissões em loop
            const msg = ocrError?.message?.toString() || '';
            if (msg.includes('truncada') || msg.includes('assinatura do arquivo') || msg.includes('pngload_buffer') || msg.includes('Falha ao decodificar imagem')) {
                return res.status(400).json({ erro: 'Imagem inválida ou corrompida. Verifique o arquivo enviado (base64/url).' });
            }
            // Continuar mesmo com erro de OCR genérico
            ocrResult = { text: 'Erro ao processar OCR - texto não pôde ser extraído.', confidence: 0, engine: 'mixed' };
        }

        const textoExtraido = ocrResult?.text || '';

        // 2) Gerar nota automática
        const notaGerada = gerarNotaAutomatica(textoExtraido);

        // 3) Analisar texto e gerar feedback local
        const analiseLocal = analisarTexto(textoExtraido);

        // 4) Tentar formatar o texto com LLM para apresentação mais legível (opcional)
        let textoFormatado = textoExtraido;
        let correcoesSugeridas: any[] = [];
        try {
            const formatted = await formatarTextoComLLM(textoExtraido);
            if (formatted && typeof formatted === 'object' && (formatted as any).textoFormatado) {
                textoFormatado = (formatted as any).textoFormatado || textoExtraido;
                correcoesSugeridas = (formatted as any).correcoes || [];
            } else if (typeof formatted === 'string') {
                textoFormatado = formatted;
            }
        } catch (fmtErr) {
            console.warn('Formatação com LLM falhou, usando texto OCR bruto:', fmtErr);
        }

        // 4) Salvar no banco
        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                // armazenar a imagem enviada inteira (se o banco suportar); evitar truncamento que causa reprocessamento com base64 corrompido
                imagemUrl: imagemUrl,
                textoExtraido: textoFormatado,
                notaGerada,
                usuarioId,
            },
        });

        console.log("Redação criada com sucesso:", redacao.id);
        
        // Retornar redação com análise e correções sugeridas
        return res.status(201).json({
            ...redacao,
            ocr: ocrResult,
            analise: analiseLocal,
            correcoesSugeridas
        });
    } catch (error) {
        console.error("Erro ao criar redação:", error);
        
        // Tratar diferentes tipos de erro
        if (error instanceof Error) {
            if (error.message.includes('PayloadTooLargeError')) {
                return res.status(413).json({ erro: "Imagem muito grande. Tente uma imagem menor." });
            }
            if (error.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ erro: "Redação duplicada." });
            }
        }
        
        return res.status(500).json({ erro: "Erro interno do servidor. Tente novamente." });
    }
};

// Atualizar redação
export const atualizarRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { titulo, imagemUrl, textoExtraido, notaFinal } = req.body;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

    let novoTextoExtraido = textoExtraido ?? redacao.textoExtraido;
        let novaNotaGerada = redacao.notaGerada;

        // ⚡ Se imagem foi alterada → rodar OCR novamente
        if (imagemUrl && imagemUrl !== redacao.imagemUrl) {
            const newOcr = await extrairTextoDaImagem(imagemUrl);
            novoTextoExtraido = newOcr?.text || '';
            novaNotaGerada = gerarNotaAutomatica(novoTextoExtraido || "");
        }

        const redacaoAtualizada = await prisma.redacao.update({
            where: { id },
            data: {
                titulo,
                imagemUrl,
                textoExtraido: novoTextoExtraido,
                notaGerada: novaNotaGerada,
                notaFinal, // definido pelo professor/corretor
            },
        });

        // se usuário enviou texto para re-análise, executar análise ENEM com LLM novamente
        let analiseAtualizada = null;
        try {
            const textoParaAnalise = novoTextoExtraido || redacaoAtualizada.textoExtraido || '';
            const formatted = await formatarTextoComLLM(textoParaAnalise);
            let textoFmt = textoParaAnalise;
            if (formatted && typeof formatted === 'object' && (formatted as any).textoFormatado) {
                textoFmt = (formatted as any).textoFormatado;
            } else if (typeof formatted === 'string') textoFmt = formatted;
            analiseAtualizada = await analisarEnem(textoFmt);
        } catch (e) {
            console.warn('Falha ao reanalisar redação atualizada:', e);
        }

        return res.json({ redacao: redacaoAtualizada, analise: analiseAtualizada });
    } catch (error) {
        console.error("Erro ao atualizar redação:", error);
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Endpoint: reanalisar texto manualmente (o frontend pode enviar texto editado e receber análise ENEM)
export const reanalisarTexto = async (req: Request, res: Response) => {
    try {
        const { texto } = req.body;
        if (!texto || texto.trim().length === 0) return res.status(400).json({ erro: 'Texto inválido para reanálise.' });

        // formatar e analisar (o formatador agora retorna objeto com correcoes)
        const formatted = await formatarTextoComLLM(texto);
        let textoFmt = texto;
        let correcoes: any[] = [];
        if (formatted && typeof formatted === 'object') {
            textoFmt = (formatted as any).textoFormatado || texto;
            correcoes = (formatted as any).correcoes || [];
        } else if (typeof formatted === 'string') textoFmt = formatted;

        const analise = await analisarEnem(textoFmt);

        return res.json({ textoFormatado: textoFmt, correcoes, analise });
    } catch (e) {
        console.error('Erro ao reanalisar texto:', e);
        return res.status(500).json({ erro: 'Erro ao reanalisar texto.' });
    }
};

// Obter análise de uma redação específica
export const obterAnaliseRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
            include: { avaliacoes: true },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        // Gerar análise do texto (local) e retorno também detalhes de OCR se disponíveis
        const analise = analisarTexto(redacao.textoExtraido || "");
        return res.json({ redacao, analise });
    } catch (error) {
        console.error("Erro ao obter análise:", error);
        return res.status(500).json({ erro: "Erro interno do servidor." });
    }
};

// Obter análise ENEM de uma redação específica (usa LLM)
export const obterAnaliseEnem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });

        if (!redacao) return res.status(404).json({ erro: 'Redação não encontrada.' });

        const texto = redacao.textoExtraido || '';
        // tentar extrair OCR detalhado da imagem (linhas/confiança) para expor ao frontend
        let ocrDetails: any = null;
        try {
            ocrDetails = await extrairTextoDaImagem(redacao.imagemUrl || '');
        } catch (e: any) {
            console.warn('Falha ao obter OCR detalhado para análise ENEM:', e?.message || e);
            const msg = e?.message?.toString() || '';
            if (msg.includes('truncada') || msg.includes('assinatura do arquivo') || msg.includes('pngload_buffer') || msg.includes('Falha ao decodificar imagem')) {
                ocrDetails = { erro: 'Imagem inválida ou corrompida (não foi possível extrair detalhes de OCR).' };
            } else {
                ocrDetails = { erro: 'Falha ao processar OCR detalhado.' };
            }
        }

        // formatar o texto com LLM para ficar mais legível antes da análise ENEM
        let textoFormatado = texto;
        let correcoesParaFrontend: any[] = [];
        try {
            const fmt = await formatarTextoComLLM(texto);
            if (fmt && typeof fmt === 'object') {
                textoFormatado = (fmt as any).textoFormatado || texto;
                correcoesParaFrontend = (fmt as any).correcoes || [];
            } else if (typeof fmt === 'string') {
                textoFormatado = fmt;
            }
        } catch (e) {
            console.warn('Falha ao formatar texto antes da análise ENEM:', e);
        }

        // rodar a análise ENEM (LLM ou fallback) usando o texto formatado
        let analiseEnem: any = null;
        try {
            analiseEnem = await analisarEnem(textoFormatado);
        } catch (e: any) {
            console.warn('Falha ao executar analisarEnem (LLM) - retornando análise local como fallback:', e?.message || e);
            // fallback: usar análise local (estatísticas e mensagens mínimas) para que a rota responda
            analiseEnem = {
                pontosFavoraveis: [],
                pontosMelhoria: [],
                sugestoes: [],
                detalheErroLLM: e?.message || 'Erro ao executar LLM',
            };
        }

        // calcular análise local (estatísticas e pontuação) para preencher campos esperados pelo frontend
        const analiseLocal = analisarTexto(textoFormatado);

        // montar objeto combinado: priorizar campos do ENEM, mas garantir pontuacao/estatisticas
    console.log('analiseLocal.qualidadeOCR:', analiseLocal?.qualidadeOCR);
        const analiseCombinada = {
            ...analiseEnem,
            // manter compatibilidade com frontend que espera 'pontuacao' e 'estatisticas'
            pontuacao: (analiseLocal && (analiseLocal.pontuacao ?? 0)) || 0,
            estatisticas: (analiseLocal && analiseLocal.estatisticas) || { palavras: 0, caracteres: 0, paragrafos: 0, frases: 0 },
            qualidadeOCR: (analiseLocal && analiseLocal.qualidadeOCR) || { nivel: 'baixa', problemas: [], confiabilidade: 0 },
            // harmonizar nomes de arrays
            pontosPositivos: analiseEnem.pontosFavoraveis || analiseEnem.comentarios || analiseLocal.pontosPositivos || [],
            pontosNegativos: analiseEnem.pontosMelhoria || analiseLocal.pontosNegativos || [],
            sugestoes: analiseEnem.sugestoes || analiseLocal.sugestoes || []
        } as any;
        // Mapear para os critérios solicitados C1..C5 (0-10)
        const getNota = (pathObj: any, fallback: number) => {
            if (!pathObj && typeof fallback === 'number') return fallback;
            return typeof pathObj === 'number' ? pathObj : (pathObj && pathObj.nota ? pathObj.nota : fallback);
        };

        const criterios = {
            C1: Math.round((getNota(analiseCombinada.detalhamento?.norma, analiseCombinada.breakdown?.norma || 0) || 0) * 10) / 10,
            C2: Math.round((getNota(analiseCombinada.detalhamento?.tese, analiseCombinada.breakdown?.tese || 0) || 0) * 10) / 10,
            C3: Math.round((getNota(analiseCombinada.detalhamento?.argumentos, analiseCombinada.breakdown?.argumentos || 0) || 0) * 10) / 10,
            C4: Math.round((getNota(analiseCombinada.detalhamento?.coesao, analiseCombinada.breakdown?.coesao || 0) || 0) * 10) / 10,
            C5: Math.round((getNota(analiseCombinada.detalhamento?.repertorio, analiseCombinada.breakdown?.repertorio || 0) || 0) * 10) / 10,
        };

        // incluir criterios no objeto de analise para facilitar consumo no frontend
        (analiseCombinada as any).criterios = criterios;

    return res.json({ redacao, ocr: ocrDetails, textoFormatado, correcoes: correcoesParaFrontend, analise: analiseCombinada });
    } catch (error) {
        console.error('Erro ao obter análise ENEM:', error);
        return res.status(500).json({ erro: 'Erro ao gerar análise ENEM.' });
    }
};

// Excluir redação
export const excluirRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        await prisma.redacao.delete({ where: { id } });

        return res.json({ mensagem: "Redação excluída com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};


