import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

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
        usuarioId: usuarioId,
      },
    });

    return res.status(201).json(redacao);
  } catch (error) {
    return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
  }
};

export const avaliarRedacao = async (req: Request, res: Response) => {
  try {
    const { redacaoId } = req.params;
    const { competencias } = req.body; // array de { competencia, notaComp, comentario }

    await Promise.all(
      competencias.map(async (comp: any) => {
        await prisma.avaliacao.create({
          data: {
            competencia: comp.competencia,
            notaComp: comp.notaComp,
            comentario: comp.comentario,
            redacaoId,
          },
        });
      })
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
  }
};
