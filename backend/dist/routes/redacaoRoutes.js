"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const redacaoController_1 = require("../controllers/redacaoController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
// CRUD de redações
router.get("/", auth_1.autenticar, redacaoController_1.listarRedacoes);
router.get("/:id", auth_1.autenticar, redacaoController_1.obterRedacao);
router.get("/:id/analise", auth_1.autenticar, redacaoController_1.obterAnaliseRedacao);
router.get("/:id/analise-enem", auth_1.autenticar, redacaoController_1.obterAnaliseEnem);
// aceitar upload opcional de arquivo via multipart/form-data (campo 'file')
router.post("/", auth_1.autenticar, upload.single('file'), redacaoController_1.criarRedacao);
router.post("/reanalisar", auth_1.autenticar, redacaoController_1.reanalisarTexto);
router.post("/reanalyze", auth_1.autenticar, redacaoController_1.reanalisarTexto); // Rota alternativa para compatibilidade
router.post("/:id/analise-enem", auth_1.autenticar, redacaoController_1.obterAnaliseEnem);
router.put("/:id", auth_1.autenticar, redacaoController_1.atualizarRedacao);
router.delete("/:id", auth_1.autenticar, redacaoController_1.excluirRedacao);
exports.default = router;
