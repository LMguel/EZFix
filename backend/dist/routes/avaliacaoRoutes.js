"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const avaliacaoController_1 = require("../controllers/avaliacaoController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// CRUD de avalia��es
router.get("/redacao/:redacaoId", auth_1.autenticar, avaliacaoController_1.listarAvaliacoes);
router.get("/:id", auth_1.autenticar, avaliacaoController_1.obterAvaliacao);
router.post("/", auth_1.autenticar, avaliacaoController_1.criarAvaliacao);
router.put("/:id", auth_1.autenticar, avaliacaoController_1.atualizarAvaliacao);
router.delete("/:id", auth_1.autenticar, avaliacaoController_1.deletarAvaliacao);
exports.default = router;
