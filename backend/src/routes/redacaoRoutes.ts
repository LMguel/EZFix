import { Router } from "express";
import { autenticar } from "../middleware/auth";
import {
    listarRedacoes,
    obterRedacao,
    criarRedacao,
    atualizarRedacao,
    deletarRedacao,
    avaliarRedacao,
} from "../controllers/redacaoController";

const router = Router();

router.use(autenticar);

// CRUD de redações
router.get("/", listarRedacoes);
router.get("/:id", obterRedacao);
router.post("/", criarRedacao);
router.put("/:id", atualizarRedacao);
router.delete("/:id", deletarRedacao);

// Avaliação de redação
router.post("/:redacaoId/avaliar", avaliarRedacao);

export default router;
