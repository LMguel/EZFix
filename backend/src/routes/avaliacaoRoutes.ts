import { Router } from "express";
import {
    listarAvaliacoes,
    obterAvaliacao,
    criarAvaliacao,
    atualizarAvaliacao,
    deletarAvaliacao,
} from "../controllers/avaliacaoController";
import { autenticar } from "../middleware/auth";

const router = Router();

// CRUD de avaliações
router.get("/redacao/:redacaoId", autenticar, listarAvaliacoes);
router.get("/:id", autenticar, obterAvaliacao);
router.post("/", autenticar, criarAvaliacao);
router.put("/:id", autenticar, atualizarAvaliacao);
router.delete("/:id", autenticar, deletarAvaliacao);

export default router;
