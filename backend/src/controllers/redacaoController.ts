import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { extrairTextoDaImagem } from "../services/ocrService";
import { analisarEnem, formatarTextoComLLM, AnaliseENEM } from "../services/ennAnalysisService";
import { corrigirTextoOCR } from "../services/openaiService";

const prisma = new PrismaClient();
type AnaliseJob = { promise: Promise<any>; startedAt: number };
const analiseJobs = new Map<string, AnaliseJob>();
// O cache armazena a análise pura
const analiseCache = new Map<string, { data: AnaliseENEM; cachedAt: number }>();
const ANALISE_TTL_MS = 10 * 60 * 1000;

// --- Endpoints do Controller ---

export const criarRedacao = async (req: Request, res: Response) => {
    try {
        const { titulo } = req.body;
        const file = req.file as Express.Multer.File | undefined;
        const imagemUrl = file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : req.body.imagemUrl;
        const usuarioId = req.userId;

        if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });
        if (!titulo || !imagemUrl) return res.status(400).json({ erro: "Título e imagem são obrigatórios." });

        console.log("🔍 Iniciando extração de texto com OCR...");
        const ocrResult = await extrairTextoDaImagem(imagemUrl);
        
        if (!ocrResult.text || ocrResult.text.trim().length < 50) {
            return res.status(400).json({
                erro: "Não foi possível extrair texto suficiente da imagem.",
                ocrResult,
            });
        }

        console.log("🤖 Iniciando correção automática com GPT...");
        const textoCorrigido = await corrigirTextoOCR(ocrResult.text);

        console.log("💾 Salvando redação no banco de dados...");
        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                imagemUrl,
                textoExtraido: textoCorrigido, // Salva o texto já corrigido
                usuarioId
            },
        });

        console.log(`✅ Redação ${redacao.id} criada com sucesso!`);

        // Iniciar análise automática em background
        console.log("⚡ Iniciando análise ENEM automática...");
        setTimeout(async () => {
            try {
                const analiseEnem = await analisarEnem(textoCorrigido);
                await prisma.redacao.update({
                    where: { id: redacao.id },
                    data: { 
                        notaGerada: analiseEnem.notaFinal1000,
                        notaFinal: analiseEnem.notaFinal1000 
                    }
                });
                console.log(`📊 Análise da redação ${redacao.id} concluída: ${analiseEnem.notaFinal1000}/1000`);
            } catch (analyzeError) {
                console.error(`❌ Erro na análise automática da redação ${redacao.id}:`, analyzeError);
            }
        }, 1000);

        return res.status(201).json({ 
            ...redacao, 
            ocr: {
                ...ocrResult,
                text: textoCorrigido,
                originalText: ocrResult.text,
                corrected: true
            }
        });

    } catch (error: any) {
        console.error("❌ Erro ao criar redação:", error);
        if (error.message.includes('PayloadTooLargeError')) {
            return res.status(413).json({ erro: "Imagem muito grande. Limite de 10MB." });
        }
        return res.status(500).json({ erro: "Erro interno do servidor.", detalhes: error.message });
    }
};

export const obterAnaliseEnem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const redacao = await prisma.redacao.findFirst({ where: { id, usuarioId: req.userId } });
        if (!redacao) return res.status(404).json({ erro: 'Redação não encontrada.' });

        const cacheEntry = analiseCache.get(id);
        if (cacheEntry) {
            return res.status(200).json({ status: 'completed', analise: cacheEntry.data });
        }
        if (analiseJobs.has(id)) {
            return res.status(202).json({ status: 'running', message: 'Análise em processamento...' });
        }

        const jobPromise = (async (): Promise<AnaliseENEM> => {
            // Lógica simplificada e correta: usa o texto direto do OCR
            const textoParaAnalise = redacao.textoExtraido || '';
            const analiseEnem = await analisarEnem(textoParaAnalise);

            try {
                const notaFinal = analiseEnem.notaFinal1000;
                if (notaFinal >= 0) {
                    await prisma.redacao.update({ where: { id: redacao.id }, data: { notaGerada: notaFinal } });
                }
            } catch (error: any) { /* ... */ }

            analiseCache.set(id, { data: analiseEnem, cachedAt: Date.now() });
            return analiseEnem;
        })();

        analiseJobs.set(id, { promise: jobPromise, startedAt: Date.now() });
        jobPromise.catch(err => {
            console.error(`[ERRO NO JOB] A análise para a redação ${id} falhou:`, err.message);
        }).finally(() => {
            analiseJobs.delete(id);
        });

        return res.status(202).json({ status: 'running', message: 'Análise iniciada...' });
    } catch (error: any) {
        console.error(`Erro na rota obterAnaliseEnem para redação ${req.params.id}:`, error);
        return res.status(500).json({ erro: 'Erro ao processar análise ENEM.', detalhes: error.message });
    }
};

export const reanalisarTexto = async (req: Request, res: Response) => {
    try {
        const { texto } = req.body;
        if (!texto || texto.trim().length < 50) return res.status(400).json({ erro: 'Texto inválido.' });

        // Esta rota continua usando a formatação, e agora funciona
        const textoFormatado = (await formatarTextoComLLM(texto)).textoFormatado;
        const analise = await analisarEnem(textoFormatado);

        // Retornando no formato correto que o frontend espera
        return res.json({ textoAnalisado: textoFormatado, analise: analise });
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