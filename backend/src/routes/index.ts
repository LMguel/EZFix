import { Router } from "express";
import redacaoRoutes from "./redacaoRoutes";
import avaliacaoRoutes from "./avaliacaoRoutes";

const router = Router();

// Rotas de Redações
router.use("/redacoes", redacaoRoutes);

// Rotas de Avaliações (aninhadas em Redações)
router.use("/redacoes", avaliacaoRoutes);

export default router;
