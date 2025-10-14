import OpenAI from 'openai';
import axios from 'axios';

// --- Configuração das Variáveis de Ambiente ---
const apiKey = process.env.OPENAI_API_KEY || '';
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureKey = process.env.AZURE_OPENAI_KEY || '';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';
const allowOpenAIFallback = /^(1|true|yes)$/i.test(process.env.LLM_ALLOW_OPENAI_FALLBACK || 'false');
const openaiModel = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

if (!apiKey && !(azureEndpoint && azureKey && azureDeployment)) {
    console.warn('Nenhuma chave OpenAI detectada.');
}

const client = apiKey ? new OpenAI({ apiKey }) : null;

// --- Funções Utilitárias (Corpo Completo) ---

function buildMessages(userContent: string, systemContent?: string) {
    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (systemContent) {
        messages.push({ role: 'system', content: systemContent });
    }
    messages.push({ role: 'user', content: userContent });
    return messages;
}

// CORREÇÃO: Corpo da função preenchido
function sanitizePrompt(original: string): { system: string; user: string } {
    let cleaned = original
        .replace(/ignore\s+.*?\s+rules/gi, '')
        .replace(/jailbreak|bypass|prompt\s*injection/gi, '')
        .slice(0, 12000);

    const system = 'Você é um assistente especialista que segue rigorosamente as instruções fornecidas, focando em fornecer respostas precisas e seguras dentro do contexto solicitado.';
    const user = `Com base no conteúdo a seguir, execute a tarefa solicitada. Mantenha a resposta estritamente no formato pedido, sem adicionar opiniões ou informações fora do escopo.\n\n"""\n${cleaned}\n"""`;
    return { system, user };
}

// CORREÇÃO: Corpo da função preenchido
function looksLikeContentFilterError(text: string): boolean {
    if (!text) return false;
    try {
        const json = JSON.parse(text);
        const code = (json?.error?.code || json?.code || '').toString();
        const inner = (json?.error?.innererror?.code || '').toString();
        return code === 'content_filter' || /ResponsibleAIPolicyViolation/i.test(inner);
    } catch {
        return /content[_-]?filter/i.test(text) || /ResponsibleAIPolicyViolation/i.test(text);
    }
}

/**
 * ✳️ Função genérica para chamadas LLM - Versão Final
 */
export async function chamarLLM(prompt: string, maxTokens = 2048): Promise<string> {
    const safe = sanitizePrompt(prompt);
    const messages = buildMessages(safe.user, safe.system);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
        if (azureEndpoint && azureKey && azureDeployment) {
            const chatUrl = `${azureEndpoint.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${azureApiVersion}`;

            console.log("\n================================================================");
            console.log(" TENTANDO CHAMAR A API AZURE OPENAI COM AXIOS (PARÂMETRO CORRIGIDO)");
            console.log("--> URL Final Gerada:", chatUrl);
            console.log("================================================================\n");

            const body = { messages, max_completion_tokens: maxTokens};
            const headers = { 'Content-Type': 'application/json', 'api-key': azureKey };

            try {
                const response = await axios.post(chatUrl, body, {
                    headers: headers,
                    signal: controller.signal
                });

                const content = response.data.choices?.[0]?.message?.content || '';
                if (content) return content.trim();

            } catch (error: any) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const data = error.response?.data;
                    throw new Error(`API do Azure retornou status ${status}: ${JSON.stringify(data)}`);
                }
                throw error;
            }
        }

        if (client && allowOpenAIFallback) {
            console.log('Tentando fallback com a API pública da OpenAI...');
            const response = await client.chat.completions.create({
                model: openaiModel,
                messages,
                max_tokens: maxTokens,
            }, { signal: controller.signal });
            const content = response.choices[0]?.message?.content || '';
            return content.trim();
        }

        throw new Error('Nenhum serviço de LLM configurado ou o serviço principal falhou.');

    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.error('A chamada à API LLM excedeu o tempo limite.');
            throw new Error('A análise da redação demorou muito para responder.');
        }
        console.error('Erro ao chamar o serviço de LLM:', error.message);
        throw new Error(`Falha na comunicação com o serviço de IA: ${error.message}`);
    } finally {
        clearTimeout(timeoutId);
    }
}