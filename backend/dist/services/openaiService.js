"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cropImage = cropImage;
exports.extrairTextoDaImagem = extrairTextoDaImagem;
exports.gerarNotaAutomatica = gerarNotaAutomatica;
exports.chamarLLM = chamarLLM;
const openai_1 = __importDefault(require("openai"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp")); // usado para crop e otimização de imagem
const apiKey = process.env.OPENAI_API_KEY || '';
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureKey = process.env.AZURE_OPENAI_KEY || '';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-11-22';
const allowOpenAIFallback = /^(1|true|yes)$/i.test(process.env.LLM_ALLOW_OPENAI_FALLBACK || '');
const openaiModel = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
if (!apiKey && !(azureEndpoint && azureKey && azureDeployment)) {
    console.warn('Nenhuma chave OpenAI detectada. Configure OPENAI_API_KEY ou as variáveis AZURE_OPENAI_* para habilitar chamadas ao LLM.');
}
const client = apiKey ? new openai_1.default({ apiKey }) : null;
function buildMessages(userContent, systemContent) {
    if (systemContent) {
        return [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
        ];
    }
    return [{ role: 'user', content: userContent }];
}
function sanitizePrompt(original) {
    // Remove possíveis instruções de bypass e suaviza o pedido
    let cleaned = original
        .replace(/ignore\s+.*?\s+rules/gi, '')
        .replace(/jailbreak/gi, '')
        .replace(/bypass/gi, '')
        .replace(/prompt\s*injection/gi, '')
        .slice(0, 8000); // evita prompts gigantes
    const system = 'Você é um assistente que segue rigorosamente as políticas de uso. Responda de forma segura, neutra e sem gerar conteúdo sensível.';
    const user = `Por favor, corrija ortografia e gramática e produza um texto claro e neutro a partir do conteúdo abaixo, sem adicionar instruções, opiniões, conteúdo sensível nem violar políticas. Mantenha apenas o conteúdo informativo.\n\n"""\n${cleaned}\n"""`;
    return { system, user };
}
function looksLikeContentFilterError(text) {
    try {
        const json = JSON.parse(text);
        const code = (json?.error?.code || json?.code || '').toString();
        const inner = (json?.error?.innererror?.code || '').toString();
        const cf = json?.error?.code === 'content_filter'
            || /ResponsibleAIPolicyViolation/i.test(inner)
            || /content[_-]?filter/i.test(code);
        return !!cf;
    }
    catch {
        return /content[_-]?filter/i.test(text) || /ResponsibleAIPolicyViolation/i.test(text);
    }
}
/**
 * 🔍 Recorta (crop) uma região específica da imagem.
 */
async function cropImage(imagePath, region) {
    const outputPath = path_1.default.join(path_1.default.dirname(imagePath), `cropped_${path_1.default.basename(imagePath)}`);
    await (0, sharp_1.default)(imagePath)
        .extract({
        left: region.x,
        top: region.y,
        width: region.width,
        height: region.height
    })
        .toFile(outputPath);
    return outputPath;
}
/**
 * 📄 OCR com cache para evitar reprocessamento infinito.
 */
const ocrCache = new Map();
/**
 * Extrai texto manuscrito da imagem via Azure Vision OCR.
 */
async function extrairTextoDaImagem(imagePath) {
    if (!azureEndpoint || !azureKey) {
        throw new Error('Azure Vision não configurado corretamente.');
    }
    // Se a imagem já estiver em processamento, retorna a mesma Promise
    if (ocrCache.has(imagePath)) {
        console.log(`🟡 OCR já em andamento para: ${imagePath}`);
        return await ocrCache.get(imagePath);
    }
    // Define o processamento dentro da Promise e armazena no cache
    const ocrPromise = (async () => {
        try {
            const visionUrl = `${azureEndpoint.replace(/\/+$/, '')}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=read`;
            const imageBuffer = fs_1.default.readFileSync(imagePath);
            const res = await fetch(visionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Ocp-Apim-Subscription-Key': azureKey,
                },
                body: imageBuffer,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Erro OCR Azure Vision: ${res.status} ${text}`);
            }
            const data = await res.json();
            const texto = data.readResult?.content ||
                data.readResult?.blocks?.map((b) => b.lines.map((l) => l.text).join('\n')).join('\n') ||
                '';
            if (!texto.trim()) {
                console.warn('⚠️ OCR retornou texto vazio — possivelmente manuscrito ilegível.');
            }
            return texto.trim();
        }
        finally {
            // Remove do cache após conclusão (evita bloqueios permanentes)
            ocrCache.delete(imagePath);
        }
    })();
    // Armazena a promise no cache
    ocrCache.set(imagePath, ocrPromise);
    return await ocrPromise;
}
/**
 * 🤖 Gera uma nota automática com base no texto extraído.
 */
async function gerarNotaAutomatica(texto) {
    if (!texto || texto.length < 10) {
        console.warn('⚠️ Texto insuficiente para gerar nota.');
        return 0;
    }
    const prompt = `
Você é um corretor de redações. Avalie a seguinte redação considerando:
- Clareza e coerência
- Estrutura e argumentação
- Gramática e ortografia
Atribua uma nota entre 0 e 100.

Redação:
"""
${texto}
"""
Responda apenas com o número da nota.
`;
    const resposta = await chamarLLM(prompt, 200);
    const match = resposta.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}
/**
 * ✳️ Função genérica para chamadas LLM (Azure ou OpenAI)
 */
async function chamarLLM(prompt, maxTokens = 1000) {
    if (azureEndpoint && azureKey && azureDeployment) {
        let endpointOrigin = azureEndpoint.replace(/\/+$/, '');
        try {
            const u = new URL(endpointOrigin);
            if (u.pathname && u.pathname.includes('/openai')) {
                endpointOrigin = `${u.protocol}//${u.host}`;
            }
        }
        catch { }
        const chatUrl = `${endpointOrigin}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${azureApiVersion}`;
        // Sanitizar o prompt e usar system+user já na primeira tentativa
        const safe = sanitizePrompt(prompt);
        const baseBody = {
            messages: buildMessages(safe.user, safe.system),
            // Não enviar temperature: alguns deployments só aceitam o default
        };
        // Tenta primeiro com o parâmetro mais novo: max_completion_tokens
        let res = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureKey,
            },
            body: JSON.stringify({ ...baseBody, max_completion_tokens: maxTokens }),
        });
        if (!res.ok) {
            const text = await res.text();
            // Se o modelo não aceitar max_completion_tokens, tenta com max_tokens (compatibilidade)
            if (/max_completion_tokens/i.test(text) && /unsupported|unrecognized|not supported/i.test(text)) {
                res = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': azureKey,
                    },
                    body: JSON.stringify({ ...baseBody, max_tokens: maxTokens }),
                });
            }
            else if (/max_tokens/i.test(text) && /use 'max_completion_tokens'/i.test(text)) {
                // Caso inverso (mensagem já sugere usar max_completion_tokens), refaz com o parâmetro novo
                res = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': azureKey,
                    },
                    body: JSON.stringify({ ...baseBody, max_completion_tokens: maxTokens }),
                });
            }
            else if (looksLikeContentFilterError(text)) {
                // Retry com prompt seguro
                const body1 = { messages: buildMessages(safe.user, safe.system), max_completion_tokens: maxTokens };
                res = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': azureKey,
                    },
                    body: JSON.stringify(body1),
                });
                if (!res.ok) {
                    const t2 = await res.text();
                    if (looksLikeContentFilterError(t2) && client && allowOpenAIFallback) {
                        // Fallback para OpenAI público
                        const openaiResponse = await client.responses.create({
                            model: 'gpt-4o',
                            input: `${safe.system}\n\n${safe.user}`,
                            max_output_tokens: maxTokens,
                            temperature: 0.2,
                        });
                        return openaiResponse.output_text || JSON.stringify(openaiResponse.output, null, 2);
                    }
                    throw new Error(`Erro Azure Chat: ${res.status} ${t2}`);
                }
            }
            else {
                throw new Error(`Erro Azure Chat: ${res.status} ${text}`);
            }
        }
        if (!res.ok)
            throw new Error(`Erro Azure Chat: ${res.status} ${await res.text()}`);
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content ||
            json.choices?.[0]?.text ||
            json.output_text ||
            '';
        return content.trim();
    }
    if (!client)
        throw new Error('OPENAI_API_KEY não configurada e Azure não configurado');
    try {
        const response = await client.responses.create({
            model: openaiModel,
            input: prompt,
            max_output_tokens: maxTokens,
            temperature: 0.2,
        });
        return response.output_text || JSON.stringify(response.output, null, 2);
    }
    catch (err) {
        const code = err?.code || err?.error?.code || '';
        const status = err?.status || err?.error?.status || '';
        if (code === 'insufficient_quota' || status === 429) {
            console.warn('OpenAI fallback falhou por quota insuficiente (429). Verifique o billing/credits do projeto OpenAI.');
        }
        throw err;
    }
}
