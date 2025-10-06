import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index";
import avaliacaoRoutes from './routes/avaliacaoRoutes';
import redacaoRoutes from "./routes/redacaoRoutes";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Aumentar limite para imagens base64
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use("/auth", authRoutes);
app.use(routes);
app.use('/avaliacoes', avaliacaoRoutes);
app.use("/redacoes", redacaoRoutes);
app.use("/api", routes);


export default app;