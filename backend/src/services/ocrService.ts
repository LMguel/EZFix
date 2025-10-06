import Tesseract from "tesseract.js";

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
export const extrairTextoDaImagem = async (imageUrl: string): Promise<string> => {
    try {
        console.log("Iniciando OCR otimizado para manuscrito:", imageUrl.substring(0, 100) + "...");
        
        let melhorTexto = "";
        let melhorConfianca = 0;
        
        // Configurações diferentes para testar
        const configuracoes = [
            {
                name: "Bloco uniforme - Manuscrito",
                options: {
                    logger: (m: any) => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR progresso: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            },
            {
                name: "Segmentação automática",
                options: {
                    logger: () => {} // Silencioso para tentativas seguintes
                }
            }
        ];
        
        for (let i = 0; i < configuracoes.length; i++) {
            const config = configuracoes[i];
            
            try {
                console.log(`Tentativa ${i + 1}: ${config.name}`);
                
                const resultado = await Tesseract.recognize(imageUrl, "por", config.options);
                
                const confianca = resultado.data.confidence;
                console.log(`Confiança ${config.name}: ${confianca.toFixed(1)}%`);
                
                if (confianca > melhorConfianca) {
                    melhorConfianca = confianca;
                    melhorTexto = resultado.data.text;
                    console.log(`Nova melhor confiança: ${melhorConfianca.toFixed(1)}%`);
                }
                
                // Se conseguiu alta confiança, pode parar
                if (confianca > 75) {
                    console.log("Confiança satisfatória alcançada");
                    break;
                }
                
            } catch (configError) {
                console.log(`Erro na configuração ${config.name}:`, configError);
                continue;
            }
        }
        
        if (!melhorTexto || melhorTexto.trim().length === 0) {
            console.log("Nenhum texto foi extraído com sucesso");
            return "Não foi possível extrair texto legível da imagem.";
        }
        
        console.log(`OCR concluído. Melhor confiança: ${melhorConfianca.toFixed(1)}%`);
        
        // Pós-processar o texto especificamente para manuscrito
        const textoLimpo = posProcessarTextoManuscrito(melhorTexto);
        
        const palavrasDetectadas = textoLimpo.split(/\s+/).filter(p => p.length > 0).length;
        
        console.log("Texto limpo extraído:", textoLimpo.substring(0, 200) + "...");
        console.log(`Palavras detectadas: ${palavrasDetectadas}`);
        
        // Se ainda tem muito pouco texto, pode ser que a imagem seja de baixa qualidade
        if (palavrasDetectadas < 5) {
            console.log("Pouco texto detectado - possível problema de qualidade da imagem");
            return textoLimpo + "\n\n[Nota: Pouco texto foi detectado. Para melhor resultado, tente uma imagem com maior resolução e contraste.]";
        }
        
        return textoLimpo;
        
    } catch (error) {
        console.error("Erro detalhado no OCR:", error);
        
        // Se for erro de rede
        if (error instanceof Error && error.message.includes('fetch failed')) {
            console.log("Erro de rede detectado");
            return "Erro de conectividade - OCR não pôde processar a imagem externa.";
        }
        
        // Se for data URL inválido
        if (imageUrl.startsWith('data:') && !imageUrl.includes('base64')) {
            throw new Error("Formato de data URL inválido");
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
