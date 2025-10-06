import React from 'react';

interface VisualizarTextoProps {
  isVisible: boolean;
  onClose: () => void;
  redacao: {
    titulo: string;
    textoExtraido?: string;
    notaGerada?: number;
    criadoEm: string;
  } | null;
}

const VisualizarTexto: React.FC<VisualizarTextoProps> = ({ isVisible, onClose, redacao }) => {
  if (!isVisible || !redacao) return null;

  const palavrasDetectadas = redacao.textoExtraido 
    ? redacao.textoExtraido.split(/\s+/).filter(p => p.trim().length > 0).length 
    : 0;

  const linhasDetectadas = redacao.textoExtraido 
    ? redacao.textoExtraido.split('\n').filter(l => l.trim().length > 0).length 
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">📄 Texto Extraído pelo OCR</h2>
            <p className="text-blue-100 text-sm">{redacao.titulo}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div className="bg-gray-50 p-4 border-b">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{palavrasDetectadas}</div>
              <div className="text-sm text-gray-600">Palavras</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{linhasDetectadas}</div>
              <div className="text-sm text-gray-600">Linhas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {redacao.notaGerada?.toFixed(1) || 'N/A'}
              </div>
              <div className="text-sm text-gray-600">Nota OCR</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {redacao.textoExtraido?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Caracteres</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {redacao.textoExtraido && redacao.textoExtraido.trim() ? (
            <div className="space-y-4">
              {/* Texto original com formatação preservada */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  🔍 Texto como foi lido pelo OCR:
                </h3>
                <div className="bg-gray-50 border rounded-lg p-4">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 leading-relaxed">
                    {redacao.textoExtraido}
                  </pre>
                </div>
              </div>

              {/* Análise de qualidade */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  📊 Análise da Qualidade do OCR:
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 mb-2">Características Detectadas:</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• {palavrasDetectadas} palavras identificadas</li>
                      <li>• {linhasDetectadas} linhas de texto</li>
                      <li>• Média de {palavrasDetectadas > 0 ? Math.round(redacao.textoExtraido.length / palavrasDetectadas) : 0} caracteres por palavra</li>
                      <li>• Densidade: {linhasDetectadas > 0 ? Math.round(palavrasDetectadas / linhasDetectadas) : 0} palavras por linha</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-medium text-yellow-800 mb-2">Possíveis Problemas:</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {palavrasDetectadas < 20 && (
                        <li>• ⚠️ Poucas palavras detectadas - imagem pode estar com baixa resolução</li>
                      )}
                      {redacao.textoExtraido.includes('|') && (
                        <li>• ⚠️ Caracteres especiais detectados (|)</li>
                      )}
                      {/\s{3,}/.test(redacao.textoExtraido) && (
                        <li>• ⚠️ Espaçamentos irregulares detectados</li>
                      )}
                      {redacao.textoExtraido.split(/\s+/).filter(word => word.length === 1).length > palavrasDetectadas * 0.3 && (
                        <li>• ⚠️ Muitas letras isoladas - texto pode estar fragmentado</li>
                      )}
                      {!/[.!?]/.test(redacao.textoExtraido) && palavrasDetectadas > 10 && (
                        <li>• ⚠️ Nenhuma pontuação detectada</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Dicas para melhorar */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">💡 Dicas para melhorar o OCR:</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Use imagens com alta resolução (mínimo 300 DPI)</li>
                  <li>• Certifique-se de que há bom contraste entre texto e fundo</li>
                  <li>• Evite sombras ou reflexos na imagem</li>
                  <li>• Mantenha a câmera perpendicular ao papel</li>
                  <li>• Use boa iluminação, preferencialmente luz natural</li>
                  <li>• Escreva com letra clara e bem espaçada</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-6xl mb-4">📄</div>
              <p>Nenhum texto foi extraído desta imagem.</p>
              <p className="text-sm mt-2">Verifique se a imagem contém texto legível.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Processado em: {new Date(redacao.criadoEm).toLocaleString('pt-BR')}
          </div>
          <button
            onClick={onClose}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default VisualizarTexto;