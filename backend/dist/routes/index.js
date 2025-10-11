"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const redacaoRoutes_1 = __importDefault(require("./redacaoRoutes"));
const avaliacaoRoutes_1 = __importDefault(require("./avaliacaoRoutes"));
const router = (0, express_1.Router)();
// Rotas de Reda��es
router.use("/redacoes", redacaoRoutes_1.default);
// Rotas de Avalia��es (aninhadas em Reda��es)
router.use("/redacoes", avaliacaoRoutes_1.default);
exports.default = router;
