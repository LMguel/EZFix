import sharp from 'sharp';
import { extractTextWithAzureRead, AzureReadLine, AzureReadResult } from './azureVisionService';
import fetch from 'node-fetch';
// O Tesseract ainda é necessário para o fallback final
import Tesseract from "tesseract.js";

const posProcessarTextoManuscrito = (texto: string): string => {
    let textoCorrigido = texto;

    // 1. Remover caracteres problemáticos comuns do OCR
    textoCorrigido = textoCorrigido.replace(/[|¦§©®°±²³µ¶·¸¹º»¼½¾¿×÷]/g, '');

    // 2. Corrigir padrões comuns de erro em manuscritos
    const substituicoes = [
        // Caracteres confundidos
        [/\|/g, 'l'],     // | confundido com l
        [/\]/g, 'l'],     // ] confundido com l  
        [/\[/g, 'l'],     // [ confundido com l
        [/\}/g, ')'],     // } confundido com )
        [/\{/g, '('],     // { confundido com (
        [/~~/g, 'u'],     // ~~ confundido com u
        [/rn/g, 'm'],     // rn confundido com m
        [/ii/g, 'u'],     // ii confundido com u
        [/vv/g, 'w'],     // vv confundido com w

        // Pontuação problemática
        [/\s+([,.!?;:])/g, '$1'],  // Espaço antes de pontuação
        [/([,.!?;:])\s*([a-zA-ZÀ-ÿ])/g, '$1 $2'],  // Espaço após pontuação
    ];

    // Aplicar substituições
    for (const [pattern, replacement] of substituicoes) {
        textoCorrigido = textoCorrigido.replace(pattern as RegExp, replacement as string);
    }

    // 3. Corrigir espaçamentos múltiplos
    textoCorrigido = textoCorrigido.replace(/\s{2,}/g, ' ');

    // 4. Corrigir quebras de linha excessivas
    textoCorrigido = textoCorrigido.replace(/\n{3,}/g, '\n\n');

    // 5. Remover linhas com apenas caracteres especiais ou muito curtas
    const linhas = textoCorrigido.split('\n');
    const linhasFiltradas = linhas.filter(linha => {
        const linhaTrimmed = linha.trim();

        // Manter linhas vazias para formatação
        if (linhaTrimmed === '') return true;

        // Remover linhas com apenas caracteres especiais
        if (/^[^a-zA-ZÀ-ÿ0-9]+$/.test(linhaTrimmed)) return false;

        // Manter linhas com pelo menos 2 caracteres alfanuméricos (mais permissivo)
        const alfanumericos = linhaTrimmed.match(/[a-zA-ZÀ-ÿ0-9]/g);
        return alfanumericos && alfanumericos.length >= 2;
    });

    // 6. Juntar novamente e limpar espaços
    textoCorrigido = linhasFiltradas.join('\n').trim();

    // 7. Remover espaços no início e fim de cada linha
    textoCorrigido = textoCorrigido.replace(/^\s+|\s+$/gm, '');

    // 8. Tentar corrigir palavras muito fragmentadas
    textoCorrigido = corrigirPalavrasFragmentadas(textoCorrigido);

    return textoCorrigido;
};

/**
 * Tenta corrigir palavras que foram fragmentadas pelo OCR
 */
const corrigirPalavrasFragmentadas = (texto: string): string => {
    // Juntar letras isoladas que provavelmente fazem parte de uma palavra
    // Exemplo: "e s t e" -> "este"
    let textoCorrigido = texto;

    // Padrão para letras isoladas seguidas (máximo 3 espaços entre elas)
    textoCorrigido = textoCorrigido.replace(/\b([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\b/g, '$1$2$3$4');
    textoCorrigido = textoCorrigido.replace(/\b([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\b/g, '$1$2$3');
    textoCorrigido = textoCorrigido.replace(/\b([a-zA-ZÀ-ÿ])\s+([a-zA-ZÀ-ÿ])\b/g, '$1$2');

    return textoCorrigido;
};

export type OCRResult = {
    text: string;
    lines?: AzureReadLine[];
    confidence: number;
    engine: 'azure' | 'tesseract';
    isHandwritten: boolean;
};

async function carregarBufferDeImagem(imageUrl: string): Promise<Buffer> {
    if (imageUrl.startsWith('data:')) {
        const base64 = imageUrl.split(',')[1] || '';
        return Buffer.from(base64, 'base64');
    } else if (/^https?:\/\//.test(imageUrl)) {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error(`Falha ao baixar imagem: ${resp.statusText}`);
        return Buffer.from(await resp.arrayBuffer());
    } else {
        const fs = await import('fs/promises');
        return fs.readFile(imageUrl);
    }
}
const ocrCache = new Map<string, Promise<OCRResult>>();


export const extrairTextoDaImagem = async (imageUrl: string): Promise<OCRResult> => {
    const cacheKey = imageUrl.slice(0, 300);
    if (ocrCache.has(cacheKey)) {
        return ocrCache.get(cacheKey)!;
    }

    const ocrPromise: Promise<OCRResult> = (async () => {
        let originalBuffer: Buffer | null = null;
        try {
            // 1. Carregar a imagem original (necessário para o Tesseract ou para enviar como buffer)
            originalBuffer = await carregarBufferDeImagem(imageUrl);

            // TENTATIVA 1: Azure com a URL da imagem (se for uma URL)
            if (/^https?:\/\//.test(imageUrl)) {
                console.log("Tentando Azure com a URL da imagem original...");
                const azureResultUrl = await extractTextWithAzureRead(imageUrl); // Enviando a URL diretamente
                if (azureResultUrl && azureResultUrl.text.trim().split(/\s+/).length > 20) {
                    console.log(`SUCESSO COM AZURE (URL)! Encontrou ${azureResultUrl.text.trim().split(/\s+/).length} palavras.`);
                    return {
                        text: posProcessarTextoManuscrito(azureResultUrl.text),
                        lines: azureResultUrl.lines,
                        confidence: azureResultUrl.confidence,
                        engine: 'azure',
                        isHandwritten: true
                    };
                }
                const wordsFoundUrl = azureResultUrl ? azureResultUrl.text.trim().split(/\s+/).filter(p => p).length : 0;
                console.warn(`Azure (URL) não encontrou texto suficiente (encontrado: ${wordsFoundUrl} palavras).`);
            }

            // TENTATIVA 2: Azure com o BUFFER da imagem original (nosso método anterior)
            console.log("Tentando Azure com o BUFFER da imagem original...");
            const azureResultBuffer = await extractTextWithAzureRead(originalBuffer);

            if (azureResultBuffer && azureResultBuffer.text.trim().split(/\s+/).length > 20) {
                console.log(`SUCESSO COM AZURE (BUFFER)! Encontrou ${azureResultBuffer.text.trim().split(/\s+/).length} palavras.`);
                return {
                    text: posProcessarTextoManuscrito(azureResultBuffer.text),
                    lines: azureResultBuffer.lines,
                    confidence: azureResultBuffer.confidence,
                    engine: 'azure',
                    isHandwritten: true
                };
            }
            const wordsFoundBuffer = azureResultBuffer ? azureResultBuffer.text.trim().split(/\s+/).filter(p => p).length : 0;
            console.warn(`Azure (BUFFER) não encontrou texto suficiente (encontrado: ${wordsFoundBuffer} palavras). Ativando fallback com Tesseract...`);

            // FALLBACK COM TESSERACT (Otimização para Tesseract)
            console.log("Otimizando imagem para o fallback com Tesseract...");
            const processedBufferForTesseract = await sharp(originalBuffer)
                .grayscale()
                .normalize()
                .sharpen()
                .toBuffer();

            const { data } = await Tesseract.recognize(processedBufferForTesseract, 'por');

            if (!data.text || data.confidence < 40) {
                return { text: 'Não foi possível extrair texto legível da imagem.', confidence: data.confidence || 0, engine: 'tesseract', isHandwritten: false };
            }

            console.log(`Tesseract (fallback) encontrou ${data.text.trim().split(/\s+/).length} palavras.`);
            return {
                text: posProcessarTextoManuscrito(data.text),
                confidence: data.confidence,
                engine: 'tesseract',
                isHandwritten: true
            };

        } catch (error: any) {
            console.error('Erro crítico no serviço de OCR:', error);
            return { text: `Erro ao processar imagem: ${error.message}`, confidence: 0, engine: 'tesseract', isHandwritten: false };
        }
    })();

    ocrCache.set(cacheKey, ocrPromise);
    return ocrPromise;
};