import Tesseract from "tesseract.js";
import sharp from 'sharp';
import { extractTextWithAzureRead } from './azureVisionService';

/**
 * Pós-processa o texto para corrigir problemas comuns do OCR em texto manuscrito
 */
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

/**
 * Extrai texto de uma imagem usando Tesseract.js otimizado para manuscrito
 * @param imageUrl URL da imagem, data URL (base64) ou caminho local
 */
export type OCRResult = {
    text: string;
    lines?: Array<{ text: string; left?: number; top?: number; confidence?: number; boundingBox?: number[] }>;
    confidence?: number;
    engine?: 'azure' | 'tesseract' | 'mixed';
};

export const extrairTextoDaImagem = async (imageUrl: string): Promise<OCRResult> => {
    try {
        console.log("Iniciando OCR otimizado (tentar Azure Read -> fallback local) para:", imageUrl.substring(0, 100) + "...");

        // Primeiro, tentar Azure Read se estiver configurado
        try {
            const azureResult = await extractTextWithAzureRead(imageUrl.startsWith('data:') || imageUrl.startsWith('http') ? imageUrl : imageUrl);
            if (azureResult && azureResult.text && azureResult.text.trim().length > 0) {
                console.log('Azure Read retornou texto (confiança aprox):', azureResult.confidence);
                const textoAzureProcessado = posProcessarTextoManuscrito(azureResult.text);
                if (textoAzureProcessado.split(/\s+/).filter(p=>p.length>0).length >= 5) {
                    return { text: textoAzureProcessado, lines: azureResult.lines, confidence: azureResult.confidence || 80, engine: 'azure' };
                }
            }
        } catch (azErr) {
            console.warn('Azure Read falhou, prosseguindo com OCR local:', azErr);
        }

        // Carregar buffer a partir de data URL, URL externa ou caminho local
        let buffer: Buffer;
        if (imageUrl.startsWith('data:')) {
            const base64 = imageUrl.split(',')[1] || '';
            buffer = Buffer.from(base64, 'base64');
        } else if (/^https?:\/\//.test(imageUrl)) {
            // usar fetch dinâmico (node-fetch) para baixar
            const fetch = (await import('node-fetch')).default;
            const resp = await fetch(imageUrl);
            if (!resp.ok) throw new Error('Falha ao baixar imagem externa');
            const arrayBuf = await resp.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
        } else {
            const fs = await import('fs/promises');
            buffer = await fs.readFile(imageUrl);
        }

        // Pré-processamento: grayscale, normalizar, aumentar contraste e reduzir ruído
        let img = sharp(buffer).grayscale().normalize().sharpen();
        const meta = await img.metadata();

        // limitar dimensão máxima para performance
        const MAX_DIM = 3000;
        if ((meta.width && meta.width > MAX_DIM) || (meta.height && meta.height > MAX_DIM)) {
            img = img.resize({ width: meta.width && meta.width > MAX_DIM ? MAX_DIM : undefined, height: meta.height && meta.height > MAX_DIM ? MAX_DIM : undefined, fit: 'inside' });
        }

        const processed = await img.toBuffer();
        const postMeta = await sharp(processed).metadata();

        // Se imagem muito grande (area), dividir em tiles para melhorar reconhecimento
        const area = (postMeta.width || 0) * (postMeta.height || 0);
        const tiles: Buffer[] = [];
        // escolher grid dinamicamente: imagens muito grandes usem até 3x3
        let cols = 1, rows = 1;
        if (area > 2500 * 2500) { cols = 3; rows = 3; }
        else if (area > 1600 * 1600) { cols = 2; rows = 2; }

        if (cols > 1 || rows > 1) {
            const tileW = Math.floor((postMeta.width || 0) / cols);
            const tileH = Math.floor((postMeta.height || 0) / rows);
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const left = x * tileW;
                    const top = y * tileH;
                    const w = (x === cols - 1) ? (postMeta.width || 0) - left : tileW;
                    const h = (y === rows - 1) ? (postMeta.height || 0) - top : tileH;
                    const tile = await sharp(processed).extract({ left, top, width: w, height: h }).toBuffer();
                    // guardar também a posição do tile (para mapear bounding boxes)
                    (tile as any).meta = { left, top, width: w, height: h };
                    tiles.push(tile);
                }
            }
        } else {
            tiles.push(processed);
        }

        // Executar OCR em cada tile: tentar Azure Read por tile (paralelo) e, se falhar/baixa confiança, usar Tesseract local
        let combinedText = '';
        let confidences: { confidence: number; length: number }[] = [];

        const processTile = async (tbuf: Buffer & { meta?: any }, index: number) => {
            console.log(`Processando tile ${index + 1}/${tiles.length} (bytes ${tbuf.length})`);
            // 1) tentar Azure Read para o tile
            try {
                const az = await extractTextWithAzureRead(tbuf);
                if (az && az.lines && az.lines.length > 0) {
                    // mapear linhas do tile para coordenadas globais
                    const tileMeta = (tbuf as any).meta || { left: 0, top: 0 };
                    const mappedLines = az.lines.map(l => {
                        // Azure boundingBox pode ser [x1,y1,x2,y2,...] forma plana; para simplicidade usaremos o primeiro par como left/top
                        let bbox = l.boundingBox as any;
                        let left = tileMeta.left, top = tileMeta.top;
                        if (Array.isArray(bbox) && bbox.length >= 2) {
                            left = tileMeta.left + bbox[0];
                            top = tileMeta.top + bbox[1];
                        }
                        return { text: posProcessarTextoManuscrito(l.text || ''), confidence: l.confidence || 80, left, top };
                    });
                    return { tileLines: mappedLines, confidence: az.confidence || 80, source: 'azure' } as any;
                }
            } catch (e) {
                console.warn(`Azure tile ${index + 1} falhou:`, e);
            }

            // 2) fallback para Tesseract local
            try {
                const res = await Tesseract.recognize(tbuf, 'por', {
                    logger: (m: any) => {
                        if (m.status === 'recognizing text') console.log(`Tile ${index + 1} progresso: ${Math.round(m.progress * 100)}%`);
                    }
                });
                const txt = res.data.text || '';
                const cleaned = posProcessarTextoManuscrito(txt);
                const conf = res.data.confidence || 0;
                // Tesseract normalmente não retorna bounding boxes por linha neste wrapper; vamos retornar o texto com tile meta
                console.log(`Tesseract tile ${index + 1} produzido (conf ${conf}) palavras=${cleaned.split(/\s+/).filter(p=>p.length>0).length}`);
                return { text: cleaned, confidence: conf, source: 'tesseract', tileMeta: (tbuf as any).meta } as any;
            } catch (e) {
                console.warn('Erro OCR tile (tesseract):', e);
                return { text: '', confidence: 0, source: 'error' };
            }
        };

        // Processar tiles em paralelo com limite de concorrência para não sobrecarregar Azure
        const concurrency = Math.min(4, tiles.length);
        const results: Array<{ text: string; confidence: number; source: string }> = [];

        const pool: Promise<void>[] = [];
        let idx = 0;
        const runNext = async () => {
            const i = idx++;
            if (i >= tiles.length) return;
            const r = await processTile(tiles[i], i);
            results[i] = r as any;
            await runNext();
        };

        for (let i = 0; i < concurrency; i++) {
            pool.push(runNext());
        }
        await Promise.all(pool);

        // Combinar resultados
        // Se alguns resultados vierem com tileLines (Azure), coletar todas as linhas e ordenar por posição
        let allMappedLines: Array<{ text: string; left: number; top: number; confidence: number }> = [];
        for (let i = 0; i < results.length; i++) {
            const r = results[i] as any;
            if (!r) continue;
            if (r.tileLines && Array.isArray(r.tileLines)) {
                for (const L of r.tileLines) {
                    allMappedLines.push({ text: L.text || '', left: L.left || 0, top: L.top || 0, confidence: L.confidence || 0 });
                }
            } else if (r.text) {
                // dividir texto por linhas e estimar posição a partir do tileMeta center
                const tileMeta = r.tileMeta || (tiles[i] as any).meta || { left: 0, top: 0, width: 0, height: 0 };
                const lines = (r.text || '').split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                let y = tileMeta.top || 0;
                for (const ln of lines) {
                    allMappedLines.push({ text: ln, left: tileMeta.left || 0, top: y, confidence: r.confidence || 0 });
                    y += 12; // aproximar avanço vertical
                }
            }
        }

        // ordenar por top (y) e left (x)
        allMappedLines.sort((a,b) => {
            if (Math.abs(a.top - b.top) > 10) return a.top - b.top;
            return a.left - b.left;
        });

        // construir texto final a partir das linhas ordenadas
        combinedText = allMappedLines.map(l => l.text).join('\n');
        for (const l of allMappedLines) confidences.push({ confidence: l.confidence || 0, length: l.text.length });

        // calcular confiança média ponderada pelo tamanho do texto
        let totalLen = confidences.reduce((s, c) => s + c.length, 0);
        let weightedConfidence = 0;
        if (totalLen > 0) {
            weightedConfidence = Math.round(confidences.reduce((s, c) => s + (c.confidence * c.length), 0) / totalLen);
        } else {
            weightedConfidence = confidences.length ? Math.round(confidences.reduce((s, c) => s + c.confidence, 0) / confidences.length) : 0;
        }

        if (!combinedText || combinedText.trim().length === 0) {
            console.log('Nenhum texto extraído após OCR por tiles');
            return { text: 'Não foi possível extrair texto legível da imagem.', lines: allMappedLines, confidence: weightedConfidence, engine: 'mixed' } as OCRResult;
        }

    console.log(`OCR concluído. Confiança média ponderada: ${weightedConfidence}%`);
        const textoLimpo = posProcessarTextoManuscrito(combinedText);
        const palavrasDetectadas = textoLimpo.split(/\s+/).filter(p => p.length > 0).length;
        console.log('Texto limpo extraído:', textoLimpo.substring(0, 200) + '...');
        console.log(`Palavras detectadas: ${palavrasDetectadas}`);

        if (palavrasDetectadas < 5) {
            return { text: textoLimpo + '\n\n[Nota: Pouco texto foi detectado. Para melhor resultado, tente uma imagem com maior resolução e contraste.]', lines: allMappedLines, confidence: weightedConfidence, engine: 'mixed' } as OCRResult;
        }

        return { text: textoLimpo, lines: allMappedLines, confidence: weightedConfidence, engine: 'mixed' } as OCRResult;
    } catch (error) {
        console.error('Erro detalhado no OCR:', error);
        if (error instanceof Error && error.message.includes('fetch failed')) {
            throw new Error('Erro de conectividade - OCR não pôde processar a imagem externa.');
        }
        if (imageUrl.startsWith('data:') && !imageUrl.includes('base64')) {
            throw new Error('Formato de data URL inválido');
        }
        throw new Error(`Falha ao processar OCR: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};

/**
 * Gera uma nota autom�tica simples baseada no texto
 * (placeholder para IA mais avan�ada no futuro)
 */
export const gerarNotaAutomatica = (texto: string): number => {
    if (!texto || texto.trim().length === 0) return 0;

    // Exemplo simples: pontuar pelo n�mero de palavras
    const palavras = texto.trim().split(/\s+/).length;

    if (palavras < 50) return 2.0;   // reda��o muito curta
    if (palavras < 150) return 5.0;  // tamanho m�dio
    if (palavras < 300) return 7.0;  // bom
    return 9.0;                      // muito bom
};
