# 📝 Como Usar o Upload de Redações com Drag & Drop

## 🎯 Funcionalidades Implementadas

### ✅ **Upload de Arquivos**
- **Arrastar e Soltar**: Arraste qualquer imagem diretamente para a área designada
- **Clique para Selecionar**: Clique na área para abrir o seletor de arquivos
- **Preview**: Visualização da imagem selecionada antes do envio
- **Validação**: Apenas arquivos de imagem são aceitos

### ✅ **Formatos Suportados**
- JPG/JPEG
- PNG
- GIF
- WebP
- Outros formatos de imagem suportados pelo navegador

### ✅ **Compatibilidade**
- URLs de imagens (método anterior ainda funciona)
- Arquivos locais via drag & drop
- Arquivos locais via seleção manual

## 🚀 Como Testar

### 1. **Acesse o Sistema**
```
http://localhost:3001
```

### 2. **Faça Login**
- Email: `teste@email.com`
- Senha: `123456`

### 3. **Upload de Redação**

#### **Opção A: Drag & Drop na Área Principal**
1. Na tela inicial, localize a área com "Arraste a redação escaneada aqui"
2. Arraste qualquer imagem da sua área de trabalho para essa área
3. A área ficará destacada em roxo quando você estiver arrastando
4. Solte o arquivo - o modal será aberto automaticamente

#### **Opção B: Clique no Botão "OCR Scanner"**
1. Clique no botão roxo "📷 OCR Scanner"
2. No modal que abrir:
   - **Arraste**: Arraste uma imagem para a área pontilhada
   - **Clique**: Clique na área pontilhada para selecionar arquivo
   - **Preview**: Veja a miniatura da imagem selecionada

#### **Opção C: URL de Imagem (método anterior)**
1. Se não selecionar arquivo, pode ainda usar URL
2. Cole o link de uma imagem online no campo "URL da Imagem"

### 4. **Processo de Envio**
1. **Preencha o título** da redação
2. **Selecione ou arraste** uma imagem
3. **Clique em "Enviar"**
4. **Aguarde**: O sistema processará o OCR automaticamente
5. **Resultado**: A redação aparecerá na lista com texto extraído e nota

## 🧪 Imagens de Teste

### **Para testar rapidamente**, use estas imagens de exemplo:

#### **1. Texto Simples**
```
https://via.placeholder.com/600x400/000000/FFFFFF?text=Esta+é+uma+redação+de+teste+com+várias+palavras+para+demonstrar+o+funcionamento+do+sistema+de+OCR+e+avaliação+automática
```

#### **2. Texto Maior (nota mais alta)**
```
https://via.placeholder.com/800x600/000000/FFFFFF?text=Esta+é+uma+redação+mais+extensa+com+muitas+palavras+para+testar+o+sistema+de+pontuação+automática+que+considera+o+tamanho+do+texto+extraído+pelo+OCR+e+gera+uma+nota+baseada+na+quantidade+de+palavras+encontradas+no+documento+digitalizado
```

### **Para arquivos locais**, crie uma imagem com texto ou use:
- Screenshot de um documento
- Foto de texto manuscrito
- Scan de uma redação real

## 🎨 Interface Visual

### **Estados da Área de Upload:**
- **Normal**: Borda cinza pontilhada
- **Hover**: Borda roxa ao passar mouse
- **Dragging**: Fundo roxo claro quando arrastando arquivo
- **Arquivo Selecionado**: Mostra preview e informações do arquivo

### **Feedback Visual:**
- ✅ **Arquivo Selecionado**: Nome, tamanho e preview
- 🔄 **Enviando**: Botão desabilitado com "Enviando..."
- ⚠️ **Erro**: Alerta com mensagem de erro
- ✅ **Sucesso**: Alerta de confirmação e redação na lista

## 🔧 Detalhes Técnicos

### **Processamento:**
1. **Upload**: Arquivo convertido para base64
2. **Envio**: Base64 enviado para API backend
3. **OCR**: Tesseract.js processa a imagem
4. **Nota**: Algoritmo simples gera nota baseada no texto
5. **Armazenamento**: Redação salva no banco SQLite

### **Validações:**
- Apenas arquivos de imagem aceitos
- Tamanho limitado pelo navegador
- Campo título obrigatório
- Arquivo OU URL obrigatório

## 🐛 Troubleshooting

### **Se o upload não funcionar:**
1. Verifique se é um arquivo de imagem válido
2. Teste com uma imagem menor
3. Verifique se o backend está rodando (porta 3000)
4. Veja o console do navegador para erros

### **Se o OCR falhar:**
1. Use imagens com texto claro e legível
2. Evite fundos complexos ou texto muito pequeno
3. Formatos JPG e PNG funcionam melhor

### **Se não conseguir fazer login:**
1. Use as credenciais: `teste@email.com` / `123456`
2. Verifique se o backend está rodando
3. Teste registrar um novo usuário se necessário

## 🎉 Pronto para Testar!

A funcionalidade de drag & drop está completamente implementada e funcional. Teste todas as opções:

1. ✅ Arrastar arquivo para área principal
2. ✅ Arrastar arquivo para modal
3. ✅ Clicar para selecionar arquivo
4. ✅ Preview de imagem
5. ✅ Validação de tipos
6. ✅ Conversão para base64
7. ✅ OCR automático
8. ✅ Geração de nota

**Divirta-se testando! 🚀**