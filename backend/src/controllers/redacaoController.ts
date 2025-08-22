import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

// LISTAR todas as redações do usuário logado
export const listarRedacoes = async (req: Request, res: Response) => {
    try {
        const usuarioId = req.userId;
        const redacoes = await prisma.redacao.findMany({
            where: { usuarioId },
            include: { avaliacoes: true },
        });
        return res.json(redacoes);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao listar redações." });
    }
};

// OBTER redação por ID
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
        return res.status(500).json({ erro: "Erro ao buscar redação." });
    }
};

// CRIAR nova redação
export const criarRedacao = async (req: Request, res: Response) => {
    try {
        const { titulo, imagemUrl, textoExtraido } = req.body;
        const usuarioId = req.userId;

        if (!usuarioId) {
            return res.status(401).json({ erro: "Usuário não autenticado." });
        }

        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                imagemUrl,
                textoExtraido,
                usuarioId,
            },
        });

        return res.status(201).json(redacao);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao criar redação." });
    }
};

// ATUALIZAR redação
export const atualizarRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { titulo, imagemUrl, textoExtraido, notaGerada, notaFinal } = req.body;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        const redacaoAtualizada = await prisma.redacao.update({
            where: { id },
            data: {
                titulo,
                imagemUrl,
                textoExtraido,
                notaGerada,
                notaFinal,
            },
        });

        return res.json(redacaoAtualizada);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao atualizar redação." });
    }
};

// DELETAR redação
export const deletarRedacao = async (req: Request, res: Response) => {
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

        return res.json({ mensagem: "Redação deletada com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao deletar redação." });
    }
};

// AVALIAR redação (múltiplas competências)
export const avaliarRedacao = async (req: Request, res: Response) => {
    try {
        const { redacaoId } = req.params;
        const { competencias } = req.body; // array de { competencia, notaComp, comentario }

        const redacao = await prisma.redacao.findUnique({ where: { id: redacaoId } });
        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        const avaliacoes = await Promise.all(
            competencias.map((comp: any) =>
                prisma.avaliacao.create({
                    data: {
                        competencia: comp.competencia,
                        notaComp: comp.notaComp,
                        comentario: comp.comentario,
                        redacaoId,
                    },
                })
            )
        );

        return res.json(avaliacoes);
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao avaliar redação." });
    }
};
