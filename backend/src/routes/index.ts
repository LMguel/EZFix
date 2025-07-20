import { Router } from "express";
import { register, login } from "../controllers/authController";
import {
    listarRedacoes,
    criarRedacao,
    avaliarRedacao
} from "../controllers/redacaoController";
import { autenticar } from "../middleware/auth";

const router = Router();

router.post("/auth/register", register);
router.post("/auth/login", login);

router.get("/redacoes", autenticar, listarRedacoes);
router.post("/redacoes", autenticar, criarRedacao);
router.post("/redacoes/:redacaoId/avaliar", autenticar, avaliarRedacao);

export default router;