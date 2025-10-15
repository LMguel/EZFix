import axios from 'axios';

const AZURE_ENDPOINT = (process.env.AZURE_CV_ENDPOINT || '').replace(/\/$/, '');
const AZURE_KEY = process.env.AZURE_CV_KEY || '';

export interface AzureReadLine {
    content: string;
    polygon?: number[];
    confidence: number;
    style?: { name: 'handwritten' | 'printed'; confidence: number; };
}
export interface AzureReadResult {
    text: string;
    confidence: number;
    lines: AzureReadLine[];
    isHandwrittenOnly: boolean;
}

export async function extractTextWithAzureRead(imageBuffer: Buffer): Promise<AzureReadResult | null> {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
        console.warn('Azure Vision v4.0 (Serviços de IA) não configurado.');
        return null;
    }

    try {
        const url = `${AZURE_ENDPOINT}/computervision/imageanalysis:analyze?api-version=2024-05-01&features=read&model-version=latest&language=pt`;

        console.log("\n++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
        console.log(" TENTANDO CHAMAR A API DE VISÃO v4.0");
        console.log("Verifique se o Endpoint abaixo é o do seu NOVO recurso:");
        console.log("--> Endpoint em uso:", AZURE_ENDPOINT);
        console.log("--> URL Final Gerada:", url);
        console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++\n");

        const headers = {
            'Content-Type': 'application/octet-stream',
            'Ocp-Apim-Subscription-Key': AZURE_KEY
        };

        const response = await axios.post(url, imageBuffer, { headers });

        const readResult = response.data?.readResult;
        if (!readResult || !readResult.blocks || readResult.blocks.length === 0) {
            return { text: '', confidence: 0, lines: [], isHandwrittenOnly: false };
        }

        const allLines: AzureReadLine[] = [];
        for (const block of readResult.blocks) {
            for (const line of block.lines) {
                const firstWordStyle = line.words[0]?.style;
                const lineConfidence = line.words.reduce((acc: number, w: any) => acc + w.confidence, 0) / (line.words.length || 1);
                allLines.push({
                    content: line.text,
                    polygon: line.boundingPolygon?.map((p: any) => [p.x, p.y]).flat(),
                    confidence: lineConfidence,
                    style: firstWordStyle
                });
            }
        }

        const handwrittenLines = allLines.filter(l => l.style?.name === 'handwritten');
        const text = handwrittenLines.map(l => l.content).join('\n');
        const confidence = handwrittenLines.length > 0
            ? Math.round((handwrittenLines.reduce((sum, line) => sum + line.confidence, 0) / handwrittenLines.length) * 100)
            : 0;

        console.log("SUCESSO! Azure Read v4.0 processou a imagem pré-processada.");
        return { text, confidence, lines: handwrittenLines, isHandwrittenOnly: handwrittenLines.length > 0 && handwrittenLines.length === allLines.length };

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const data = error.response?.data;
            console.error(`Erro na comunicação com a API de Visão v4.0: Status ${status} - ${JSON.stringify(data)}`);
        } else {
            console.error('Erro detalhado em extractTextWithAzureRead (v4.0):', error.message);
        }
        return null;
    }
}