import React, { useState, useEffect } from 'react';
import { redacaoService } from '../services/api';

interface AnaliseRedacaoProps {
  redacaoId: string;
  isVisible: boolean;
  onClose: () => void;
}

interface AnaliseTexto {
  pontuacao: number;
  pontosPositivos: string[];
  pontosNegativos: string[];
  sugestoes: string[];
  qualidadeOCR: {
    nivel: 'baixa' | 'media' | 'alta';
    problemas: string[];
    confiabilidade: number;
  };
  estatisticas: {
    palavras: number;
    caracteres: number;
    paragrafos: number;
    frases: number;
  };
}

const AnaliseRedacao: React.FC<AnaliseRedacaoProps> = ({ redacaoId, isVisible, onClose }) => {
  const [analise, setAnalise] = useState<AnaliseTexto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible && redacaoId) {
      carregarAnalise();
    }
  }, [isVisible, redacaoId]);

  const carregarAnalise = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await redacaoService.getAnalise(redacaoId);
      setAnalise(response.analise);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar análise');
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">📊 Análise Inteligente da Redação</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="ml-2 text-gray-600">Analisando texto...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-4">❌ {error}</div>
              <button
                onClick={carregarAnalise}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Tentar Novamente
              </button>
            </div>
          ) : analise ? (
            <div className="space-y-6">
              {/* Estatísticas Gerais */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  📊 Estatísticas do Texto
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{analise.estatisticas.palavras}</div>
                    <div className="text-sm text-gray-600">Palavras</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{analise.estatisticas.frases}</div>
                    <div className="text-sm text-gray-600">Frases</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{analise.estatisticas.paragrafos}</div>
                    <div className="text-sm text-gray-600">Parágrafos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{analise.pontuacao.toFixed(1)}</div>
                    <div className="text-sm text-gray-600">Pontuação</div>
                  </div>
                </div>
              </div>

              {/* Qualidade OCR */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  🔍 Qualidade do OCR
                </h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center">
                    <span className="text-2xl font-bold text-blue-600">
                      {analise.qualidadeOCR?.confiabilidade || 0}%
                    </span>
                    <span className={`ml-2 px-2 py-1 rounded text-sm font-medium ${
                      analise.qualidadeOCR?.nivel === 'alta' ? 'bg-green-100 text-green-800' :
                      analise.qualidadeOCR?.nivel === 'media' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {analise.qualidadeOCR?.nivel === 'alta' ? 'Alta' : 
                       analise.qualidadeOCR?.nivel === 'media' ? 'Média' : 'Baixa'}
                    </span>
                  </div>
                </div>
                {analise.qualidadeOCR?.problemas && analise.qualidadeOCR.problemas.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Problemas detectados:</h4>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {analise.qualidadeOCR.problemas.map((problema, index) => (
                        <li key={index}>{problema}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Pontos Positivos */}
              {analise.pontosPositivos && analise.pontosPositivos.length > 0 && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center">
                    ✅ Pontos Positivos
                  </h3>
                  <ul className="space-y-2">
                    {analise.pontosPositivos.map((ponto, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-green-600 mr-2 mt-1">•</span>
                        <span className="text-green-700">{ponto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pontos Negativos */}
              {analise.pontosNegativos && analise.pontosNegativos.length > 0 && (
                <div className="bg-red-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center">
                    ⚠️ Pontos para Melhoria
                  </h3>
                  <ul className="space-y-2">
                    {analise.pontosNegativos.map((ponto, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-red-600 mr-2 mt-1">•</span>
                        <span className="text-red-700">{ponto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sugestões */}
              {analise.sugestoes && analise.sugestoes.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                    💡 Sugestões de Melhoria
                  </h3>
                  <ul className="space-y-2">
                    {analise.sugestoes.map((sugestao, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-600 mr-2 mt-1">•</span>
                        <span className="text-blue-700">{sugestao}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Nenhuma análise disponível
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 flex justify-end">
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

export default AnaliseRedacao;