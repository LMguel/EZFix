import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { redacaoService, authService } from '../services/api';
import { Redacao } from '../types';
import AnaliseRedacao from '../components/AnaliseRedacao';
import VisualizarTexto from '../components/VisualizarTexto';

interface RedacoesPageProps {
  onLogout: () => void;
}

const RedacoesPage: React.FC<RedacoesPageProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const [redacoes, setRedacoes] = useState<Redacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [analiseModalOpen, setAnaliseModalOpen] = useState(false);
  const [redacaoAnaliseId, setRedacaoAnaliseId] = useState<string | null>(null);
  const [textoModalOpen, setTextoModalOpen] = useState(false);
  const [redacaoTextoSelecionada, setRedacaoTextoSelecionada] = useState<Redacao | null>(null);

  const isOcrProcessing = (r: Redacao) =>
    (r.textoExtraido === undefined || r.textoExtraido === null) && !r.notaFinal;
  const isOcrNoText = (r: Redacao) =>
    r.textoExtraido === '' && !r.notaFinal;
  const isOcrDone = (r: Redacao) =>
    typeof r.textoExtraido === 'string' && r.textoExtraido.trim() !== '';

  const loadRedacoes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await redacaoService.list();
      setRedacoes(data);
    } catch (error) {
      console.error('Erro ao carregar redações:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = authService.getUser();
    setCurrentUser(user);
    loadRedacoes();
  }, [loadRedacoes]);

  const abrirAnalise = (id: string) => {
    setRedacaoAnaliseId(id);
    setAnaliseModalOpen(true);
  };

  const fecharAnalise = () => {
    setAnaliseModalOpen(false);
    setRedacaoAnaliseId(null);
  };

  const abrirTexto = (redacao: Redacao) => {
    setRedacaoTextoSelecionada(redacao);
    setTextoModalOpen(true);
  };

  const fecharTexto = () => {
    setTextoModalOpen(false);
    setRedacaoTextoSelecionada(null);
  };

  const handleDeleteRedacao = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta redação?')) {
      try {
        await redacaoService.delete(id);
        loadRedacoes();
      } catch (error) {
        alert('Erro ao excluir redação');
      }
    }
  };

  const getStatusColor = (r: Redacao) => {
    if (r.notaFinal) return 'text-green-600';
    if (isOcrProcessing(r)) return 'text-yellow-600';
    if (isOcrNoText(r)) return 'text-orange-600';
    if (isOcrDone(r)) return 'text-blue-600';
    return 'text-yellow-600';
  };

  const getStatusText = (r: Redacao) => {
    if (r.notaFinal) return 'CORRIGIDA';
    if (isOcrProcessing(r)) return 'PROCESSANDO';
    if (isOcrNoText(r)) return 'SEM TEXTO';
    if (isOcrDone(r)) return 'PROCESSADA';
    return 'PROCESSANDO';
  };

  const getStatusIcon = (r: Redacao) => {
    if (r.notaFinal) return '✅';
    if (isOcrProcessing(r)) return '⏳';
    if (isOcrNoText(r)) return '⚠️';
    if (isOcrDone(r)) return '🔍';
    return '⏳';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600">
      {/* Header */}
      <header className="bg-white shadow-lg p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">📝</span>
            <h1 className="text-xl font-bold text-gray-800">EZ Sentence Fix</h1>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <button onClick={() => navigate('/dashboard')} className="text-gray-600 hover:text-gray-800 bg-transparent">Dashboard</button>
            <button onClick={() => navigate('/redacoes')} className="text-purple-600 font-semibold bg-transparent">Redações</button>
          </nav>

          <div className="flex items-center space-x-4">
            <div className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
              {currentUser?.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="text-gray-700">
              {currentUser?.nome || 'Usuário'}
            </span>
            <button
              onClick={() => {
                authService.logout();
                onLogout();
              }}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Título */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📄</span>
              <h2 className="text-2xl font-bold text-gray-800">Histórico de Redações</h2>
            </div>
            <div className="text-sm text-gray-500">
              Total: {redacoes.length} redações
            </div>
          </div>
        </div>

        {/* Lista de Redações */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Carregando redações...</p>
            </div>
          ) : redacoes.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-6xl mb-4 block">📝</span>
              <p className="text-gray-500 text-lg">Nenhuma redação encontrada</p>
              <p className="text-gray-400 text-sm mt-2">
                Comece enviando sua primeira redação no Dashboard
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {redacoes.map((redacao) => (
                <div key={redacao.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-gray-800 text-lg">{redacao.titulo}</h3>
                    <span className={`text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-full ${getStatusColor(redacao)} bg-opacity-10`}>
                      {getStatusIcon(redacao)} {getStatusText(redacao)}
                    </span>
                  </div>
                  
                  {/* Feedback visual baseado no status */}
                  {isOcrProcessing(redacao) && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-yellow-600">
                        <div className="animate-spin w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                        <span className="text-sm">Processando OCR...</span>
                      </div>
                    </div>
                  )}

                  {isOcrNoText(redacao) && (
                    <div className="mb-4 text-orange-600 text-sm p-3 bg-orange-50 rounded-lg">
                      ⚠️ OCR finalizado, nenhum texto legível foi detectado.
                    </div>
                  )}
                  
                  {/* Preview do texto extraído */}
                  {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <p className="text-gray-600 font-medium mb-2">Texto extraído:</p>
                      <p className="text-gray-700 line-clamp-3">
                        {redacao.textoExtraido.substring(0, 150)}
                        {redacao.textoExtraido.length > 150 && '...'}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="text-xs text-gray-500">
                      <p>{new Date(redacao.criadoEm).toLocaleDateString('pt-BR')}</p>
                      <p>{new Date(redacao.criadoEm).toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}</p>
                    </div>
                    <div className="flex gap-2">
                      {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                        <>
                          <button 
                            onClick={() => abrirAnalise(redacao.id.toString())}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium bg-purple-50 px-3 py-2 rounded-lg hover:bg-purple-100 transition-colors"
                          >
                            📊 Análise
                          </button>
                          <button 
                            onClick={() => abrirTexto(redacao)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            📄 Ver Texto
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteRedacao(redacao.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Análise */}
      {redacaoAnaliseId && (
        <AnaliseRedacao
          redacaoId={redacaoAnaliseId}
          isVisible={analiseModalOpen}
          onClose={fecharAnalise}
          onProgress={() => {}} // Não precisa de progress aqui
        />
      )}

      {/* Modal de Visualização de Texto */}
      <VisualizarTexto
        isVisible={textoModalOpen}
        onClose={fecharTexto}
        redacao={redacaoTextoSelecionada}
      />
    </div>
  );
};

export default RedacoesPage;