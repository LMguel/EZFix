// googleVisionService.ts

import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs';

export interface GoogleVisionResult { text: string; confidence: number; }

// Configurar cliente com abordagem simples e estável
function createClient(): ImageAnnotatorClient {
    try {
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        
        if (credentialsPath && fs.existsSync(credentialsPath)) {
            // Usar keyFilename que é a forma mais estável
            return new ImageAnnotatorClient({
                keyFilename: credentialsPath
            });
        } else {
            console.warn("GOOGLE_APPLICATION_CREDENTIALS não configurado, usando autenticação padrão");
            return new ImageAnnotatorClient();
        }
    } catch (error) {
        console.warn("Erro ao configurar credenciais:", error);
        return new ImageAnnotatorClient();
    }
}

const client = createClient();

export async function extractTextWithGoogleVision(imageBuffer: Buffer): Promise<GoogleVisionResult | null> {
    try {
        console.log("Enviando imagem para a API Google Cloud Vision (Document Text)...");
        const [result] = await client.documentTextDetection({
            image: { content: imageBuffer },
            imageContext: { languageHints: ['pt'] }
        });
        const detection = result.fullTextAnnotation;

        if (!detection || !detection.text) {
            console.warn("Google Vision (Document Text) n�o detectou texto.");
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