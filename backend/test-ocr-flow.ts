import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Importar serviços diretamente
import { extrairTextoDaImagem } from './src/services/ocrService';
import { formatarTextoComLLM, analisarEnem } from './src/services/ennAnalysisService';

const __dirname = process.cwd();

async function testarFluxoCompleto() {
  console.log('🔬 TESTE DO FLUXO COMPLETO: OCR → CORREÇÕES → ANÁLISE ENEM');
  console.log('=' .repeat(80));
  
  try {
    // 1. Testar OCR com Azure Vision
    console.log('\n📷 ETAPA 1: Lendo imagem com Azure Vision...');
    const imagePath = path.join(__dirname, 'image', 'teste.png');
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Imagem não encontrada: ${imagePath}`);
    }
    
    console.log(`Arquivo de imagem: ${imagePath}`);
    console.log(`Tamanho do arquivo: ${(fs.statSync(imagePath).size / 1024).toFixed(2)} KB`);
    
    // Converter para data URL como o frontend faria
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Data = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Data}`;
    
    console.log('\n🔍 Iniciando OCR...');
    const ocrResult = await extrairTextoDaImagem(dataUrl);
    const textoExtraido = ocrResult.text;
    
    console.log('\n✅ TEXTO EXTRAÍDO PELO OCR:');
    console.log('-'.repeat(60));
    console.log(textoExtraido);
    console.log('-'.repeat(60));
    console.log(`Engine usado: ${ocrResult.engine || 'desconhecido'}`);
    console.log(`Confiança: ${ocrResult.confidence || 0}%`);
    console.log(`Caracteres: ${textoExtraido.length}`);
    console.log(`Palavras: ${textoExtraido.split(/\s+/).filter((p: string) => p.trim().length > 0).length}`);
    console.log(`Linhas: ${textoExtraido.split('\n').filter((l: string) => l.trim().length > 0).length}`);
    
    if (!textoExtraido || textoExtraido.trim().length === 0) {
      throw new Error('OCR não extraiu nenhum texto da imagem');
    }
    
    // 2. Testar formatação/correções com GPT
    console.log('\n📝 ETAPA 2: Formatando e corrigindo texto com GPT...');
    const resultadoFormatacao = await formatarTextoComLLM(textoExtraido);
    
    console.log('\n✅ TEXTO CORRIGIDO/FORMATADO:');
    console.log('-'.repeat(60));
    console.log(resultadoFormatacao.textoFormatado);
    console.log('-'.repeat(60));
    
    if (resultadoFormatacao.correcoes && resultadoFormatacao.correcoes.length > 0) {
      console.log('\n🛠️ CORREÇÕES APLICADAS:');
      resultadoFormatacao.correcoes.forEach((c, i) => {
        console.log(`${i + 1}. "${c.original}" → "${c.sugerido}"`);
        if (c.motivo) console.log(`   Motivo: ${c.motivo}`);
      });
    } else {
      console.log('\n📄 Nenhuma correção específica foi sugerida pelo GPT');
    }
    
    // 3. Testar análise ENEM
    console.log('\n🎓 ETAPA 3: Analisando redação com critérios ENEM...');
    const textoParaAnalise = resultadoFormatacao.textoFormatado || textoExtraido;
    const analiseEnem = await analisarEnem(textoParaAnalise);
    
    console.log('\n✅ ANÁLISE ENEM COMPLETA:');
    console.log('-'.repeat(60));
    console.log(`📊 NOTA GERAL: ${analiseEnem.notaGeral.toFixed(1)}/10`);
    console.log(`📊 BREAKDOWN POR COMPETÊNCIA:`);
    console.log(`   • C1 (Domínio da escrita): ${analiseEnem.breakdown.tese.toFixed(1)}/10`);
    console.log(`   • C2 (Compreensão do tema): ${analiseEnem.breakdown.argumentos.toFixed(1)}/10`);
    console.log(`   • C3 (Argumentação): ${analiseEnem.breakdown.coesao.toFixed(1)}/10`);
    console.log(`   • C4 (Repertório sociocultural): ${analiseEnem.breakdown.repertorio.toFixed(1)}/10`);
    console.log(`   • C5 (Norma culta): ${analiseEnem.breakdown.norma.toFixed(1)}/10`);
    
    if (analiseEnem.pontosFavoraveis && analiseEnem.pontosFavoraveis.length > 0) {
      console.log('\n✅ PONTOS POSITIVOS:');
      analiseEnem.pontosFavoraveis.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p}`);
      });
    }
    
    if (analiseEnem.pontosMelhoria && analiseEnem.pontosMelhoria.length > 0) {
      console.log('\n⚠️ PONTOS A MELHORAR:');
      analiseEnem.pontosMelhoria.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p}`);
      });
    }
    
    if (analiseEnem.sugestoes && analiseEnem.sugestoes.length > 0) {
      console.log('\n💡 SUGESTÕES:');
      analiseEnem.sugestoes.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s}`);
      });
    }
    
    if (analiseEnem.comentarios && analiseEnem.comentarios.length > 0) {
      console.log('\n📝 COMENTÁRIOS GERAIS:');
      analiseEnem.comentarios.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c}`);
      });
    }
    
    // 4. Resumo final
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESUMO DO TESTE:');
    console.log(`📷 OCR: ${textoExtraido.split(/\s+/).filter((p: string) => p.trim().length > 0).length} palavras extraídas`);
    console.log(`🔧 Engine: ${ocrResult.engine} (confiança: ${ocrResult.confidence}%)`);
    console.log(`📝 Correções: ${resultadoFormatacao.correcoes ? resultadoFormatacao.correcoes.length : 0} sugestões`);
    console.log(`🎓 Nota ENEM: ${analiseEnem.notaGeral.toFixed(1)}/10`);
    console.log('✅ Teste concluído com sucesso!');
    
  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:');
    console.error('Tipo:', error.constructor.name);
    console.error('Mensagem:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Informações de debug adicionais
    console.log('\n🔧 INFORMAÇÕES DE DEBUG:');
    console.log('- Verifique se as variáveis de ambiente estão configuradas (.env)');
    console.log('- AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT');
    console.log('- Ou OPENAI_API_KEY para fallback');
    console.log('- Teste de conectividade com os serviços externos');
    
    process.exit(1);
  }
}

// Verificar configuração e executar
console.log('Verificando configuração:');
console.log('- Azure endpoint:', process.env.AZURE_OPENAI_ENDPOINT ? '✅ Configurado' : '❌ Não configurado');
console.log('- Azure key:', process.env.AZURE_OPENAI_KEY ? '✅ Configurado' : '❌ Não configurado');
console.log('- Azure deployment:', process.env.AZURE_OPENAI_DEPLOYMENT ? '✅ Configurado' : '❌ Não configurado');
console.log('- OpenAI key (fallback):', process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ Não configurado');

testarFluxoCompleto();