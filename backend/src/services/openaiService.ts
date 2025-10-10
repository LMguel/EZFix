import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp'; // usado para crop e otimização de imagem

const apiKey = process.env.OPENAI_API_KEY || '';
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureKey = process.env.AZURE_OPENAI_KEY || '';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-11-22';

if (!apiKey && !(azureEndpoint && azureKey && azureDeployment)) {
    console.warn('Nenhuma chave OpenAI detectada. Configure OPENAI_API_KEY ou as variáveis AZURE_OPENAI_* para habilitar chamadas ao LLM.');
}

const client = apiKey ? new OpenAI({ apiKey }) : null;

/**
 * 🔍 Recorta (crop) uma região específica da imagem.
 */
export async function cropImage(
    imagePath: string,
    region: { x: number; y: number; width: number; height: number }
): Promise<string> {
    const outputPath = path.join(path.dirname(imagePath), `cropped_${path.basename(imagePath)}`);
    await sharp(imagePath)
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
const ocrCache = new Map<string, Promise<string>>();

/**
 * Extrai texto manuscrito da imagem via Azure Vision OCR.
 */
export async function extrairTextoDaImagem(imagePath: string): Promise<string> {
    if (!azureEndpoint || !azureKey) {
        throw new Error('Azure Vision não configurado corretamente.');
    }

    // Se a imagem já estiver em processamento, retorna a mesma Promise
    if (ocrCache.has(imagePath)) {
        console.log(`🟡 OCR já em andamento para: ${imagePath}`);
        return await ocrCache.get(imagePath)!;
    }

    // Define o processamento dentro da Promise e armazena no cache
    const ocrPromise = (async () => {
        try {
            const visionUrl = `${azureEndpoint.replace(/\/+$/, '')}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=read`;
            const imageBuffer = fs.readFileSync(imagePath);

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

            const data: any = await res.json();
            const texto =
                data.readResult?.content ||
                data.readResult?.blocks?.map((b: any) =>
                    b.lines.map((l: any) => l.text).join('\n')
                ).join('\n') ||
                '';

            if (!texto.trim()) {
                console.warn('⚠️ OCR retornou texto vazio — possivelmente manuscrito ilegível.');
            }

            return texto.trim();
        } finally {
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
export async function gerarNotaAutomatica(texto: string): Promise<number> {
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
export async function chamarLLM(prompt: string, maxTokens = 1000): Promise<string> {
    if (azureEndpoint && azureKey && azureDeployment) {
        let endpointOrigin = azureEndpoint.replace(/\/+$/, '');
        try {
            const u = new URL(endpointOrigin);
            if (u.pathname && u.pathname.includes('/openai')) {
                endpointOrigin = `${u.protocol}//${u.host}`;
            }
        } catch { }

        const chatUrl = `${endpointOrigin}/openai/deployments/${encodeURIComponent(
            azureDeployment
        )}/chat/completions?api-version=${azureApiVersion}`;

        const chatBody = {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.2,
        };

        const res = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': azureKey,
            },
            body: JSON.stringify(chatBody),
        });

        if (!res.ok) throw new Error(`Erro Azure Chat: ${res.status} ${await res.text()}`);

        const json: any = await res.json();
        const content =
            json.choices?.[0]?.message?.content ||
            json.choices?.[0]?.text ||
            json.output_text ||
            '';
        return content.trim();
    }

    if (!client) throw new Error('OPENAI_API_KEY não configurada e Azure não configurado');

    const response: any = await client.responses.create({
        model: 'gpt-4o',
        input: prompt,
        max_output_tokens: maxTokens,
        temperature: 0.2,
    });

    return response.output_text || JSON.stringify(response.output, null, 2);
}
