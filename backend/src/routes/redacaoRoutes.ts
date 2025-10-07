import { Router } from "express";
import {
    listarRedacoes,
    obterRedacao,
    criarRedacao,
    atualizarRedacao,
    excluirRedacao,
    obterAnaliseRedacao,
    obterAnaliseEnem,
    reanalisarTexto,
} from "../controllers/redacaoController";
import { autenticar } from "../middleware/auth";

const router = Router();

// CRUD de redações
router.get("/", autenticar, listarRedacoes);
router.get("/:id", autenticar, obterRedacao);
router.get("/:id/analise", autenticar, obterAnaliseRedacao);
router.get("/:id/analise-enem", autenticar, obterAnaliseEnem);
router.post("/", autenticar, criarRedacao);
router.post("/reanalisar", autenticar, reanalisarTexto);
router.put("/:id", autenticar, atualizarRedacao);
router.delete("/:id", autenticar, excluirRedacao);

export default router;
