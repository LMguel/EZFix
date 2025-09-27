import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { extrairTextoDaImagem, gerarNotaAutomatica } from "../services/ocrService";


const prisma = new PrismaClient();

// Listar todas as redações de um usuário
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

// Obter uma redação específica
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
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Criar nova redação com OCR + nota automática
export const criarRedacao = async (req: Request, res: Response) => {
    try {
        const { titulo, imagemUrl } = req.body;
        const usuarioId = req.userId;

        if (!usuarioId) {
            return res.status(401).json({ erro: "Usuário não autenticado." });
        }

        // 1) Extrair texto da imagem
        const textoExtraido = await extrairTextoDaImagem(imagemUrl);

        // 2) Gerar nota automática
        const notaGerada = gerarNotaAutomatica(textoExtraido);

        // 3) Salvar no banco
        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                imagemUrl,
                textoExtraido,
                notaGerada,
                usuarioId,
            },
        });

        return res.status(201).json(redacao);
    } catch (error) {
        console.error("Erro ao criar redação:", error);
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Atualizar redação
export const atualizarRedacao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { titulo, imagemUrl, textoExtraido, notaFinal } = req.body;
        const usuarioId = req.userId;

        const redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });

        if (!redacao) {
            return res.status(404).json({ erro: "Redação não encontrada." });
        }

        let novoTextoExtraido = textoExtraido ?? redacao.textoExtraido;
        let novaNotaGerada = redacao.notaGerada;

        // ⚡ Se imagem foi alterada → rodar OCR novamente
        if (imagemUrl && imagemUrl !== redacao.imagemUrl) {
            novoTextoExtraido = await extrairTextoDaImagem(imagemUrl);
            novaNotaGerada = gerarNotaAutomatica(novoTextoExtraido || "");
        }

        const redacaoAtualizada = await prisma.redacao.update({
            where: { id },
            data: {
                titulo,
                imagemUrl,
                textoExtraido: novoTextoExtraido,
                notaGerada: novaNotaGerada,
                notaFinal, // definido pelo professor/corretor
            },
        });

        return res.json(redacaoAtualizada);
    } catch (error) {
        console.error("Erro ao atualizar redação:", error);
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};

// Excluir redação
export const excluirRedacao = async (req: Request, res: Response) => {
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

        return res.json({ mensagem: "Redação excluída com sucesso." });
    } catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};


