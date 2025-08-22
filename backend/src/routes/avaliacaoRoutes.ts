import { Router } from "express";
import {
    criarAvaliacao,
    listarAvaliacoes,
    atualizarAvaliacao,
    deletarAvaliacao,
} from "../controllers/avaliacaoController";

const router = Router();

/**
 * Rotas de Avaliações
 */

// Criar uma avaliação
router.post("/", criarAvaliacao);

// Listar todas avaliações de uma redação
router.get("/:redacaoId", listarAvaliacoes);

// Atualizar uma avaliação pelo ID
router.put("/:id", atualizarAvaliacao);

// Deletar uma avaliação pelo ID
router.delete("/:id", deletarAvaliacao);

export default router;
