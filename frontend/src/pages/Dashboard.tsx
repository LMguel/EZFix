import React, { useState, useEffect, useRef, useCallback } from 'react';
import { redacaoService, authService } from '../services/api';
import { Redacao } from '../types';
import AnaliseRedacao from '../components/AnaliseRedacao';
import VisualizarTexto from '../components/VisualizarTexto';
import ProcessingModal from '../components/ProcessingModal';

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [redacoes, setRedacoes] = useState<Redacao[]>([]);
  const [enemScores, setEnemScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newRedacao, setNewRedacao] = useState({
    titulo: '',
    imagemUrl: '',
  });
  const [uploadLoading, setUploadLoading] = useState(false);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | undefined>(undefined);
  const [processingDetails, setProcessingDetails] = useState<string | undefined>(undefined);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const imgPreviewRef = useRef<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
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

  const loadRedacoes = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await redacaoService.list();
      setRedacoes(data);
      setLastUpdate(new Date());
      try {
        const recent = data.slice(0, 3);
        const scores: Record<string, number> = {};
        await Promise.all(recent.map(async (r: Redacao) => {
          try {
            const resp = await redacaoService.getAnaliseEnem(r.id.toString());
            const nota = resp?.analise?.notaGeral ?? resp?.analise?.notaGeral ?? null;
            if (nota !== null && nota !== undefined) scores[r.id] = Number(nota);
          } catch (e) {
            // ignore per-item errors
          }
        }));
        setEnemScores(scores);
      } catch (e) {
        // ignore
      }
    } catch (error) {
      console.error('Erro ao carregar redações:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Primeira chamada mostra loading
    loadRedacoes(true);

    // Atualizações periódicas não mostram loading
    const interval = setInterval(() => {
      loadRedacoes(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [loadRedacoes]);

  const abrirAnalise = (id: string) => {
    setRedacaoAnaliseId(id);
    setAnaliseModalOpen(true);
  };

  const fecharAnalise = () => {
    setAnaliseModalOpen(false);
    setRedacaoAnaliseId(null);
    setProcessingOpen(false);
  };

  const abrirTexto = (redacao: Redacao) => {
    setRedacaoTextoSelecionada(redacao);
    setTextoModalOpen(true);
  };

  const fecharTexto = () => {
    setTextoModalOpen(false);
    setRedacaoTextoSelecionada(null);
  };

  const handleCreateRedacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadLoading(true);

    try {
      // abrir modal de processamento com etapa inicial
      setProcessingOpen(true);
      setProcessingStep('Lendo redação.');
      setProcessingDetails('Extraindo texto com Azure Vision...');
      // Quando houver arquivo selecionado, usar upload multipart (FormData)
      let created;
      if (selectedFile) {
        const fd = new FormData();
        fd.append('titulo', newRedacao.titulo);
        fd.append('file', selectedFile);
        setProcessingStep('Enviando arquivo para OCR');
        setProcessingDetails('Upload de imagem (multipart)...');
        created = await redacaoService.createWithFile(fd);
      } else {
        let imagemUrl = newRedacao.imagemUrl;
        // indicar que o OCR está em progresso
        setProcessingStep('Extraindo texto (OCR)');
        setProcessingDetails('Executando OCR otimizado (pode levar alguns segundos)');
        created = await redacaoService.create({ titulo: newRedacao.titulo, imagemUrl: imagemUrl });
      }

      setNewRedacao({ titulo: '', imagemUrl: '' });
      setSelectedFile(null);
      setShowUploadModal(false);
      loadRedacoes();

      // Indicar que a análise GPT será iniciada
      setProcessingStep('Analisando redação');
      setProcessingDetails('Enviando texto extraído para o modelo para correções e avaliação ENEM...');

      // Abrir modal de análise automaticamente (o componente fará a chamada ENEM)
      setRedacaoAnaliseId(created.id);
      setAnaliseModalOpen(true);
      // manter modal de processamento aberto; o componente de análise chamará onClose quando finalizar
    } catch (error: any) {
      console.error('Erro ao enviar redação:', error);
      // garantir que o modal de processamento seja fechado para evitar spinner infinito
      setProcessingOpen(false);
      if (error.response?.status === 413) {
        alert('Imagem muito grande! Tente com uma imagem menor (máx 5MB).');
      } else if (error.response?.status === 400) {
        alert(error.response?.data?.erro || 'Imagem inválida ou corrompida. Verifique o arquivo e tente novamente.');
      } else {
        alert(error.response?.data?.erro || 'Erro ao enviar redação. Tente novamente.');
      }
    } finally {
      setUploadLoading(false);
    }
  };

  // crop removed: attachments are sent as full image or URL

  const convertFileToBase64 = (file: File, selectionParam: { x: number; y: number; w: number; h: number } | null): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context unavailable');

            const sw = img.naturalWidth, sh = img.naturalHeight;
            // If there is a selection (coords relative to displayed image), map to natural size
            if (selectionParam && imgPreviewRef.current) {
              const disp = imgPreviewRef.current.getBoundingClientRect();
              const scaleX = sw / disp.width;
              const scaleY = sh / disp.height;
              const sx = Math.max(0, Math.floor(selectionParam.x * scaleX));
              const sy = Math.max(0, Math.floor(selectionParam.y * scaleY));
              const swidth = Math.max(1, Math.floor(selectionParam.w * scaleX));
              const sheight = Math.max(1, Math.floor(selectionParam.h * scaleY));
              canvas.width = swidth;
              canvas.height = sheight;
              ctx.drawImage(img, sx, sy, swidth, sheight, 0, 0, swidth, sheight);
            } else {
              canvas.width = sw;
              canvas.height = sh;
              ctx.drawImage(img, 0, 0, sw, sh);
            }

            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (e) => reject(new Error('Falha ao carregar imagem para crop'));
        img.src = reader.result as string;
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem (JPG, PNG, etc.)');
      return;
    }
    
    // Verificar tamanho do arquivo (limite: 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB em bytes
    if (file.size > maxSize) {
      alert('Arquivo muito grande! Por favor, use uma imagem menor que 5MB.');
      return;
    }
    
    setSelectedFile(file);
    setNewRedacao({ ...newRedacao, imagemUrl: '' });
    // abrir automaticamente a aba/modal de preview ao anexar a imagem
    setShowUploadModal(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
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

  const redacoesHoje = redacoes.filter(r => 
    new Date(r.criadoEm).toDateString() === new Date().toDateString()
  ).length;

  const pendentes = redacoes.filter(r => 
    r.textoExtraido && r.textoExtraido.trim() !== '' && !r.notaFinal
  ).length;

  const corrigidas = redacoes.filter(r => r.notaFinal).length;

  const processando = redacoes.filter(r => 
    !r.textoExtraido || r.textoExtraido.trim() === ''
  ).length;

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
            <button onClick={() => { /* navegar futuramente */ }} className="text-gray-600 hover:text-gray-800 bg-transparent">Dashboard</button>
            <button onClick={() => { /* navegar futuramente */ }} className="text-gray-600 hover:text-gray-800 bg-transparent">Redações</button>
            <button onClick={() => { /* navegar futuramente */ }} className="text-gray-600 hover:text-gray-800 bg-transparent">Turmas</button>
            <button onClick={() => { /* navegar futuramente */ }} className="text-gray-600 hover:text-gray-800 bg-transparent">Relatórios</button>
          </nav>

          <div className="flex items-center space-x-4">
            <div className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
              PF
            </div>
            <span className="text-gray-700">Prof. Fernando</span>
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

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estatísticas */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <span className="text-xl">📊</span>
            <h2 className="text-lg font-bold text-gray-800">Estatísticas</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Redações Hoje</p>
              <p className="text-3xl font-bold text-blue-600">{redacoesHoje}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Processando</p>
              <p className="text-3xl font-bold text-orange-600">{processando}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Pendentes</p>
              <p className="text-3xl font-bold text-yellow-600">{pendentes}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Corrigidas</p>
              <p className="text-3xl font-bold text-green-600">{corrigidas}</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🛠️</span>
              <h3 className="font-bold text-gray-800">Ferramentas</h3>
            </div>
            
            <button
              onClick={() => setShowUploadModal(true)}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 mb-2"
            >
              📷 OCR Scanner
            </button>
            
            <button className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 mb-2">
              📊 Relatórios IA
            </button>
            
            <button className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300">
              👥 Gerenciar Turmas
            </button>
          </div>
        </div>

        {/* Área Principal */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
            <p className="text-green-800 text-sm">
              ✨ Texto analisado com sucesso!!
            </p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <span className="text-xl">📝</span>
              <h2 className="text-lg font-bold text-gray-800">Enviar Nova Redação</h2>
            </div>

            <div 
              className={`border-2 border-dashed rounded-lg p-8 mb-6 transition-colors cursor-pointer ${
                isDragging 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-300 hover:border-purple-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="text-center">
                <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📄</span>
                </div>
                {selectedFile ? (
                  <div>
                    <p className="text-green-600 font-medium mb-2">✅ Arquivo selecionado:</p>
                    <p className="text-gray-700 text-sm">{selectedFile.name}</p>
                    <p className="text-gray-500 text-xs">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="mt-2 text-red-600 hover:text-red-800 text-sm"
                    >
                      Remover arquivo
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-2">Arraste a redação escaneada aqui</p>
                    <p className="text-gray-500 text-sm">ou clique para selecionar arquivo</p>
                    <p className="text-gray-400 text-xs mt-2">Suporta: JPG, PNG, GIF, WebP | Máx: 5MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Aluno:</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option>Selecionar aluno...</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Padrão de Correção:</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option>ENEM</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowUploadModal(true)}
              className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 mb-4"
            >
              🤖 Processar com IA
            </button>

            <div className="bg-purple-600 text-white p-4 rounded-lg">
              <h3 className="font-bold mb-2">🚀 Análise IA em Tempo Real</h3>
              <p className="text-sm mb-2">Sistema pronto para processar redação manuscrita</p>
              <div className="space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-green-300">✅</span>
                  <span>OCR Engine: Ativo</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-300">✅</span>
                  <span>Corretor IA: Standby</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Redações Recentes */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📄</span>
                <h2 className="text-lg font-bold text-gray-800">Redações Recentes</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  Atualizado: {lastUpdate.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
                <button 
                  onClick={() => loadRedacoes()}
                  className="text-purple-600 hover:text-purple-700 text-sm flex items-center gap-1"
                >
                  🔄 Atualizar
                </button>
                <button className="text-purple-600 hover:text-purple-700 text-sm">
                  Ver Todas
                </button>
              </div>
            </div>          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Carregando...</p>
            </div>
          ) : redacoes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Nenhuma redação encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {redacoes.slice(0, 3).map((redacao) => (
                <div key={redacao.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-800">{redacao.titulo}</h3>
                    <span className={`text-xs font-medium flex items-center gap-1 ${getStatusColor(redacao)}`}>
                      {getStatusIcon(redacao)} {getStatusText(redacao)}
                    </span>
                  </div>
                  
                  {/* Feedback visual baseado no status */}
                      {isOcrProcessing(redacao) && (
                          <div className="mb-2">
                              <div className="flex items-center gap-2 text-yellow-600">
                                  <div className="animate-spin w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                                  <span className="text-sm">Processando OCR...</span>
                              </div>
                          </div>
                      )}

                      {isOcrNoText(redacao) && (
                          <div className="mb-2 text-orange-600 text-sm">
                              ⚠️ OCR finalizado, nenhum texto legível foi detectado.
                          </div>
                      )}
                  
                  {/* Preview do texto extraído */}
                  {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                    <div className="mb-2 p-2 bg-gray-50 rounded text-xs">
                      <p className="text-gray-600 font-medium mb-1">Texto extraído:</p>
                      <p className="text-gray-700 line-clamp-2">
                        {redacao.textoExtraido.substring(0, 100)}
                        {redacao.textoExtraido.length > 100 && '...'}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {new Date(redacao.criadoEm).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(redacao.criadoEm).toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                    <div className="flex gap-2">
                      {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                        <>
                          <button 
                            onClick={() => abrirAnalise(redacao.id.toString())}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium bg-purple-50 px-2 py-1 rounded"
                          >
                            📊 Análise
                          </button>
                          <button 
                            onClick={() => abrirTexto(redacao)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 px-2 py-1 rounded"
                          >
                            📄 Ver Texto
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteRedacao(redacao.id)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-purple-50 rounded-lg">
            <h3 className="font-bold text-purple-800 mb-2">📋 Critérios ENEM</h3>
            <div className="space-y-1 text-sm text-purple-700">
              <div>C1: Domínio da escrita formal</div>
              <div>C2: Compreensão do tema</div>
              <div>C3: Argumentação consistente</div>
              <div>C4: Mecanismos linguísticos</div>
              <div>C5: Proposta de intervenção</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Enviar Nova Redação</h3>
            
            <form onSubmit={handleCreateRedacao} className="space-y-4">
              {selectedFile && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Preview da Imagem</h4>
                    <p className="text-xs text-gray-500 mb-2">A imagem será enviada inteira para o OCR. Se preferir, cole uma URL da imagem abaixo.</p>
                    <div className="relative bg-white border rounded-md overflow-hidden" style={{ maxWidth: 520 }}>
                      <img
                        ref={el => { if (el) imgPreviewRef.current = el; }}
                        src={URL.createObjectURL(selectedFile)}
                        alt="Preview"
                        className="w-full h-auto max-h-[360px] object-contain"
                      />
                    </div>
                  </div>
                )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título da Redação
                </label>
                <input
                  type="text"
                  value={newRedacao.titulo}
                  onChange={(e) => setNewRedacao({ ...newRedacao, titulo: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Ex: Redação sobre sustentabilidade"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL da Imagem (opcional)
                </label>
                <input
                  type="url"
                  value={newRedacao.imagemUrl}
                  onChange={(e) => setNewRedacao({ ...newRedacao, imagemUrl: e.target.value })}
                  disabled={!!selectedFile}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="https://exemplo.com/imagem.jpg (ou use upload acima)"
                />
                {selectedFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    URL desabilitada - usando arquivo selecionado
                  </p>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setNewRedacao({ titulo: '', imagemUrl: '' });
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading || (!selectedFile && !newRedacao.imagemUrl)}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

  {/* Modal de Processamento */}
  <ProcessingModal isOpen={processingOpen} step={processingStep} details={processingDetails} />

      {/* Modal de Análise */}
      {redacaoAnaliseId && (
        <AnaliseRedacao
          redacaoId={redacaoAnaliseId}
          isVisible={analiseModalOpen}
          onClose={fecharAnalise}
          onProgress={(step, details) => {
            setProcessingOpen(true);
            setProcessingStep(step);
            setProcessingDetails(details);
            try {
              const s = (step || '').toString().toLowerCase();
              if (s.includes('conclu') || s.includes('concluído') || s.includes('concluida')) {
                // quando análise concluída, fechar modal de processamento
                setProcessingOpen(false);
              }
            } catch (e) {
              // ignore
            }
          }}
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

export default Dashboard;