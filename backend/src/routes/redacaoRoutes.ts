import { Router } from "express";
import multer from 'multer';
import {
    listarRedacoes,
    obterRedacao,
    criarRedacao,
    excluirRedacao,
    obterAnaliseEnem,
    reanalisarTexto,
} from "../controllers/redacaoController";
import { autenticar } from "../middleware/auth";

const router = Router();

// Configuração do Multer para upload de imagem em memória
// Aumentamos o limite para 10MB para acomodar imagens de alta resolução
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --- Rotas Principais ---

/**
 * @route   POST /api/redacoes
 * @desc    Cria uma nova redação a partir de um upload de imagem.
 * @access  Privado
 */
router.post("/", autenticar, upload.single('file'), criarRedacao);

/**
 * @route   GET /api/redacoes
 * @desc    Lista todas as redações do usuário autenticado.
 * @access  Privado
 */
router.get("/", autenticar, listarRedacoes);

/**
 * @route   POST /api/redacoes/reanalisar
 * @desc    Recebe um texto editado e retorna uma nova análise ENEM completa.
 * @access  Privado
 */
router.post("/reanalisar", autenticar, reanalisarTexto);


// --- Rotas por ID da Redação ---

/**
 * @route   GET /api/redacoes/:id
 * @desc    Obtém os dados básicos de uma redação específica.
 * @access  Privado
 */
router.get("/:id", autenticar, obterRedacao);

/**
 * @route   DELETE /api/redacoes/:id
 * @desc    Exclui uma redação específica.
 * @access  Privado
 */
router.delete("/:id", autenticar, excluirRedacao);

/**
 * @route   GET /api/redacoes/:id/analise-enem
 * @desc    Inicia ou verifica o status da análise completa (padrão ENEM) de uma redação.
 * @returns {status: 'started'|'running'|'completed', ...}
 * @access  Privado
 */
router.get("/:id/analise-enem", autenticar, obterAnaliseEnem);


export default router;