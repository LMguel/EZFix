import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

/**
 * Função auxiliar para recalcular a notaFinal de uma redação
 */
const recalcularNotaFinal = async (redacaoId: string) => {
    const redacao = await prisma.redacao.findUnique({
        where: { id: redacaoId },
        include: { avaliacoes: true },
    });

    if (!redacao) return;

    const { notaGerada, avaliacoes } = redacao;

    // média das avaliações humanas
    let mediaAvaliacoes: number | null = null;
    if (avaliacoes.length > 0) {
        const soma = avaliacoes.reduce((acc, av) => acc + av.notaComp, 0);
        mediaAvaliacoes = soma / avaliacoes.length;
    }

    let notaFinal: number | null = null;

    // regra de negócio:
    if (notaGerada !== null && mediaAvaliacoes !== null) {
        notaFinal = (notaGerada + mediaAvaliacoes) / 2; // combinação IA + humano
    } else if (notaGerada !== null) {
        notaFinal = notaGerada; // só IA
    } else if (mediaAvaliacoes !== null) {
        notaFinal = mediaAvaliacoes; // só humano
    }

    await prisma.redacao.update({
        where: { id: redacaoId },
        data: { notaFinal },
    });
};

export const obterAvaliacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const avaliacao = await prisma.avaliacao.findUnique({
            where: { id },
        });

        if (!avaliacao) {
            return res.status(404).json({ erro: "Avaliação não encontrada." });
        }

        return res.json(avaliacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao buscar avaliação." });
    }
};

/**
 * Listar todas as avaliações de uma redação
 */
export const listarAvaliacoes = async (req: Request, res: Response) => {
    try {
        const { redacaoId } = req.params;

        const avaliacoes = await prisma.avaliacao.findMany({
            where: { redacaoId },
        });

        return res.json(avaliacoes);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao listar avaliações." });
    }
};

/**
 * Criar uma avaliação
 */
export const criarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { redacaoId } = req.params;
        const { competencia, notaComp, comentario } = req.body;

        const avaliacao = await prisma.avaliacao.create({
            data: {
                competencia,
                notaComp,
                comentario,
                redacaoId,
            },
        });

        // Recalcular notaFinal da redação
        await recalcularNotaFinal(redacaoId);

        return res.status(201).json(avaliacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao criar avaliação." });
    }
};

/**
 * Atualizar uma avaliação
 */
export const atualizarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { competencia, notaComp, comentario } = req.body;

        const avaliacaoExistente = await prisma.avaliacao.findUnique({
            where: { id },
        });

        if (!avaliacaoExistente) {
            return res.status(404).json({ erro: "Avaliação não encontrada." });
        }

        const avaliacao = await prisma.avaliacao.update({
            where: { id },
            data: { competencia, notaComp, comentario },
        });

        // Recalcular notaFinal da redação
        await recalcularNotaFinal(avaliacao.redacaoId);

        return res.json(avaliacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao atualizar avaliação." });
    }
};

/**
 * Excluir uma avaliação
 */
export const deletarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const avaliacao = await prisma.avaliacao.delete({
            where: { id },
        });

        // Recalcular notaFinal da redação
        await recalcularNotaFinal(avaliacao.redacaoId);

        return res.json({ mensagem: "Avaliação excluída com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao excluir avaliação." });
    }
};
