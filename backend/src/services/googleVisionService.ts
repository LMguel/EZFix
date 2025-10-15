// googleVisionService.ts

import { ImageAnnotatorClient } from '@google-cloud/vision';

export interface GoogleVisionResult { text: string; confidence: number; }
const client = new ImageAnnotatorClient();

export async function extractTextWithGoogleVision(imageBuffer: Buffer): Promise<GoogleVisionResult | null> {
    try {
        console.log("Enviando imagem para a API Google Cloud Vision (Document Text)...");
        const [result] = await client.documentTextDetection({
            image: { content: imageBuffer },
            imageContext: { languageHints: ['pt'] }
        });
        const detection = result.fullTextAnnotation;

        if (!detection || !detection.text) {
            console.warn("Google Vision (Document Text) não detectou texto.");
            return { text: '', confidence: 0 };
        }
        const avgConfidence = result.fullTextAnnotation?.pages?.[0]?.confidence || 0.95;
        console.log(`SUCESSO! Google Vision encontrou ${detection.text.trim().split(/\s+/).length} palavras.`);
        return {
            text: detection.text,
            confidence: Math.round(avgConfidence * 100),
        };
    } catch (error: any) {
        console.error("Erro na API Google Cloud Vision:", error.message);
        return null;
    }
}

export default { extractTextWithGoogleVision };