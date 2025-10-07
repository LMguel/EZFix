import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { analisarTexto } from "../services/analiseService";
import { extrairTextoDaImagem, gerarNotaAutomatica } from "../services/ocrService";

const prisma = new PrismaClient();

/**
 * Helper: recalcula notaFinal baseado em notaGerada e avaliações (same logic used in avaliacaoController)
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
 * Lista todas as redações do usuário autenticado
 */
export const listarRedacoes = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const redacoes = await prisma.redacao.findMany({
      where: { usuarioId },
      include: { avaliacoes: true },
      orderBy: { criadoEm: "desc" },
    });

    return res.json(redacoes);
  } catch (error) {
    console.error("Erro ao listar redações:", error);
    return res.status(500).json({ erro: "Erro ao listar redações." });
  }
};

/**
 * Obtém uma redação específica
 */
export const obterRedacao = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const usuarioId = (req as any).userId;

    const redacao = await prisma.redacao.findFirst({
      where: { id, usuarioId },
      include: { avaliacoes: true },
    });

    if (!redacao) return res.status(404).json({ erro: "Redação não encontrada." });

    return res.json(redacao);
  } catch (error) {
    console.error("Erro ao obter redação:", error);
    return res.status(500).json({ erro: "Erro ao buscar redação." });
  }
};

/**
 * Cria uma nova redação e gera nota automática via OCR + IA
 */
export const criarRedacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { titulo, imagemUrl } = req.body;
    if (!titulo || !imagemUrl) return res.status(400).json({ erro: "titulo e imagemUrl são obrigatórios." });

    // Criação inicial da redação (sem texto ainda)
    let redacao = await prisma.redacao.create({
      data: {
        titulo,
        imagemUrl,
        usuarioId,
      },
    });

    // 🔍 Extração do texto da imagem (OCR)
    let textoExtraido: string | null = null;
    try {
      textoExtraido = await extrairTextoDaImagem(imagemUrl);
    } catch (e) {
      console.error("OCR falhou:", e);
      textoExtraido = null;
    }

    // ✍️ Análise automática do texto (IA)
    let analise: any = null;
    if (textoExtraido) {
      try {
        analise = await analisarTexto(textoExtraido);
      } catch (e) {
        console.error("Analise IA falhou:", e);
      }
    }

    // 🤖 Geração de nota automática (OCR + IA)
    const notaGerada = analise ? await gerarNotaAutomatica(analise) : null;

    // Atualiza a redação com o texto e nota
    redacao = await prisma.redacao.update({
      where: { id: redacao.id },
      data: {
        textoExtraido,
        notaGerada,
        // Definimos notaFinal = notaGerada por padrão (se existir) quando não há avaliações ainda
        notaFinal: notaGerada,
      },
      include: { avaliacoes: true },
    });

    return res.status(201).json(redacao);
  } catch (error) {
    console.error("Erro ao criar redação:", error);
    return res.status(500).json({ erro: "Erro ao criar redação." });
  }
};

/**
 * Atualiza informações de uma redação e recalcula nota automática se necessário
 */
export const atualizarRedacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { id } = req.params;
    const { titulo, imagemUrl, textoExtraido } = req.body;

    const redacaoExistente = await prisma.redacao.findUnique({ where: { id } });
    if (!redacaoExistente) return res.status(404).json({ erro: "Redação não encontrada." });
    if (redacaoExistente.usuarioId !== usuarioId) return res.status(403).json({ erro: "Sem permissão para editar esta redação." });

    let novoTexto = textoExtraido ?? redacaoExistente.textoExtraido;
    let novoImagem = imagemUrl ?? redacaoExistente.imagemUrl;

    // Se houver nova imagem, refaz OCR
    if (imagemUrl && imagemUrl !== redacaoExistente.imagemUrl) {
      try {
        novoTexto = await extrairTextoDaImagem(imagemUrl);
      } catch (e) {
        console.error("OCR falhou no update:", e);
      }
    }

    // Atualiza dados básicos
    let redacaoAtualizada = await prisma.redacao.update({
      where: { id },
      data: { titulo, imagemUrl: novoImagem, textoExtraido: novoTexto },
      include: { avaliacoes: true },
    });

    // Recalcular nota gerada se o texto mudou
    if (novoTexto) {
      let analise: any = null;
      try {
        analise = await analisarTexto(novoTexto);
      } catch (e) {
        console.error("Analise IA falhou no update:", e);
      }
      const novaNota = analise ? await gerarNotaAutomatica(analise) : null;

      // If there are evaluations, recompute combined final score
      const avaliacoes = await prisma.avaliacao.findMany({ where: { redacaoId: id } });
      if (avaliacoes.length > 0) {
        // atualiza notaGerada e chama recalcularNotaFinal
        await prisma.redacao.update({ where: { id }, data: { notaGerada: novaNota } });
        await recalcularNotaFinal(id);
        redacaoAtualizada = await prisma.redacao.findUnique({ where: { id }, include: { avaliacoes: true } }) as any;
      } else {
        // sem avaliações, define notaFinal = notaGerada
        redacaoAtualizada = await prisma.redacao.update({
          where: { id },
          data: { notaGerada: novaNota, notaFinal: novaNota },
          include: { avaliacoes: true },
        });
      }
    }

    return res.json(redacaoAtualizada);
  } catch (error) {
    console.error("Erro ao atualizar redação:", error);
    return res.status(500).json({ erro: "Erro ao atualizar redação." });
  }
};

/**
 * Exclui uma redação
 */
export const deletarRedacao = async (req: Request, res: Response) => {
  try {
    const usuarioId = (req as any).userId;
    if (!usuarioId) return res.status(401).json({ erro: "Usuário não autenticado." });

    const { id } = req.params;

    const redacaoExistente = await prisma.redacao.findUnique({ where: { id } });
    if (!redacaoExistente) return res.status(404).json({ erro: "Redação não encontrada." });
    if (redacaoExistente.usuarioId !== usuarioId) return res.status(403).json({ erro: "Sem permissão para excluir esta redação." });

    await prisma.redacao.delete({ where: { id } });

    return res.json({ mensagem: "Redação excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir redação:", error);
    return res.status(500).json({ erro: "Erro ao excluir redação." });
  }
};
