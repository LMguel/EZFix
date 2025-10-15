// googleAIService.ts (Versão Final com Vertex AI e modelo compatível)
import { VertexAI } from '@google-cloud/vertexai';

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION;

if (!GCP_PROJECT_ID || !GCP_LOCATION) {
    console.warn("Variáveis de ambiente GCP_PROJECT_ID ou GCP_LOCATION não configuradas.");
}

const vertex_ai = new VertexAI({ project: GCP_PROJECT_ID!, location: GCP_LOCATION! });

// MUDANÇA: Usando o modelo 'gemini-pro', que é universalmente compatível.
const model = 'gemini-pro';

const generativeModel = vertex_ai.getGenerativeModel({
    model: model,
});

export async function chamarGemini(prompt: string): Promise<string> {
    try {
        console.log("Enviando prompt para o Google Gemini (modelo gemini-pro) via Vertex AI...");
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;

        if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content?.parts[0]?.text) {
            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                throw new Error("A resposta da IA foi bloqueada pelo filtro de segurança do Google (SAFETY).");
            }
            throw new Error(`A IA retornou uma resposta vazia ou malformada. Razão: ${finishReason}`);
        }

        const text = response.candidates[0].content.parts[0].text;
        console.log("SUCESSO! Resposta recebida do Google Gemini (Vertex AI).");
        return text;
    } catch (error: any) {
        console.error("Erro ao chamar a API do Google Gemini (Vertex AI):", error.message);
        throw new Error(`Falha na comunicação com o Google Gemini (Vertex AI): ${error.message}`);
    }
}