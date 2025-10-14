// teste-conexao.js
const fetch = require('node-fetch');

// --- CONFIGURE ESTAS 4 VARIÁVEIS ---
const AZURE_ENDPOINT = "https://ezfixopenai.openai.azure.com/";
const AZURE_KEY = "<COLE_SUA_CHAVE_DO_AZURE_OPENAI_AQUI>"; // IMPORTANTE: PREENCHA ISTO
const AZURE_DEPLOYMENT = "gpt-5-mini";
const AZURE_API_VERSION = "2024-02-01";
// ------------------------------------

const url = `${AZURE_ENDPOINT.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(AZURE_DEPLOYMENT)}/chat/completions?api-version=${AZURE_API_VERSION}`;

const body = {
    messages: [{ role: "user", content: "Olá, isto é um teste. Responda com 'OK'." }],
    max_tokens: 10,
};

async function runTest() {
    console.log("Iniciando teste de conexão direta com Azure OpenAI...");
    console.log("URL:", url);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_KEY,
            },
            body: JSON.stringify(body),
            // Vamos adicionar um timeout curto para ver se a conexão trava
            timeout: 15000 // 15 segundos
        });

        console.log("\n--- SUCESSO! ---");
        console.log("A conexão foi bem-sucedida.");
        console.log("Status da Resposta:", response.status, response.statusText);
        const jsonResponse = await response.json();
        console.log("Resposta da API:", JSON.stringify(jsonResponse, null, 2));

    } catch (error) {
        console.error("\n--- FALHA! ---");
        console.error("A conexão falhou como esperado. O problema é de rede.");
        console.error("Detalhes do Erro:", error);
    }
}

runTest();