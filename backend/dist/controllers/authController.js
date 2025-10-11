"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
const SECRET = process.env.JWT_SECRET || "secreto";
const register = async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existente = await prisma.user.findUnique({ where: { email } });
        if (existente) {
            return res.status(400).json({ erro: "Usuário já existe." });
        }
        const senhaHash = await bcryptjs_1.default.hash(senha, 10);
        const user = await prisma.user.create({
            data: { nome, email, senhaHash },
        });
        return res.json({ id: user.id, nome: user.nome, email: user.email });
    }
    catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, senha } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcryptjs_1.default.compare(senha, user.senhaHash))) {
            return res.status(401).json({ erro: "Credenciais inválidas." });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, SECRET, { expiresIn: "1d" });
        return res.json({ token });
    }
    catch (error) {
        return res.status(500).json({ erro: "Ocorreu um erro no servidor." });
    }
};
exports.login = login;
