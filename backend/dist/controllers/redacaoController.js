"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.excluirRedacao = exports.obterAnaliseEnem = exports.obterAnaliseRedacao = exports.reanalisarTexto = exports.atualizarRedacao = exports.criarRedacao = exports.obterRedacao = exports.listarRedacoes = void 0;
const client_1 = require("@prisma/client");
const ocrService_1 = require("../services/ocrService");
const analiseService_1 = require("../services/analiseService");
const ennAnalysisService_1 = require("../services/ennAnalysisService");
const ennAnalysisService_2 = require("../services/ennAnalysisService");
const prisma = new client_1.PrismaClient();
const analiseJobs = new Map();
const analiseCache = new Map();
const ANALISE_TTL_MS = 5 * 60 * 1000; // 5 minutos
// Listar todas as redações de um usuário
const listarRedacoes = async (req, res) => {
    try {
        const usuarioId = req.userId;
        const redacoes = await prisma.redacao.findMany({
            where: { usuarioId },
            include: { avaliacoes: true },
        });
        return res.json(redacoes);
    }
    catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.listarRedacoes = listarRedacoes;
// Obter uma redação específica
const obterRedacao = async (req, res) => {
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
    }
    catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.obterRedacao = obterRedacao;
// Criar nova redação com OCR + nota automática
const criarRedacao = async (req, res) => {
    try {
        const { titulo } = req.body;
        // imagem pode vir em req.file (upload multipart) ou em req.body.imagemUrl (dataURL/URL)
        const file = req.file;
        const imagemUrl = file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : req.body.imagemUrl;
        const usuarioId = req.userId;
        if (!usuarioId) {
            return res.status(401).json({ erro: "Usuário não autenticado." });
        }
        if (!titulo || !imagemUrl) {
            return res.status(400).json({ erro: "Título e imagem são obrigatórios. Envie arquivo (field 'file') ou imagemUrl." });
        }
        console.log("Criando redação:", { titulo, imageType: imagemUrl.startsWith('data:') ? 'base64' : 'url' });
        // 1) Extrair texto da imagem
        let ocrResult = null;
        try {
            ocrResult = await (0, ocrService_1.extrairTextoDaImagem)(imagemUrl);
        }
        catch (ocrError) {
            console.error("Erro específico no OCR:", ocrError);
            // Se for erro de imagem inválida/truncada, retornar 400 para o frontend evitar re-submissões em loop
            const msg = ocrError?.message?.toString() || '';
            if (msg.includes('truncada') || msg.includes('assinatura do arquivo') || msg.includes('pngload_buffer') || msg.includes('Falha ao decodificar imagem')) {
                return res.status(400).json({ erro: 'Imagem inválida ou corrompida. Verifique o arquivo enviado (base64/url).' });
            }
            // Continuar mesmo com erro de OCR genérico
            ocrResult = { text: 'Erro ao processar OCR - texto não pôde ser extraído.', confidence: 0, engine: 'mixed' };
        }
        const textoExtraido = ocrResult?.text || '';
        // 2) Gerar nota automática
        const notaGerada = (0, ocrService_1.gerarNotaAutomatica)(textoExtraido);
        // 3) Analisar texto e gerar feedback local
        const analiseLocal = (0, analiseService_1.analisarTexto)(textoExtraido);
        // 4) Tentar formatar o texto com LLM para apresentação mais legível (opcional via env)
        let textoFormatado = textoExtraido;
        let correcoesSugeridas = [];
        const formatOnCreate = /^(1|true|yes)$/i.test(process.env.LLM_FORMAT_ON_CREATE || '');
        if (formatOnCreate) {
            try {
                const formatted = await (0, ennAnalysisService_2.formatarTextoComLLM)(textoExtraido);
                if (formatted && typeof formatted === 'object' && formatted.textoFormatado) {
                    textoFormatado = formatted.textoFormatado || textoExtraido;
                    correcoesSugeridas = formatted.correcoes || [];
                }
                else if (typeof formatted === 'string') {
                    textoFormatado = formatted;
                }
            }
            catch (fmtErr) {
                console.warn('Formatação com LLM falhou, usando texto OCR bruto:', fmtErr);
            }
        }
        // 4) Salvar no banco
        const redacao = await prisma.redacao.create({
            data: {
                titulo,
                // armazenar a imagem enviada inteira (se o banco suportar); evitar truncamento que causa reprocessamento com base64 corrompido
                imagemUrl: imagemUrl,
                textoExtraido: textoFormatado,
                notaGerada,
                usuarioId,
            },
        });
        console.log("Redação criada com sucesso:", redacao.id);
        // Retornar redação com análise e correções sugeridas
        return res.status(201).json({
            ...redacao,
            ocr: ocrResult,
            analise: analiseLocal,
            correcoesSugeridas
        });
    }
    catch (error) {
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
exports.criarRedacao = criarRedacao;
// Atualizar redação
const atualizarRedacao = async (req, res) => {
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
            const newOcr = await (0, ocrService_1.extrairTextoDaImagem)(imagemUrl);
            novoTextoExtraido = newOcr?.text || '';
            novaNotaGerada = (0, ocrService_1.gerarNotaAutomatica)(novoTextoExtraido || "");
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
        // se usuário enviou texto para re-análise, executar análise ENEM com LLM novamente
        let analiseAtualizada = null;
        try {
            const textoParaAnalise = novoTextoExtraido || redacaoAtualizada.textoExtraido || '';
            const formatted = await (0, ennAnalysisService_2.formatarTextoComLLM)(textoParaAnalise);
            let textoFmt = textoParaAnalise;
            if (formatted && typeof formatted === 'object' && formatted.textoFormatado) {
                textoFmt = formatted.textoFormatado;
            }
            else if (typeof formatted === 'string')
                textoFmt = formatted;
            analiseAtualizada = await (0, ennAnalysisService_1.analisarEnem)(textoFmt);
        }
        catch (e) {
            console.warn('Falha ao reanalisar redação atualizada:', e);
        }
        return res.json({ redacao: redacaoAtualizada, analise: analiseAtualizada });
    }
    catch (error) {
        console.error("Erro ao atualizar redação:", error);
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.atualizarRedacao = atualizarRedacao;
// Endpoint: reanalisar texto manualmente (o frontend pode enviar texto editado e receber análise ENEM)
const reanalisarTexto = async (req, res) => {
    try {
        const { texto } = req.body;
        if (!texto || texto.trim().length === 0)
            return res.status(400).json({ erro: 'Texto inválido para reanálise.' });
        // formatar e analisar (o formatador agora retorna objeto com correcoes)
        const formatted = await (0, ennAnalysisService_2.formatarTextoComLLM)(texto);
        let textoFmt = texto;
        let correcoes = [];
        if (formatted && typeof formatted === 'object') {
            textoFmt = formatted.textoFormatado || texto;
            correcoes = formatted.correcoes || [];
        }
        else if (typeof formatted === 'string')
            textoFmt = formatted;
        const analise = await (0, ennAnalysisService_1.analisarEnem)(textoFmt);
        return res.json({ textoFormatado: textoFmt, correcoes, analise });
    }
    catch (e) {
        console.error('Erro ao reanalisar texto:', e);
        return res.status(500).json({ erro: 'Erro ao reanalisar texto.' });
    }
};
exports.reanalisarTexto = reanalisarTexto;
// Obter análise de uma redação específica
const obterAnaliseRedacao = async (req, res) => {
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
        // Gerar análise do texto (local) e retorno também detalhes de OCR se disponíveis
        const analise = (0, analiseService_1.analisarTexto)(redacao.textoExtraido || "");
        return res.json({ redacao, analise });
    }
    catch (error) {
        console.error("Erro ao obter análise:", error);
        return res.status(500).json({ erro: "Erro interno do servidor." });
    }
};
exports.obterAnaliseRedacao = obterAnaliseRedacao;
// Obter análise ENEM de uma redação específica (usa LLM)
const obterAnaliseEnem = async (req, res) => {
    try {
        const { id } = req.params;
        const usuarioId = req.userId;
        let redacao = await prisma.redacao.findFirst({
            where: { id, usuarioId },
        });
        if (!redacao)
            return res.status(404).json({ erro: 'Redação não encontrada.' });
        let texto = redacao.textoExtraido || '';
        let ocrDetails = null;
        // Só rode OCR se não houver texto extraído suficiente
        if (!texto || texto.trim().length < 10) {
            try {
                ocrDetails = await (0, ocrService_1.extrairTextoDaImagem)(redacao.imagemUrl || '');
                if (ocrDetails?.text && ocrDetails.text.trim().length > 0) {
                    await prisma.redacao.update({
                        where: { id: redacao.id },
                        data: { textoExtraido: ocrDetails.text }
                    });
                    // Recarregue a redação para garantir que textoExtraido está atualizado
                    redacao = await prisma.redacao.findFirst({
                        where: { id, usuarioId },
                    });
                    texto = redacao?.textoExtraido || '';
                }
            }
            catch (e) {
                // tratamento de erro
            }
        }
        // Garantir que redacao ainda existe após reprocessos
        if (!redacao)
            return res.status(404).json({ erro: 'Redação não encontrada.' });
        // O RESTANTE DO CÓDIGO USA O NOVO VALOR DE texto
        // Cache TTL e job registry para evitar reprocesso em loop (incluindo formatação)
        const cacheEntry = analiseCache.get(redacao.id);
        const now = Date.now();
        if (cacheEntry && now - cacheEntry.cachedAt < ANALISE_TTL_MS) {
            // Usar dados do cache
            const cached = cacheEntry.data;
            return res.json({
                redacao,
                ocr: ocrDetails,
                textoFormatado: cached.textoFormatado,
                correcoes: cached.correcoes,
                analise: cached.analise
            });
        }
        // Se já há job em andamento, retornar 202
        const existing = analiseJobs.get(redacao.id);
        if (existing) {
            res.status(202);
            return res.json({ status: 'running', redacao, message: 'Análise em processamento...' });
        }
        // Iniciar job completo (formatação + análise)
        const jobPromise = (async () => {
            let textoFormatado = texto;
            let correcoesParaFrontend = [];
            let analiseEnem = null;
            try {
                // Etapa 1: Formatação
                const fmt = await (0, ennAnalysisService_2.formatarTextoComLLM)(texto);
                if (fmt && typeof fmt === 'object') {
                    textoFormatado = fmt.textoFormatado || texto;
                    correcoesParaFrontend = fmt.correcoes || [];
                }
                else if (typeof fmt === 'string') {
                    textoFormatado = fmt;
                }
            }
            catch (e) {
                console.warn('Falha ao formatar texto antes da análise ENEM:', e);
            }
            try {
                // Etapa 2: Análise ENEM
                analiseEnem = await (0, ennAnalysisService_1.analisarEnem)(textoFormatado);
            }
            catch (e) {
                analiseEnem = {
                    pontosFavoraveis: [],
                    pontosMelhoria: [],
                    sugestoes: [],
                    detalheErroLLM: e?.message || 'Erro ao executar LLM',
                };
            }
            const analiseLocal = (0, analiseService_1.analisarTexto)(textoFormatado);
            const analiseCombinada = {
                ...analiseEnem,
                pontuacao: (analiseLocal && (analiseLocal.pontuacao ?? 0)) || 0,
                estatisticas: (analiseLocal && analiseLocal.estatisticas) || { palavras: 0, caracteres: 0, paragrafos: 0, frases: 0 },
                qualidadeOCR: (analiseLocal && analiseLocal.qualidadeOCR) || { nivel: 'baixa', problemas: [], confiabilidade: 0 },
                pontosPositivos: (analiseEnem?.pontosFavoraveis || analiseEnem?.comentarios || analiseLocal.pontosPositivos || []),
                pontosNegativos: (analiseEnem?.pontosMelhoria || analiseLocal.pontosNegativos || []),
                sugestoes: (analiseEnem?.sugestoes || analiseLocal.sugestoes || [])
            };
            const getNota = (pathObj, fallback) => {
                if (!pathObj && typeof fallback === 'number')
                    return fallback;
                return typeof pathObj === 'number' ? pathObj : (pathObj && pathObj.nota ? pathObj.nota : fallback);
            };
            const criterios = {
                C1: Math.round((getNota(analiseCombinada.detalhamento?.norma, analiseCombinada.breakdown?.norma || 0) || 0) * 10) / 10,
                C2: Math.round((getNota(analiseCombinada.detalhamento?.tese, analiseCombinada.breakdown?.tese || 0) || 0) * 10) / 10,
                C3: Math.round((getNota(analiseCombinada.detalhamento?.argumentos, analiseCombinada.breakdown?.argumentos || 0) || 0) * 10) / 10,
                C4: Math.round((getNota(analiseCombinada.detalhamento?.coesao, analiseCombinada.breakdown?.coesao || 0) || 0) * 10) / 10,
                C5: Math.round((getNota(analiseCombinada.detalhamento?.repertorio, analiseCombinada.breakdown?.repertorio || 0) || 0) * 10) / 10,
            };
            analiseCombinada.criterios = criterios;
            // Salvar resultado completo no cache
            const resultado = {
                textoFormatado,
                correcoes: correcoesParaFrontend,
                analise: analiseCombinada
            };
            analiseCache.set(redacao.id, { data: resultado, cachedAt: Date.now() });
            return resultado;
        })();
        analiseJobs.set(redacao.id, { promise: jobPromise, startedAt: now });
        // Processar em background e retornar 202 imediatamente
        jobPromise.finally(() => {
            analiseJobs.delete(redacao.id);
        });
        res.status(202);
        return res.json({ status: 'running', redacao, message: 'Análise iniciada...' });
    }
    catch (error) {
        console.error('Erro ao obter análise ENEM:', error);
        return res.status(500).json({ erro: 'Erro ao gerar análise ENEM.' });
    }
};
exports.obterAnaliseEnem = obterAnaliseEnem;
// Excluir redação
const excluirRedacao = async (req, res) => {
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
    }
    catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.excluirRedacao = excluirRedacao;
