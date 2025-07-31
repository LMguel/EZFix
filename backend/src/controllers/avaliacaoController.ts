import { Request, Response } from 'express';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const criarAvaliacao = async (req: Request, res: Response) => {
    const { competencia, notaComp, comentario, redacaoId } = req.body;

    try {
        const avaliacao = await prisma.avaliacao.create({
            data: {
                competencia,
                notaComp,
                comentario,
                redacaoId,
            },
        });
        res.status(201).json(avaliacao);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar avaliação' });
    }
};

// Listar todas as avaliações
export const listarAvaliacoes = async (_req: Request, res: Response) => {
    try {
        const avaliacoes = await prisma.avaliacao.findMany();
        res.json(avaliacoes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar avaliações' });
    }
};

// Buscar avaliação por ID
export const buscarAvaliacao = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const avaliacao = await prisma.avaliacao.findUnique({
            where: { id },
        });

        if (!avaliacao) {
            res.status(404).json({ error: 'Avaliação não encontrada' });
            return;
        }

        res.json(avaliacao);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar avaliação' });
    }
};

// Atualizar avaliação
export const atualizarAvaliacao = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { competencia, notaComp, comentario } = req.body;

    try {
        const avaliacao = await prisma.avaliacao.update({
            where: { id },
            data: {
                competencia,
                notaComp,
                comentario,
            },
        });

        res.json(avaliacao);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar avaliação' });
    }
};

// Deletar avaliação
export const deletarAvaliacao = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        await prisma.avaliacao.delete({
            where: { id },
        });

        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao deletar avaliação' });
    }
};
