"""
Teste do Azure OpenAI usando a biblioteca `openai` (compatível com Python 3.10).

Como usar (PowerShell):
1) Exporte variáveis de ambiente:
   $env:AZURE_OPENAI_ENDPOINT = "https://SEU_RECURSO.openai.azure.com"
   $env:AZURE_OPENAI_KEY = "SUA_CHAVE_AQUI"
   $env:AZURE_OPENAI_DEPLOYMENT = "NOME_DO_DEPLOYMENT"

2) Execute com o venv Python 3.10 criado (`.venv_py310`):
   C:/Users/jjmca/EZFix/.venv_py310/Scripts/python.exe azure_openai_test_openai.py

O script pede uma chamada simples (chat completions) e imprime o texto retornado.
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

# Carrega .env do backend automaticamente (se existir).
# Tentamos várias codificações para evitar UnicodeDecodeError em arquivos salvos com UTF-16/BOM.
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    tried = []
    for enc in (None, 'utf-8', 'utf-8-sig', 'utf-16', 'latin-1'):
        try:
            # load_dotenv aceita parametro encoding (None = default utf-8)
            if enc:
                load_dotenv(dotenv_path=env_path, encoding=enc)
            else:
                load_dotenv(dotenv_path=env_path)
            # sucesso
            break
        except UnicodeDecodeError as e:
            tried.append(enc or 'default')
            # tentar próxima codificação
            continue
    else:
        print(f"Aviso: não foi possível ler {env_path} nas codificações testadas: {tried}")


def main():
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    key = os.environ.get("AZURE_OPENAI_KEY")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT")

    if not endpoint or not key or not deployment:
        print("Defina AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY e AZURE_OPENAI_DEPLOYMENT no ambiente antes de executar.")
        return

    # Normaliza endpoint: se veio com path (/openai/...), extrai apenas a origem
    if endpoint:
        endpoint = endpoint.rstrip('/')
        try:
            from urllib.parse import urlparse
            p = urlparse(endpoint)
            if p.path and '/openai' in p.path:
                endpoint_origin = f"{p.scheme}://{p.netloc}"
            else:
                endpoint_origin = endpoint
        except Exception:
            endpoint_origin = endpoint

    # Configuração para Azure: criar cliente OpenAI com atributos da API nova
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2023-05-15")
    # garantir variável esperada pelo SDK
    os.environ.setdefault('OPENAI_API_KEY', key)
    os.environ.setdefault('OPENAI_API_BASE', endpoint_origin)
    os.environ.setdefault('OPENAI_API_TYPE', 'azure')
    os.environ.setdefault('OPENAI_API_VERSION', api_version)

    client = OpenAI()
    # Para segurança definimos também atributos se suportados
    try:
        client.api_key = key
        client.api_base = endpoint_origin
        client.api_type = "azure"
        client.api_version = api_version
    except Exception:
        pass

    prompt = "Teste Azure OpenAI via openai-python: responda em português com 'Olá do Azure'"

    try:
        resp = client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.2,
        )

        # Extrair texto da resposta (compatível com novas e antigas estruturas)
        choices = getattr(resp, 'choices', None) or resp.get('choices') if isinstance(resp, dict) else None
        if choices:
            print("Resposta do modelo:\n")
            for ch in choices:
                # novo SDK: ch.message.content
                content = None
                if hasattr(ch, 'message') and getattr(ch.message, 'get', None):
                    content = ch.message.get('content')
                elif isinstance(ch, dict):
                    content = ch.get('message', {}) and ch['message'].get('content')
                elif hasattr(ch, 'message') and hasattr(ch.message, 'content'):
                    content = ch.message.content

                print(content)
        else:
            # fallback: imprimir repr
            print("Resposta (raw):", resp)

    except Exception as e:
        print("Erro ao chamar OpenAI (Azure):\n", e)


if __name__ == '__main__':
    main()
