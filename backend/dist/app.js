"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const index_1 = __importDefault(require("./routes/index"));
const avaliacaoRoutes_1 = __importDefault(require("./routes/avaliacaoRoutes"));
const redacaoRoutes_1 = __importDefault(require("./routes/redacaoRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' })); // Aumentar limite para imagens base64
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use("/auth", authRoutes_1.default);
app.use(index_1.default);
app.use('/avaliacoes', avaliacaoRoutes_1.default);
app.use("/redacoes", redacaoRoutes_1.default);
app.use("/api", index_1.default);
exports.default = app;
