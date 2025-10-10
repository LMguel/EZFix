import React, { useState, useEffect, useRef, useCallback } from 'react';
import { redacaoService } from '../services/api';

interface AnaliseRedacaoProps {
  redacaoId: string;
  isVisible: boolean;
  onClose: () => void;
  onProgress?: (step: string, details?: string) => void;
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
  criterios?: {
    C1?: number;
    C2?: number;
    C3?: number;
    C4?: number;
    C5?: number;
  };
}

const AnaliseRedacao: React.FC<AnaliseRedacaoProps> = ({ redacaoId, isVisible, onClose, onProgress }) => {
  const [analise, setAnalise] = useState<AnaliseTexto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [textoEditavel, setTextoEditavel] = useState('');
  const [ocrLinesVisible, setOcrLinesVisible] = useState(false);
  const [ocrLines, setOcrLines] = useState<Array<any>>([]);
  const [correcoes, setCorrecoes] = useState<Array<{ original: string; sugerido: string; motivo?: string }>>([]);
  const pollRef = useRef<number | null>(null);

  // polling: tenta carregar análise a cada 3s por até 30s
  const carregarAnaliseWithPolling = useCallback(async () => {
    setLoading(true);
    setError(null);
    onProgress?.('Aguardando análise GPT', 'Solicitando avaliação ao modelo...');
    let attempts = 0;
    const maxAttempts = 10; // 10 * 3s = 30s

    const tryOnce = async () => {
      try {
        const response = await redacaoService.getAnaliseEnem(redacaoId);
        if (response?.analise) {
          setAnalise(response.analise || response);
          onProgress?.('Análise GPT concluída', 'Resultado recebido');
          setLoading(false);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (err: any) {
        // não sobrescrever erro imediatamente, apenas marcar
        setError(err.response?.data?.erro || err.response?.data?.error || err.message || null);
      }
      attempts++;
      if (attempts >= maxAttempts) {
        setLoading(false);
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    };

    // try imediato e depois interval
    await tryOnce();
    // iniciar polling caso necessário; o próprio tryOnce irá encerrar o polling quando receber a análise
    if (pollRef.current === null && attempts < maxAttempts) {
      pollRef.current = window.setInterval(tryOnce, 3000);
    }
  }, [redacaoId, onProgress]);

  useEffect(() => {
    if (isVisible && redacaoId) {
      setAnalise(null);
      setError(null);
      carregarAnaliseWithPolling();
    }

    return () => {
      // limpar qualquer polling pendente
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [isVisible, redacaoId]);

  const carregarAnalise = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await redacaoService.getAnaliseEnem(redacaoId);
      setAnalise(response.analise || response);
      // se houver dados OCR detalhados, guardar
      if (response?.ocr?.lines) {
        setOcrLines(response.ocr.lines || []);
      } else {
        setOcrLines([]);
      }
      if (response?.correcoes) setCorrecoes(response.correcoes || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || err.response?.data?.error || err.message || 'Erro ao carregar análise');
    } finally {
      setLoading(false);
    }
  };

  const salvarTextoEditado = async () => {
    setLoading(true);
    try {
      if (!textoEditavel || textoEditavel.trim() === '') {
        setError('Texto vazio. Insira o texto antes de salvar.');
        setLoading(false);
        return;
      }
      // Atualiza redação (isso vai disparar re-análise no backend)
      await redacaoService.update(redacaoId, { textoExtraido: textoEditavel } as any);
      // re-executar análise ENEM após atualização (salvou no DB)
      await carregarAnalise();
      setEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.erro || err.message || 'Erro ao salvar texto');
    } finally {
      setLoading(false);
    }
  };

  const reanalisarTextoEditado = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!textoEditavel || textoEditavel.trim() === '') {
        setError('Texto vazio. Insira o texto antes de reanalisar.');
        setLoading(false);
        return;
      }
      const res = await redacaoService.reanalyze(textoEditavel);
      if (res) {
        // atualizar análise na tela sem salvar no DB
        setAnalise(res.analise || res);
        if (res.correcoes) setCorrecoes(res.correcoes || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.erro || err.message || 'Erro ao reanalisar texto');
    } finally {
      setLoading(false);
    }
  };

  const aplicarCorrecao = (c: { original: string; sugerido: string }) => {
    // aplicar primeira ocorrência (insensitive) no texto editável
    if (!textoEditavel) return;
    const regex = new RegExp(c.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const novo = textoEditavel.replace(regex, c.sugerido);
    setTextoEditavel(novo);
  };

  const aplicarTodasCorrecoes = () => {
    if (!textoEditavel) return;
    let novo = textoEditavel;
    for (const c of correcoes) {
      const regex = new RegExp(c.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      novo = novo.replace(regex, c.sugerido);
    }
    setTextoEditavel(novo);
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
                    <div className="text-2xl font-bold text-blue-600">{analise?.estatisticas?.palavras ?? 0}</div>
                    <div className="text-sm text-gray-600">Palavras</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{analise?.estatisticas?.frases ?? 0}</div>
                    <div className="text-sm text-gray-600">Frases</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{analise?.estatisticas?.paragrafos ?? 0}</div>
                    <div className="text-sm text-gray-600">Parágrafos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{(analise?.pontuacao ?? 0).toFixed(1)}</div>
                    <div className="text-sm text-gray-600">Pontuação</div>
                  </div>
                </div>
                {/* Critérios ENEM (C1..C5) */}
                {analise?.criterios && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="text-center p-2 bg-white rounded shadow-sm">
                      <div className="text-xl font-bold text-blue-600">{analise.criterios.C1 ?? 0}</div>
                      <div className="text-xs text-gray-500">C1: Domínio da escrita formal</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded shadow-sm">
                      <div className="text-xl font-bold text-blue-600">{analise.criterios.C2 ?? 0}</div>
                      <div className="text-xs text-gray-500">C2: Compreensão do tema</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded shadow-sm">
                      <div className="text-xl font-bold text-blue-600">{analise.criterios.C3 ?? 0}</div>
                      <div className="text-xs text-gray-500">C3: Argumentação consistente</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded shadow-sm">
                      <div className="text-xl font-bold text-blue-600">{analise.criterios.C4 ?? 0}</div>
                      <div className="text-xs text-gray-500">C4: Mecanismos linguísticos</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded shadow-sm">
                      <div className="text-xl font-bold text-blue-600">{analise.criterios.C5 ?? 0}</div>
                      <div className="text-xs text-gray-500">C5: Proposta de intervenção</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Qualidade OCR */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  🔍 Qualidade do OCR
                </h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center">
                    <span className="text-2xl font-bold text-blue-600">
                      {Math.round(analise?.qualidadeOCR?.confiabilidade ?? 0)}%
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
                {analise?.qualidadeOCR?.problemas && analise.qualidadeOCR.problemas.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Problemas detectados:</h4>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {(analise?.qualidadeOCR?.problemas ?? []).map((problema, index) => (
                        <li key={index}>{problema}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <button onClick={() => setOcrLinesVisible(v => !v)} className="px-3 py-1 bg-gray-200 rounded">{ocrLinesVisible ? 'Ocultar' : 'Mostrar'} regiões OCR</button>
                </div>
                {ocrLinesVisible && ocrLines.length > 0 && (
                  <div className="mt-3 text-sm text-gray-700">
                    <h4 className="font-medium mb-2">Linhas detectadas (confiança):</h4>
                    <ul className="list-decimal list-inside space-y-1">
                      {ocrLines.map((ln, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="truncate pr-4">{ln.text}</span>
                          <span className="text-xs text-gray-500">{Math.round((ln.confidence||80))}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Pontos Positivos */}
              {analise?.pontosPositivos && analise.pontosPositivos.length > 0 && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center">
                    ✅ Pontos Positivos
                  </h3>
                  <ul className="space-y-2">
                    {(analise?.pontosPositivos ?? []).map((ponto, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-green-600 mr-2 mt-1">•</span>
                        <span className="text-green-700">{ponto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pontos Negativos */}
              {analise?.pontosNegativos && analise.pontosNegativos.length > 0 && (
                <div className="bg-red-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center">
                    ⚠️ Pontos para Melhoria
                  </h3>
                  <ul className="space-y-2">
                    {(analise?.pontosNegativos ?? []).map((ponto, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-red-600 mr-2 mt-1">•</span>
                        <span className="text-red-700">{ponto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sugestões */}
              {analise?.sugestoes && analise.sugestoes.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                    💡 Sugestões de Melhoria
                  </h3>
                  <ul className="space-y-2">
                    {(analise?.sugestoes ?? []).map((sugestao, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-600 mr-2 mt-1">•</span>
                        <span className="text-blue-700">{sugestao}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Correções sugeridas pelo LLM (aplicar no editor) */}
              {correcoes && correcoes.length > 0 && (
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-yellow-800">🛠️ Correções Sugeridas</h3>
                    <div className="flex gap-2">
                      <button onClick={aplicarTodasCorrecoes} className="px-3 py-1 bg-yellow-600 text-white rounded text-sm">Aplicar todas</button>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700">
                    {correcoes.map((c, i) => (
                      <li key={i} className="flex justify-between items-start">
                        <div>
                          <div><strong>Original:</strong> <span className="italic">{c.original}</span></div>
                          <div><strong>Sugerido:</strong> <span className="text-green-700">{c.sugerido}</span></div>
                          {c.motivo && <div className="text-xs text-gray-500">Motivo: {c.motivo}</div>}
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <button onClick={() => aplicarCorrecao(c)} className="px-2 py-1 bg-white border rounded text-sm">Aplicar</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-4">Nenhuma análise disponível ainda. Se o OCR não extraiu texto, você pode editar manualmente abaixo e salvar para reexecutar a análise.</p>
              {editing ? (
                <div className="space-y-2">
                  <textarea value={textoEditavel} onChange={(e) => setTextoEditavel(e.target.value)} className="w-full h-40 p-2 border rounded" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditing(false); setTextoEditavel(''); }} className="px-3 py-1 border rounded">Cancelar</button>
                    <button onClick={salvarTextoEditado} className="px-3 py-1 bg-blue-600 text-white rounded">Salvar</button>
                    <button onClick={reanalisarTextoEditado} className="px-3 py-1 bg-green-600 text-white rounded">Atualizar Análise</button>
                  </div>
                </div>
              ) : (
                <div>
                  <button onClick={async () => {
                    // buscar texto atual e abrir editor
                    try {
                      const r = await redacaoService.get(redacaoId);
                      setTextoEditavel(r?.textoExtraido || '');
                      setError(null);
                    } catch (e) {
                      setTextoEditavel('');
                      setError('Não foi possível obter o texto atual');
                    }
                    setEditing(true);
                  }} className="px-3 py-2 bg-yellow-400 text-black rounded">✏️ Editar Texto</button>
                </div>
              )}
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