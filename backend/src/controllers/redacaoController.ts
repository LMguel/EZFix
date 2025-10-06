import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { extrairTextoDaImagem, gerarNotaAutomatica } from "../services/ocrService";
import { analisarTexto } from "../services/analiseService";


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

        if (!titulo || !imagemUrl) {
            return res.status(400).json({ erro: "Título e imagem são obrigatórios." });
        }

        console.log("Criando redação:", { titulo, imageType: imagemUrl.startsWith('data:') ? 'base64' : 'url' });

        // 1) Extrair texto da imagem
        let textoExtraido: string;
        try {
            textoExtraido = await extrairTextoDaImagem(imagemUrl);
        } catch (ocrError) {
            console.error("Erro específico no OCR:", ocrError);
            // Continuar mesmo com erro de OCR, salvando sem texto
            textoExtraido = "Erro ao processar OCR - texto não pôde ser extraído.";
        }

        // 2) Gerar nota automática
        const notaGerada = gerarNotaAutomatica(textoExtraido);

        // 3) Analisar texto e gerar feedback
        const analise = analisarTexto(textoExtraido);

        // 4) Salvar no banco
        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                imagemUrl: imagemUrl.length > 1000 ? imagemUrl.substring(0, 1000) + "..." : imagemUrl, // Truncar se muito longo
                textoExtraido,
                notaGerada,
                usuarioId,
            },
        });

        console.log("Redação criada com sucesso:", redacao.id);
        
        // Retornar redação com análise
        return res.status(201).json({
            ...redacao,
            analise
        });
    } catch (error) {
        console.error("Erro ao criar redação:", error);
        
        // Tratar diferentes tipos de erro
        if (error instanceof Error) {
            if (error.message.includes('PayloadTooLargeError')) {
                return res.status(413).json({ erro: "Imagem muito grande. Tente uma imagem menor." });
            }
            if (error.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ erro: "Redação duplicada." });
            }
        }
        
        return res.status(500).json({ erro: "Erro interno do servidor. Tente novamente." });
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

// Obter análise de uma redação específica
export const obterAnaliseRedacao = async (req: Request, res: Response) => {
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

        // Gerar análise do texto
        const analise = analisarTexto(redacao.textoExtraido || "");

        return res.json({
            redacao,
            analise
        });
    } catch (error) {
        console.error("Erro ao obter análise:", error);
        return res.status(500).json({ erro: "Erro interno do servidor." });
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


