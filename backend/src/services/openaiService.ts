import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY || '';
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureKey = process.env.AZURE_OPENAI_KEY || '';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-11-22';

if (!apiKey && !(azureEndpoint && azureKey && azureDeployment)) {
  console.warn('Nenhuma chave OpenAI detectada. Configure OPENAI_API_KEY ou as variáveis AZURE_OPENAI_* para habilitar chamadas ao LLM.');
}

// Cliente para OpenAI pública (quando usado)
const client = apiKey ? new OpenAI({ apiKey }) : null;

export async function chamarLLM(prompt: string, maxTokens = 1000) {
  // Se houver configuração Azure, usar o endpoint de Azure OpenAI (REST)
  if (azureEndpoint && azureKey && azureDeployment) {
    // Normaliza: se o endpoint configurado já tiver path (/openai/...), extrai só a origem
    let endpointOrigin = azureEndpoint.replace(/\/+$/,'');
    try {
      const u = new URL(endpointOrigin);
      // se o path contém '/openai', usamos apenas a origem (protocol + host)
      if (u.pathname && u.pathname.includes('/openai')) {
        endpointOrigin = `${u.protocol}//${u.host}`;
      }
    } catch (e) {
      // se não for uma URL válida, usar como veio
    }

    const responsesUrl = `${endpointOrigin}/openai/deployments/${encodeURIComponent(azureDeployment)}/responses?api-version=${azureApiVersion}`;
    const chatUrl = `${endpointOrigin}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${azureApiVersion}`;

    const responsesBody = {
      input: prompt,
      max_output_tokens: maxTokens,
      temperature: 0.0,
    } as any;

    // 1) Tentar a rota Responses
    try {
      const res = await fetch(responsesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureKey,
        },
        body: JSON.stringify(responsesBody),
      });

      if (res.ok) {
        const json: any = await res.json();
        if (json && typeof json === 'object') {
          if (json.output_text && typeof json.output_text === 'string') return json.output_text;
          if (json.output) return typeof json.output === 'string' ? json.output : JSON.stringify(json.output, null, 2);
          if (json.choices && Array.isArray(json.choices) && json.choices.length > 0) {
            const c = json.choices[0];
            if (c.message && c.message.content) return c.message.content;
            if (c.output && c.output[0] && c.output[0].content) return c.output[0].content;
          }
        }
        return JSON.stringify(json, null, 2);
      } else {
        // Se não for 404, reportar erro; caso 404, tentaremos chat completions
        if (res.status !== 404) {
          const text = await res.text();
          throw new Error(`Erro Azure Responses: ${res.status} ${text}`);
        }
      }
    } catch (err) {
      if (err instanceof Error && String(err).includes('Erro Azure Responses')) throw err;
      // senão, continua para tentar chat
    }

    // 2) Tentar chat completions
    const chatBody = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.0,
    } as any;

    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureKey,
      },
      body: JSON.stringify(chatBody),
    });

    if (!chatRes.ok) {
      const text = await chatRes.text();
      throw new Error(`Erro Azure Chat Completions: ${chatRes.status} ${text}`);
    }

    const chatJson: any = await chatRes.json();
    if (chatJson && typeof chatJson === 'object') {
      if (chatJson.choices && Array.isArray(chatJson.choices) && chatJson.choices.length > 0) {
        const first = chatJson.choices[0];
        if (first.message && first.message.content) return first.message.content;
        if (first.text) return first.text;
      }
      if (chatJson.output_text && typeof chatJson.output_text === 'string') return chatJson.output_text;
    }

    return JSON.stringify(chatJson, null, 2);
  }

  // Caso contrário, usar OpenAI público via SDK
  if (!client) throw new Error('OPENAI_API_KEY não configurada e Azure não configurado');

  const response: any = await client.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0.0,
  } as any);

  if (response.output_text && typeof response.output_text === 'string') return response.output_text;
  try {
    return JSON.stringify(response.output || response, null, 2);
  } catch (err) {
    return String(response);
  }
}
