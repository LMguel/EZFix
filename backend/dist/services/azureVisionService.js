"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextWithAzureRead = extractTextWithAzureRead;
const node_fetch_1 = __importDefault(require("node-fetch"));
const AZURE_ENDPOINT = (process.env.AZURE_CV_ENDPOINT || '').replace(/\/$/, '');
const AZURE_KEY = process.env.AZURE_CV_KEY || process.env.AZURE_COMPUTER_VISION_KEY || '';
if (!AZURE_ENDPOINT || !AZURE_KEY) {
    // not throwing here; functions will check and return null when not configured
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function extractTextWithAzureRead(imageUrlOrBuffer) {
    if (!AZURE_ENDPOINT || !AZURE_KEY)
        return null;
    try {
        const url = `${AZURE_ENDPOINT}/vision/v3.2/read/analyze?language=pt`;
        let resp;
        if (typeof imageUrlOrBuffer === 'string' && imageUrlOrBuffer.startsWith('http')) {
            // send JSON with url
            resp = await (0, node_fetch_1.default)(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: imageUrlOrBuffer })
            });
        }
        else if (typeof imageUrlOrBuffer === 'string' && imageUrlOrBuffer.startsWith('data:')) {
            // data URL -> buffer
            const base64 = (imageUrlOrBuffer.split(',')[1] || '');
            const buffer = Buffer.from(base64, 'base64');
            resp = await (0, node_fetch_1.default)(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/octet-stream'
                },
                body: buffer
            });
        }
        else if (Buffer.isBuffer(imageUrlOrBuffer)) {
            resp = await (0, node_fetch_1.default)(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/octet-stream'
                },
                body: imageUrlOrBuffer
            });
        }
        else {
            // assume local path
            // try to read file
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            const buffer = await fs.readFile(imageUrlOrBuffer);
            resp = await (0, node_fetch_1.default)(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/octet-stream'
                },
                body: buffer
            });
        }
        if (!resp.ok && resp.status !== 202) {
            const text = await resp.text().catch(() => '');
            console.warn('Azure Read API request failed:', resp.status, text.substring(0, 200));
            return null;
        }
        // Azure returns 202 with header 'operation-location' for async result
        const operationLocation = resp.headers.get('operation-location') || resp.headers.get('Operation-Location');
        if (!operationLocation) {
            console.warn('Azure Read API did not return operation-location');
            return null;
        }
        // Poll for result
        const maxAttempts = 30;
        let attempt = 0;
        let resultJson = null;
        while (attempt < maxAttempts) {
            await sleep(1000);
            const r = await (0, node_fetch_1.default)(operationLocation, {
                method: 'GET',
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY },
            });
            if (!r.ok) {
                attempt++;
                continue;
            }
            const body = await r.json();
            const rawStatus = (body.status ?? body.analyzeResult?.status ?? '').toString().toLowerCase();
            if (rawStatus === 'succeeded') {
                resultJson = body;
                break;
            }
            if (rawStatus === 'failed') {
                // opcional: log detalhado
                const err = body.error || body.analyzeResult?.errors || body;
                throw new Error(`Azure Read falhou: ${JSON.stringify(err)}`);
            }
            attempt++;
        }
        if (!resultJson) {
            throw new Error('Azure Read timeout (status n�o chegou a "succeeded").');
        }
        // parse possible shapes and extract lines with bounding boxes
        const readResults = resultJson.analyzeResult?.readResults || resultJson.readResults || resultJson.analyzeResult?.pageResults || [];
        const allLines = [];
        let pageWidth = 0, pageHeight = 0;
        if (Array.isArray(readResults)) {
            for (const page of readResults) {
                if (page.width)
                    pageWidth = page.width;
                if (page.height)
                    pageHeight = page.height;
                if (Array.isArray(page.lines)) {
                    for (const line of page.lines) {
                        const txt = line.text || line.words?.map((w) => w.text).join(' ') || '';
                        const bbox = line.boundingBox || line.boundingBoxes || undefined;
                        let conf = undefined;
                        if (typeof line.appearance?.style?.confidence === 'number')
                            conf = Math.round(line.appearance.style.confidence * 100);
                        else if (typeof line.confidence === 'number')
                            conf = Math.round(line.confidence * 100);
                        else if (Array.isArray(line.words) && line.words.length > 0 && typeof line.words[0].confidence === 'number') {
                            conf = Math.round(line.words.reduce((s, w) => s + (w.confidence || 0), 0) / line.words.length * 100);
                        }
                        allLines.push({ text: txt, boundingBox: bbox, confidence: conf });
                    }
                }
            }
        }
        // overall text
        const text = allLines.map(l => l.text).join('\n');
        const confidence = allLines.length ? Math.round(allLines.reduce((s, l) => s + (l.confidence || 80), 0) / allLines.length) : 80;
        return { text, confidence, lines: allLines, width: pageWidth, height: pageHeight };
    }
    catch (error) {
        console.warn('extractTextWithAzureRead error:', error);
        return null;
    }
}
exports.default = { extractTextWithAzureRead };
