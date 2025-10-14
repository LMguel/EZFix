import axios from 'axios';
import fs from 'fs/promises';

const AZURE_ENDPOINT = (process.env.AZURE_CV_ENDPOINT || '').replace(/\/$/, '');
const AZURE_KEY = process.env.AZURE_CV_KEY || '';

// --- Interfaces para a Resposta da API v4.0 ---
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function extractTextWithAzureRead(imageUrlOrBuffer: string | Buffer): Promise<AzureReadResult | null> {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
        console.warn('Azure Vision (Computer Vision) não configurado.');
        return null;
    }
    try {
        const url = `${AZURE_ENDPOINT}/vision/v3.2/read/analyze?language=pt`;
        let body: any;
        const headers: any = { 'Ocp-Apim-Subscription-Key': AZURE_KEY };

        if (typeof imageUrlOrBuffer === 'string' && imageUrlOrBuffer.startsWith('http')) {
            // Se for uma URL, enviar como JSON
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({ url: imageUrlOrBuffer });
        } else if (Buffer.isBuffer(imageUrlOrBuffer)) {
            // Se for um Buffer, enviar como octet-stream
            headers['Content-Type'] = 'application/octet-stream';
            body = imageUrlOrBuffer;
        } else {
            throw new Error("Tipo de entrada inválido para Azure Vision. Esperava URL ou Buffer.");
        }

        const initialResponse = await axios.post(url, body, { headers });

        if (initialResponse.status !== 202) throw new Error(`API Azure Read (initial): Status ${initialResponse.status} - ${JSON.stringify(initialResponse.data)}`);

        const operationLocation = initialResponse.headers['operation-location'];
        if (!operationLocation) throw new Error('API Azure Read não retornou operation-location.');

        let result: any = null;
        for (let i = 0; i < 20; i++) {
            await sleep(1000);
            const resultResponse = await axios.get(operationLocation, { headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY } });
            if (resultResponse.data.status === 'succeeded') {
                result = resultResponse.data;
                break;
            }
            if (resultResponse.data.status === 'failed') throw new Error(`Processamento no Azure falhou: ${JSON.stringify(resultResponse.data)}`);
        }

        if (!result || !result.analyzeResult) throw new Error('Processamento no Azure excedeu o tempo limite.');

        const readResults = result.analyzeResult.readResults;
        const allLines: AzureReadLine[] = [];
        for (const page of readResults) {
            for (const line of page.lines) {
                const style = line.appearance?.style;
                const avgConfidence = line.words.reduce((acc: number, w: any) => acc + w.confidence, 0) / (line.words.length || 1);
                allLines.push({ content: line.text, polygon: line.boundingBox, confidence: avgConfidence, style: style ? { name: style.name, confidence: style.confidence } : undefined });
            }
        }

        const handwrittenLines = allLines.filter(l => l.style?.name === 'handwritten');
        const text = handwrittenLines.map(l => l.content).join('\n');
        const confidence = handwrittenLines.length > 0 ? Math.round((handwrittenLines.reduce((s, l) => s + l.confidence, 0) / handwrittenLines.length) * 100) : 0;

        return { text, confidence, lines: handwrittenLines, isHandwrittenOnly: handwrittenLines.length > 0 && handwrittenLines.length === allLines.length };
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            console.error(`Erro na API de Visão: Status ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
        } else {
            console.error('Erro em extractTextWithAzureRead:', error.message);
        }
        return null;
    }
}