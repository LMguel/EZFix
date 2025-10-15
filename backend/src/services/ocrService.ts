import sharp from 'sharp';
import googleVisionService from './googleVisionService';
import fetch from 'node-fetch';

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

const ocrCache = new Map<string, Promise<OCRResult>>();

// Interface para o resultado do OCR
export type OCRResult = {
    text: string;
    confidence: number;
    engine: 'google-vision';
    isHandwritten: boolean;
};

// Nova função de pós-processamento para filtrar texto e números de linha
const filtrarTextoOCR = (text: string, isHandwritten: boolean): string => {
    if (!isHandwritten) return text; // Se não for manuscrito, não filtra números de linha

    const linhas = text.split('\n');
    const linhasFiltradas: string[] = [];

    linhas.forEach(linha => {
        const trimmedLinha = linha.trim();
        // Remove números de linha no início da linha (até 3 dígitos)
        // e espaços/pontos/parenteses que os acompanham.
        const linhaSemNumero = trimmedLinha.replace(/^(\d{1,3}[\s.]*[\)\.]?\s*)/, '');

        // Heurística para tentar detectar se a linha é só um número isolado ou marcador
        // Ex: "1", "2.", "3)", "(4)"
        if (linhaSemNumero.length === 0 && trimmedLinha.match(/^\s*\d{1,3}[\s.]*[\)\.]?\s*$/)) {
            // Se a linha original era SÓ um número, ignoramos
            return;
        }

        // Outros filtros para caracteres indesejados comuns em OCR de manuscritos
        const textoLimpo = linhaSemNumero
            .replace(/[•●▪]/g, '') // Remove bullet points comuns
            .replace(/\s{2,}/g, ' ') // Substitui múltiplos espaços por um único
            .trim();

        if (textoLimpo.length > 0) {
            linhasFiltradas.push(textoLimpo);
        }
    });

    return linhasFiltradas.join('\n');
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

export const extrairTextoDaImagem = async (imageUrl: string): Promise<OCRResult> => {
    const cacheKey = imageUrl.slice(0, 300); // Usar parte da URL como chave de cache
    if (ocrCache.has(cacheKey)) {
        return ocrCache.get(cacheKey)!;
    }

    const ocrPromise: Promise<OCRResult> = (async () => {
        try {
            const originalBuffer = await carregarBufferDeImagem(imageUrl);

            console.log("Aplicando pré-processamento avançado...");
            // Pré-processamento mais agressivo para manuscritos
            const processedBuffer = await sharp(originalBuffer)
                .grayscale() // Converte para tons de cinza
                .normalize() // Normaliza o contraste
                .removeAlpha() // Remove canal alfa se houver (útil para fundos transparentes)
                .sharpen() // Aumenta a nitidez
                .toBuffer();
            console.log("Imagem otimizada.");

            const googleResult = await googleVisionService.extractTextWithGoogleVision(processedBuffer);

            if (!googleResult || !googleResult.text) {
                return { text: 'Google Vision não conseguiu extrair texto.', confidence: 0, engine: 'google-vision', isHandwritten: true };
            }

            // Aplica o novo filtro de texto após a extração
            const filteredText = filtrarTextoOCR(googleResult.text, true); // Assumindo que essa rota é para manuscrito

            // Heurística simples para verificar se realmente parece manuscrito
            const wordCount = filteredText.split(/\s+/).filter(p => p.length > 1).length;
            const isActuallyHandwritten = wordCount > 20; // Mais de 20 palavras filtradas, considera manuscrito

            return {
                text: filteredText,
                confidence: googleResult.confidence,
                engine: 'google-vision',
                isHandwritten: isActuallyHandwritten
            };

        } catch (error: any) {
            console.error('Erro crítico no serviço de OCR:', error);
            // Retorna um resultado de erro, mas mantém a estrutura de OCRResult
            return { text: `Erro ao processar imagem para OCR: ${error.message}`, confidence: 0, engine: 'google-vision', isHandwritten: false };
        }
    })();

    ocrCache.set(cacheKey, ocrPromise); // Cacheia a promessa
    return ocrPromise;
};