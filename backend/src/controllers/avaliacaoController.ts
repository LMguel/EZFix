import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

/**
 * Recalcula notaFinal da redação combinando notaGerada (IA) e média das avaliações humanas.
 */
const recalcularNotaFinal = async (redacaoId: string) => {
  const redacao = await prisma.redacao.findUnique({
    where: { id: redacaoId },
    select: { notaGerada: true },
  });

  const avaliacoes = await prisma.avaliacao.findMany({
    where: { redacaoId },
    select: { notaComp: true },
  });

  const mediaAvaliacoes =
    avaliacoes.length > 0
      ? avaliacoes.reduce((acc, av) => acc + av.notaComp, 0) / avaliacoes.length
      : null;

  let notaFinal: number | null = null;

  if (redacao?.notaGerada != null && mediaAvaliacoes != null) {
    notaFinal = (redacao.notaGerada + mediaAvaliacoes) / 2;
  } else if (redacao?.notaGerada != null) {
    notaFinal = redacao.notaGerada;
  } else if (mediaAvaliacoes != null) {
    notaFinal = mediaAvaliacoes;
  } else {
    notaFinal = null;
  }

  await prisma.redacao.update({
    where: { id: redacaoId },
    data: { notaFinal },
  });
};

/**
 * Listar todas as avaliações de uma redação
 */
export const listarAvaliacoes = async (req: Request, res: Response) => {
  try {
    const { redacaoId } = req.params;
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { redacaoId },
      orderBy: { id: "asc" },
    });
    return res.json(avaliacoes);
  } catch (error) {
    console.error("Erro ao listar avaliações:", error);
    return res.status(500).json({ erro: "Erro ao listar avaliações." });
  }
};

/**
 * Obter uma avaliação específica
 */
export const obterAvaliacao = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const avaliacao = await prisma.avaliacao.findUnique({ where: { id } });

    if (!avaliacao) return res.status(404).json({ erro: "Avaliação não encontrada." });

    return res.json(avaliacao);
  } catch (error) {
    console.error("Erro ao obter avaliação:", error);
    return res.status(500).json({ erro: "Erro ao buscar avaliação." });
  }
};

/**
 * Criar uma avaliação
 */
export const criarAvaliacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { redacaoId } = req.params;
    const { competencia, notaComp, comentario } = req.body;

    // Validações básicas
    if (typeof competencia !== 'number' || competencia < 1 || competencia > 5) {
      return res.status(400).json({ erro: "Competência deve ser um inteiro entre 1 e 5." });
    }
    if (typeof notaComp !== 'number' || notaComp < 0 || notaComp > 200) {
      return res.status(400).json({ erro: "notaComp deve ser um número entre 0 e 200." });
    }

    // Verifica existência da redação
    const redacao = await prisma.redacao.findUnique({ where: { id: redacaoId } });
    if (!redacao) return res.status(404).json({ erro: "Redação não encontrada." });

    // Impede duplicidade de competência para a mesma redação (sem avaliadorId no schema)
    const existente = await prisma.avaliacao.findFirst({
      where: { redacaoId, competencia },
    });
    if (existente) {
      return res.status(400).json({ erro: "Já existe avaliação para esta competência nesta redação." });
    }

    const avaliacao = await prisma.avaliacao.create({
      data: { competencia, notaComp, comentario, redacaoId },
    });

    // Recalcular notaFinal da redação (combina IA + humanos)
    await recalcularNotaFinal(redacaoId);

    return res.status(201).json(avaliacao);
  } catch (error) {
    console.error("Erro ao criar avaliação:", error);
    return res.status(500).json({ erro: "Erro ao criar avaliação." });
  }
};

/**
 * Atualizar avaliação
 */
export const atualizarAvaliacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { id } = req.params;
    const { competencia, notaComp, comentario } = req.body;

    // Validações básicas
    if (typeof competencia !== 'number' || competencia < 1 || competencia > 5) {
      return res.status(400).json({ erro: "Competência deve ser um inteiro entre 1 e 5." });
    }
    if (typeof notaComp !== 'number' || notaComp < 0 || notaComp > 200) {
      return res.status(400).json({ erro: "notaComp deve ser um número entre 0 e 200." });
    }

    const avaliacaoExistente = await prisma.avaliacao.findUnique({ where: { id } });
    if (!avaliacaoExistente) return res.status(404).json({ erro: "Avaliação não encontrada." });

    // Atualiza
    const avaliacao = await prisma.avaliacao.update({
      where: { id },
      data: { competencia, notaComp, comentario },
    });

    // Recalcular notaFinal da redação
    await recalcularNotaFinal(avaliacao.redacaoId);

    return res.json(avaliacao);
  } catch (error) {
    console.error("Erro ao atualizar avaliação:", error);
    return res.status(500).json({ erro: "Erro ao atualizar avaliação." });
  }
};

/**
 * Deletar avaliação
 */
export const deletarAvaliacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { id } = req.params;

    const avaliacao = await prisma.avaliacao.findUnique({ where: { id } });
    if (!avaliacao) return res.status(404).json({ erro: "Avaliação não encontrada." });

    await prisma.avaliacao.delete({ where: { id } });

    // Recalcular notaFinal da redação
    await recalcularNotaFinal(avaliacao.redacaoId);

    return res.json({ mensagem: "Avaliação excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar avaliação:", error);
    return res.status(500).json({ erro: "Erro ao excluir avaliação." });
  }
};
