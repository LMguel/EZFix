#!/usr/bin/env python3
"""
Script de teste para verificar o fluxo completo:
OCR (Azure Vision) → Correções (GPT) → Análise ENEM

Testa a API REST do backend usando a imagem teste.png
"""

import os
import sys
import json
import base64
import requests
import time
from pathlib import Path

# Configurações
BACKEND_URL = "http://localhost:3000"
IMAGE_PATH = "image/teste.png"

def print_header(title):
    """Imprime cabeçalho formatado"""
    print("\n" + "=" * 80)
    print(f"🔬 {title}")
    print("=" * 80)

def print_section(title):
    """Imprime seção formatada"""
    print(f"\n📋 {title}")
    print("-" * 60)

def load_test_image():
    """Carrega a imagem de teste e converte para base64"""
    image_path = Path(IMAGE_PATH)
    
    if not image_path.exists():
        raise FileNotFoundError(f"Imagem não encontrada: {image_path.absolute()}")
    
    print(f"📷 Carregando imagem: {image_path.absolute()}")
    print(f"📏 Tamanho do arquivo: {image_path.stat().st_size / 1024:.2f} KB")
    
    with open(image_path, 'rb') as f:
        image_data = f.read()
    
    # Criar data URL
    base64_data = base64.b64encode(image_data).decode('utf-8')
    data_url = f"data:image/png;base64,{base64_data}"
    
    return data_url, len(base64_data)

def authenticate():
    """Faz login ou registro para obter token de autenticação"""
    print_section("AUTENTICAÇÃO: Fazendo login no sistema")
    
    # Dados de teste
    user_data = {
        "nome": "Teste OCR",
        "email": "teste@ocr.com",
        "senha": "teste123"
    }
    
    # Tentar fazer login primeiro
    try:
        print("🔄 Tentando fazer login...")
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": user_data["email"], "senha": user_data["senha"]},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            print("✅ Login realizado com sucesso")
            return token
        elif response.status_code == 401:
            print("⚠️ Usuário não existe, tentando registrar...")
        else:
            print(f"⚠️ Erro no login: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro na requisição de login: {e}")
    
    # Se login falhou, tentar registrar
    try:
        print("🔄 Tentando registrar usuário...")
        response = requests.post(
            f"{BACKEND_URL}/auth/register",
            json=user_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 201:
            data = response.json()
            token = data.get('token')
            print("✅ Usuário registrado com sucesso")
            return token
        elif response.status_code == 200:
            # Alguns serviços retornam 200 em vez de 201
            data = response.json()
            token = data.get('token')
            if token:
                print("✅ Usuário registrado com sucesso")
                return token
            else:
                print("⚠️ Registro bem-sucedido mas sem token. Tentando login...")
                # Tentar fazer login após registro
                login_response = requests.post(
                    f"{BACKEND_URL}/auth/login",
                    json={"email": user_data["email"], "senha": user_data["senha"]},
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                if login_response.status_code == 200:
                    login_data = login_response.json()
                    return login_data.get('token')
                return None
        else:
            print(f"❌ Erro no registro: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro na requisição de registro: {e}")
        return None

def test_backend_health():
    """Testa se o backend está rodando"""
    try:
        # Primeiro teste mais simples
        print("🔄 Testando conectividade com o backend...")
        response = requests.get(f"{BACKEND_URL}/api/redacoes", timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code in [200, 401, 404, 500]:  # 401 também indica que está rodando
            print("✅ Backend está rodando")
            return True
        else:
            print(f"❌ Backend retornou status inesperado: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectRefused:
        print("❌ Conexão recusada - Backend não está escutando na porta")
        return False
    except requests.exceptions.Timeout:
        print("❌ Timeout - Backend não respondeu em 10 segundos")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro de requisição: {e}")
        return False
    """Testa se o backend está rodando"""
    try:
        # Primeiro teste mais simples
        print("🔄 Testando conectividade com o backend...")
        response = requests.get(f"{BACKEND_URL}/api/redacoes", timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code in [200, 401, 404, 500]:  # 401 também indica que está rodando
            print("✅ Backend está rodando")
            return True
        else:
            print(f"❌ Backend retornou status inesperado: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectRefused:
        print("❌ Conexão recusada - Backend não está escutando na porta")
        return False
    except requests.exceptions.Timeout:
        print("❌ Timeout - Backend não respondeu em 10 segundos")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro de requisição: {e}")
        return False

def create_redacao_with_image(titulo, data_url, token):
    """Cria uma redação enviando a imagem via API"""
    print_section("ETAPA 1: Enviando imagem para OCR (Azure Vision)")
    
    # Preparar dados da requisição
    payload = {
        "titulo": titulo,
        "imagemUrl": data_url
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        print("🔄 Enviando requisição POST /api/redacoes...")
        response = requests.post(
            f"{BACKEND_URL}/api/redacoes",
            json=payload,
            headers=headers,
            timeout=60  # OCR pode demorar
        )
        
        if response.status_code == 201:
            redacao = response.json()
            print("✅ Redação criada com sucesso!")
            print(f"   ID: {redacao.get('id')}")
            print(f"   Título: {redacao.get('titulo')}")
            
            # Mostrar texto extraído pelo OCR
            texto_extraido = redacao.get('textoExtraido', '')
            if texto_extraido:
                print(f"\n📄 TEXTO EXTRAÍDO PELO OCR:")
                print("-" * 60)
                print(texto_extraido)
                print("-" * 60)
                
                # Estatísticas do texto
                palavras = len([p for p in texto_extraido.split() if p.strip()])
                linhas = len([l for l in texto_extraido.split('\n') if l.strip()])
                print(f"📊 Estatísticas:")
                print(f"   • Caracteres: {len(texto_extraido)}")
                print(f"   • Palavras: {palavras}")
                print(f"   • Linhas: {linhas}")
            else:
                print("⚠️ Nenhum texto foi extraído da imagem")
            
            return redacao
        else:
            print(f"❌ Erro ao criar redação: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return None
            
    except requests.exceptions.Timeout:
        print("⏰ Timeout - OCR demorou mais que 60 segundos")
        return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro na requisição: {e}")
        return None

def get_analise_enem(redacao_id, token):
    """Obtém a análise ENEM da redação"""
    print_section("ETAPA 2: Obtendo correções e análise ENEM")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        print("🔄 Enviando requisição GET /api/redacoes/{id}/analise-enem...")
        response = requests.get(
            f"{BACKEND_URL}/api/redacoes/{redacao_id}/analise-enem",
            headers=headers,
            timeout=60  # Análise LLM pode demorar
        )
        
        if response.status_code == 200:
            data = response.json()
            analise = data.get('analise', {})
            
            print("✅ Análise ENEM obtida com sucesso!")
            
            # Mostrar texto formatado/corrigido
            texto_usado = analise.get('textoUsado', '')
            if texto_usado:
                print(f"\n📝 TEXTO CORRIGIDO/FORMATADO:")
                print("-" * 60)
                print(texto_usado)
                print("-" * 60)
            
            # Mostrar correções aplicadas
            correcoes = data.get('correcoes', [])
            if correcoes:
                print(f"\n🛠️ CORREÇÕES APLICADAS ({len(correcoes)} sugestões):")
                for i, correcao in enumerate(correcoes, 1):
                    original = correcao.get('original', '')
                    sugerido = correcao.get('sugerido', '')
                    motivo = correcao.get('motivo', '')
                    print(f"   {i}. \"{original}\" → \"{sugerido}\"")
                    if motivo:
                        print(f"      Motivo: {motivo}")
            else:
                print("\n📄 Nenhuma correção específica foi aplicada")
            
            # Mostrar análise ENEM
            nota_geral = analise.get('notaGeral', 0)
            breakdown = analise.get('breakdown', {})
            
            print(f"\n🎓 ANÁLISE ENEM COMPLETA:")
            print("-" * 60)
            print(f"📊 NOTA GERAL: {nota_geral:.1f}/10")
            print(f"📊 BREAKDOWN POR COMPETÊNCIA:")
            print(f"   • C1 (Domínio da escrita): {breakdown.get('tese', 0):.1f}/10")
            print(f"   • C2 (Compreensão do tema): {breakdown.get('argumentos', 0):.1f}/10")
            print(f"   • C3 (Argumentação): {breakdown.get('coesao', 0):.1f}/10")
            print(f"   • C4 (Repertório sociocultural): {breakdown.get('repertorio', 0):.1f}/10")
            print(f"   • C5 (Norma culta): {breakdown.get('norma', 0):.1f}/10")
            
            # Pontos positivos
            pontos_favoraveis = analise.get('pontosFavoraveis', [])
            if pontos_favoraveis:
                print(f"\n✅ PONTOS POSITIVOS:")
                for i, ponto in enumerate(pontos_favoraveis, 1):
                    print(f"   {i}. {ponto}")
            
            # Pontos a melhorar
            pontos_melhoria = analise.get('pontosMelhoria', [])
            if pontos_melhoria:
                print(f"\n⚠️ PONTOS A MELHORAR:")
                for i, ponto in enumerate(pontos_melhoria, 1):
                    print(f"   {i}. {ponto}")
            
            # Sugestões
            sugestoes = analise.get('sugestoes', [])
            if sugestoes:
                print(f"\n💡 SUGESTÕES:")
                for i, sugestao in enumerate(sugestoes, 1):
                    print(f"   {i}. {sugestao}")
            
            # Comentários gerais
            comentarios = analise.get('comentarios', [])
            if comentarios:
                print(f"\n📝 COMENTÁRIOS GERAIS:")
                for i, comentario in enumerate(comentarios, 1):
                    print(f"   {i}. {comentario}")
            
            return analise, correcoes
            
        else:
            print(f"❌ Erro ao obter análise: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return None, None
            
    except requests.exceptions.Timeout:
        print("⏰ Timeout - Análise LLM demorou mais que 60 segundos")
        return None, None
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro na requisição: {e}")
        return None, None

def test_reanalisar_texto(texto_editado, token):
    """Testa a funcionalidade de reanálise com texto editado"""
    print_section("ETAPA 3: Testando reanálise com texto editado")
    
    payload = {"texto": texto_editado}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        print("🔄 Enviando requisição POST /api/redacoes/reanalyze...")
        response = requests.post(
            f"{BACKEND_URL}/api/redacoes/reanalyze",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            analise = data.get('analise', {})
            
            print("✅ Reanálise concluída!")
            print(f"📊 Nova nota ENEM: {analise.get('notaGeral', 0):.1f}/10")
            
            return analise
        else:
            print(f"❌ Erro na reanálise: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro na requisição: {e}")
        return None

def main():
    """Função principal do teste"""
    print_header("TESTE DO FLUXO COMPLETO: OCR → CORREÇÕES → ANÁLISE ENEM")
    
    # Verificar se o backend está rodando
    if not test_backend_health():
        print("\n❌ TESTE FALHOU: Backend não está acessível")
        print("   Execute 'npm run dev' no diretório backend antes de rodar este teste")
        sys.exit(1)
    
    # Fazer autenticação
    token = authenticate()
    if not token:
        print("\n❌ TESTE FALHOU: Não foi possível fazer autenticação")
        sys.exit(1)
    
    try:
        # 1. Carregar imagem de teste
        print_section("PREPARAÇÃO: Carregando imagem de teste")
        data_url, base64_size = load_test_image()
        print(f"✅ Imagem carregada ({base64_size} chars em base64)")
        
        # 2. Criar redação com OCR
        redacao = create_redacao_with_image("Teste Automático - Python", data_url, token)
        if not redacao:
            print("\n❌ TESTE FALHOU: Não foi possível criar a redação")
            sys.exit(1)
        
        redacao_id = redacao.get('id')
        texto_extraido = redacao.get('textoExtraido', '')
        
        # Aguardar um pouco para processamento
        print("\n⏳ Aguardando processamento completo...")
        time.sleep(2)
        
        # 3. Obter análise ENEM
        analise, correcoes = get_analise_enem(redacao_id, token)
        if not analise:
            print("\n❌ TESTE FALHOU: Não foi possível obter análise ENEM")
            sys.exit(1)
        
        # 4. Teste opcional: reanálise com texto editado
        if texto_extraido:
            texto_editado = texto_extraido + "\n\nEste é um parágrafo adicional para testar a reanálise."
            reanalisar = test_reanalisar_texto(texto_editado, token)
        
        # 5. Resumo final
        print_header("RESUMO DO TESTE")
        palavras_extraidas = len([p for p in texto_extraido.split() if p.strip()]) if texto_extraido else 0
        num_correcoes = len(correcoes) if correcoes else 0
        nota_final = analise.get('notaGeral', 0)
        
        print(f"📷 OCR: {palavras_extraidas} palavras extraídas")
        print(f"📝 Correções: {num_correcoes} sugestões aplicadas")
        print(f"🎓 Nota ENEM: {nota_final:.1f}/10")
        print(f"🆔 ID da redação criada: {redacao_id}")
        print("✅ TESTE CONCLUÍDO COM SUCESSO!")
        
    except FileNotFoundError as e:
        print(f"\n❌ ERRO: {e}")
        print("   Verifique se a imagem teste.png existe no diretório image/")
        sys.exit(1)
        
    except Exception as e:
        print(f"\n❌ ERRO INESPERADO: {e}")
        print(f"   Tipo: {type(e).__name__}")
        sys.exit(1)

if __name__ == "__main__":
    main()