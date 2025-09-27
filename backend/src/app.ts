import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index";
import avaliacaoRoutes from './routes/avaliacaoRoutes';
import redacaoRoutes from "./routes/redacaoRoutes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(routes);
app.use('/avaliacoes', avaliacaoRoutes);
app.use("/redacoes", redacaoRoutes);
app.use("/api", routes);


export default app;