import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

/**
 *  Função auxiliar para recalcular a nota final da redação
 */
async function recalcularNotaFinal(redacaoId: string) {
    const avaliacoes = await prisma.avaliacao.findMany({
        where: { redacaoId },
    });

    let notaFinal: number | null = null;

    if (avaliacoes.length > 0) {
        const soma = avaliacoes.reduce((acc, a) => acc + a.notaComp, 0);
        notaFinal = soma / avaliacoes.length;
    } else {
        // Se não houver avaliações humanas, usa a notaGerada (se existir)
        const redacao = await prisma.redacao.findUnique({
            where: { id: redacaoId },
        });
        notaFinal = redacao?.notaGerada ?? null;
    }

    await prisma.redacao.update({
        where: { id: redacaoId },
        data: { notaFinal },
    });
}

/**
 *  Criar Avaliação
 */
export const criarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { redacaoId, competencia, notaComp, comentario } = req.body;

        // Validações
        if (competencia < 1 || competencia > 5) {
            return res.status(400).json({ erro: "Competência deve estar entre 1 e 5." });
        }
        if (notaComp < 0 || notaComp > 200) {
            return res.status(400).json({ erro: "Nota deve estar entre 0 e 200." });
        }

        // Impede duplicidade da mesma competência na mesma redação
        const existente = await prisma.avaliacao.findFirst({
            where: { redacaoId, competencia },
        });
        if (existente) {
            return res.status(400).json({ erro: "Já existe avaliação para esta competência nesta redação." });
        }

        const avaliacao = await prisma.avaliacao.create({
            data: { redacaoId, competencia, notaComp, comentario },
        });

        await recalcularNotaFinal(redacaoId);

        return res.status(201).json(avaliacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao criar avaliação." });
    }
};

/**
 *  Listar Avaliações de uma Redação
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
 *  Atualizar Avaliação
 */
export const atualizarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { competencia, notaComp, comentario } = req.body;

        // Validações
        if (competencia < 1 || competencia > 5) {
            return res.status(400).json({ erro: "Competência deve estar entre 1 e 5." });
        }
        if (notaComp < 0 || notaComp > 200) {
            return res.status(400).json({ erro: "Nota deve estar entre 0 e 200." });
        }

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

        await recalcularNotaFinal(avaliacaoExistente.redacaoId);

        return res.json(avaliacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao atualizar avaliação." });
    }
};

/**
 *  Deletar Avaliação
 */
export const deletarAvaliacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const avaliacao = await prisma.avaliacao.findUnique({
            where: { id },
        });
        if (!avaliacao) {
            return res.status(404).json({ erro: "Avaliação não encontrada." });
        }

        await prisma.avaliacao.delete({ where: { id } });

        await recalcularNotaFinal(avaliacao.redacaoId);

        return res.json({ msg: "Avaliação removida com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao deletar avaliação." });
    }
};
