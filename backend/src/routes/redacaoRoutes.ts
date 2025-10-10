import { Router } from "express";
import multer from 'multer';
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// CRUD de redações
router.get("/", autenticar, listarRedacoes);
router.get("/:id", autenticar, obterRedacao);
router.get("/:id/analise", autenticar, obterAnaliseRedacao);
router.get("/:id/analise-enem", autenticar, obterAnaliseEnem);
// aceitar upload opcional de arquivo via multipart/form-data (campo 'file')
router.post("/", autenticar, upload.single('file'), criarRedacao);
router.post("/reanalisar", autenticar, reanalisarTexto);
router.post("/reanalyze", autenticar, reanalisarTexto); // Rota alternativa para compatibilidade
router.put("/:id", autenticar, atualizarRedacao);
router.delete("/:id", autenticar, excluirRedacao);

export default router;
