import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";

const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || "secreto";

export const register = async (req: Request, res: Response) => {
  const { nome, email, senha } = req.body;

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) return res.status(400).json({ erro: "Usuário já existe." });

  const senhaHash = await bcrypt.hash(senha, 10);

  const user = await prisma.user.create({
    data: { nome, email, senhaHash }
  });

  res.json({ id: user.id, nome: user.nome, email: user.email });
};

export const login = async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(senha, user.senhaHash)))
    return res.status(401).json({ erro: "Credenciais inválidas." });

  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: "1d" });
  res.json({ token });
};
