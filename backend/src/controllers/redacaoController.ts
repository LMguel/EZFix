import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { extrairTextoDaImagem } from "../services/ocrService";
import { analisarEnem, formatarTextoComLLM } from "../services/ennAnalysisService";

const prisma = new PrismaClient();

// --- Gerenciamento de Cache e Jobs em Memória ---
type AnaliseJob = { promise: Promise<any>; startedAt: number };
const analiseJobs = new Map<string, AnaliseJob>();
const analiseCache = new Map<string, { data: any; cachedAt: number }>();
const ANALISE_TTL_MS = 10 * 60 * 1000; // Cache de 10 minutos

// --- Endpoints do Controller ---

export const criarRedacao = async (req: Request, res: Response) => {
    try {
        const { titulo } = req.body;
        const file = req.file as Express.Multer.File | undefined;
        const imagemUrl = file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : req.body.imagemUrl;
        const usuarioId = req.userId;

        if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });
        if (!titulo || !imagemUrl) return res.status(400).json({ erro: "Título e imagem são obrigatórios." });

        const ocrResult = await extrairTextoDaImagem(imagemUrl);
        if (!ocrResult.isHandwritten || ocrResult.text.split(/\s+/).filter(p => p.length > 1).length < 20) {
            return res.status(400).json({
                erro: "A imagem não parece conter uma redação manuscrita ou o texto é ilegível.",
                ocrResult,
            });
        }

        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                imagemUrl,
                textoExtraido: ocrResult.text,
                usuarioId
            },
        });

        console.log(`[LOG-SISTEMA] Redação ${redacao.id} criada com sucesso no banco de dados.`);

        return res.status(201).json({ ...redacao, ocr: ocrResult });

    } catch (error: any) {
        console.error("Erro ao criar redação:", error);
        if (error.message.includes('PayloadTooLargeError')) {
            return res.status(413).json({ erro: "Imagem muito grande. Limite de 10MB." });
        }
        return res.status(500).json({ erro: "Erro interno do servidor." });
    }
};

export const obterAnaliseEnem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;
        console.log(`[LOG-SISTEMA] Recebida requisição de análise para a redação ${id}.`);

        const redacao = await prisma.redacao.findFirst({ where: { id, usuarioId } });
        if (!redacao) return res.status(404).json({ erro: 'Redação não encontrada.' });
        if ((redacao.textoExtraido || '').trim().length < 50) return res.status(400).json({ erro: "Não há texto suficiente para análise." });

        const cacheEntry = analiseCache.get(id);
        const now = Date.now();
        if (cacheEntry && now - cacheEntry.cachedAt < ANALISE_TTL_MS) return res.json({ status: 'completed', redacao, ...cacheEntry.data });

        if (analiseJobs.has(id)) return res.status(202).json({ status: 'running', message: 'Análise em processamento...' });

        const jobPromise = (async (): Promise<any> => {
            const texto = redacao.textoExtraido || '';
            const textoFormatado = (await formatarTextoComLLM(texto)).textoFormatado || texto;
            const analiseEnem = await analisarEnem(textoFormatado);

            console.log(`[LOG-SISTEMA] Análise da redação ${redacao.id} concluída. Tentando salvar a nota...`);
            try {
                const notaFinal = analiseEnem.notaFinal1000;
                if (notaFinal >= 0) { // Permite salvar nota 0
                    await prisma.redacao.update({
                        where: { id: redacao.id },
                        data: { notaGerada: notaFinal },
                    });
                    console.log(`[LOG-SISTEMA] Nota da redação ${redacao.id} atualizada com sucesso para: ${notaFinal}`);
                }
            } catch (error: any) {
                if (error.code === 'P2025') {
                    console.warn(`[LOG-SISTEMA] Falha ao salvar nota: redação ${redacao.id} foi deletada durante a análise.`);
                } else {
                    console.error(`[LOG-SISTEMA] Erro inesperado ao salvar nota da redação ${redacao.id}:`, error);
                }
            }

            const resultado = { analise: analiseEnem };
            analiseCache.set(id, { data: resultado, cachedAt: Date.now() });
            return resultado;
        })();

        analiseJobs.set(id, { promise: jobPromise, startedAt: now });
        jobPromise
            .catch(err => {
                console.error(`[ERRO NO JOB] A análise em segundo plano para a redação ${id} falhou:`, err.message);
            })
            .finally(() => {
                analiseJobs.delete(id);
            });

        return res.status(202).json({ status: 'started', message: 'Análise iniciada...' });

    } catch (error: any) {
        console.error(`Erro na rota obterAnaliseEnem para redação ${req.params.id}:`, error);
        return res.status(500).json({ erro: 'Erro ao processar análise ENEM.', detalhes: error.message });
    }
};

export const reanalisarTexto = async (req: Request, res: Response) => {
    try {
        const { texto } = req.body;
        if (!texto || texto.trim().length < 50) return res.status(400).json({ erro: 'Texto inválido ou curto demais para reanálise.' });

        const textoFormatado = (await formatarTextoComLLM(texto)).textoFormatado;
        const analise = await analisarEnem(textoFormatado);
        return res.json({ textoAnalisado: textoFormatado, analise });
    } catch (e: any) {
        console.error('Erro ao reanalisar texto:', e);
        return res.status(500).json({ erro: 'Erro interno ao reanalisar.', detalhes: e.message });
    }
};

export const listarRedacoes = async (req: Request, res: Response) => {
    try {
        const redacoes = await prisma.redacao.findMany({
            where: { usuarioId: req.userId },
            orderBy: { criadoEm: 'desc' }, // Requer o campo 'createdAt' no schema.prisma
        });
        return res.json(redacoes);
    } catch (error) {
        console.error("Erro ao listar redações:", error);
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

export const obterRedacao = async (req: Request, res: Response) => {
    try {
        const redacao = await prisma.redacao.findFirst({
            where: { id: req.params.id, usuarioId: req.userId },
        });
        return redacao ? res.json(redacao) : res.status(404).json({ erro: "Redação não encontrada." });
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

export const excluirRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.warn(`[LOG-SISTEMA] ATENÇÃO: Recebida requisição para EXCLUIR a redação ${id}.`);

        const redacao = await prisma.redacao.findFirst({ where: { id, usuarioId: req.userId } });
        if (!redacao) return res.status(404).json({ erro: "Redação não encontrada para exclusão." });

        await prisma.redacao.delete({ where: { id } });
        analiseCache.delete(id);
        analiseJobs.delete(id);

        return res.status(200).json({ mensagem: "Redação excluída com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro ao excluir a redação." });
    }
};