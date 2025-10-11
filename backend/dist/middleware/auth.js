"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autenticar = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const autenticar = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ erro: "Token ausente" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "secreto");
        req.userId = decoded.userId;
        return next();
    }
    catch {
        return res.status(401).json({ erro: "Token inválido" });
    }
};
exports.autenticar = autenticar;
