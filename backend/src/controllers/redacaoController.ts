import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const listarRedacoes = async (req: Request, res: Response) => {
    const usuarioId = req.userId;
    const redacoes = await prisma.redacao.findMany({
        where: { usuarioId },
        include: { avaliacoes: true }
    });
    res.json(redacoes);
};

export const criarRedacao = async (req: Request, res: Response) => {
    const { titulo, imagemUrl, textoExtraido } = req.body;

    const redacao = await prisma.redacao.create({
        data: {
            titulo,
            imagemUrl,
            textoExtraido,
            usuarioId: req.userId
        }
    });

    res.status(201).json(redacao);
};

export const avaliarRedacao = async (req: Request, res: Response) => {
    const { redacaoId } = req.params;
    const { competencias } = req.body; // array de { competencia, notaComp, comentario }

    await Promise.all(
        competencias.map(async (comp: any) => {
            await prisma.avaliacao.create({
                data: {
                    competencia: comp.competencia,
                    notaComp: comp.notaComp,
                    comentario: comp.comentario,
                    redacaoId
                }
            });
        })
    );

    res.json({ ok: true });
};
