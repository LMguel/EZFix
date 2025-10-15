import OpenAI from 'openai';
import axios from 'axios';
import https from 'https';

const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureKey = process.env.AZURE_OPENAI_KEY || '';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export async function chamarLLM(prompt: string, maxTokens = 2048, temperature = 0.3): Promise<string> {
    try {
        if (!azureEndpoint || !azureKey || !azureDeployment) {
            throw new Error('As variáveis de ambiente do Azure OpenAI não estão configuradas.');
        }

        const chatUrl = `${azureEndpoint.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${azureApiVersion}`;
        const body = { messages: [{ role: 'user', content: prompt }], max_completion_tokens: maxTokens };
        const headers = { 'Content-Type': 'application/json', 'api-key': azureKey };

        const response = await axios.post(chatUrl, body, { headers, httpsAgent });
        const content = response.data.choices?.[0]?.message?.content || '';
        console.log("SUCESSO! Resposta recebida da API Azure OpenAI.");
        return content.trim();

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status || 'N/A';
            const data = error.response?.data || error.message;
            throw new Error(`API do Azure retornou status ${status}: ${JSON.stringify(data)}`);
        }
        console.error('Erro ao chamar o serviço de LLM:', error.message);
        throw new Error(`Falha na comunicação com o serviço de IA: ${error.message}`);
    }
}

// Nova função para correção automática de texto OCR
export async function corrigirTextoOCR(textoOCR: string): Promise<string> {
    try {
        const promptCorrecao = `Você é um especialista em correção de textos extraídos por OCR de redações manuscritas. 

Sua tarefa é:
1. Corrigir erros de OCR (palavras mal interpretadas, caracteres trocados)
2. Corrigir erros ortográficos e gramaticais
3. Organizar o texto em parágrafos bem estruturados
4. Manter o sentido e o estilo original do autor
5. Garantir que todas as palavras sejam legíveis e corretas

IMPORTANTE: 
- NÃO altere o conteúdo ou significado do texto
- NÃO adicione informações que não estavam no original
- NÃO corrija opiniões ou argumentos do autor
- APENAS corrija erros técnicos de OCR e ortografia
- Mantenha a estrutura argumentativa original

Texto extraído por OCR:
"""
${textoOCR}
"""

Retorne APENAS o texto corrigido, sem comentários ou explicações:`;

        const textoCorrigido = await chamarLLM(promptCorrecao, 2048, 0.2);
        console.log("✅ Texto corrigido com sucesso pelo GPT");
        return textoCorrigido;

    } catch (error: any) {
        console.error("❌ Erro na correção automática:", error.message);
        // Se falhar, retorna o texto original
        return textoOCR;
    }
}