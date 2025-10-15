import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { redacaoService, authService } from '../services/api';
import { Redacao } from '../types';
import AnaliseRedacao from '../components/AnaliseRedacao';
import VisualizarTexto from '../components/VisualizarTexto';
import ProcessingModal from '../components/ProcessingModal';
import GraficoEvolucao from '../components/GraficoEvolucao';

interface DashboardProps {
    onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
    const navigate = useNavigate();
    const [redacoes, setRedacoes] = useState<Redacao[]>([]);
    const [enemScores, setEnemScores] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
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
                        const nota = resp?.analise?.notaFinal1000 ?? null;
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
        // Carregar dados do usuário do localStorage
        const user = authService.getUser();
        setCurrentUser(user);

        // Primeira chamada mostra loading
        loadRedacoes(true);
    }, [loadRedacoes]);

    // Auto-refresh das estatísticas a cada 5 segundos
    useEffect(() => {
        const interval = setInterval(() => {
            loadRedacoes(false); // Atualiza sem mostrar loading
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
            // Abrir modal de processamento com etapa inicial
            setProcessingOpen(true);
            setProcessingStep('Preparando processamento');
            setProcessingDetails('Iniciando análise da redação...');
            
            // Passo 1: Upload e OCR
            let created: Redacao;
            if (selectedFile) {
                const fd = new FormData();
                fd.append('titulo', newRedacao.titulo);
                fd.append('file', selectedFile);
                setProcessingStep('Extraindo texto da imagem');
                setProcessingDetails('🔍 Aplicando OCR com Google Vision...');
                created = await redacaoService.createWithFile(fd);
            } else {
                let imagemUrl = newRedacao.imagemUrl;
                setProcessingStep('Extraindo texto da imagem');
                setProcessingDetails('🔍 Aplicando OCR com Google Vision...');
                created = await redacaoService.create({ titulo: newRedacao.titulo, imagemUrl: imagemUrl });
            }

            // Passo 2: Mostrar que a correção foi aplicada
            setProcessingStep('Texto extraído com sucesso!');
            setProcessingDetails('🤖 Texto corrigido automaticamente com GPT e análise ENEM iniciada...');
            
            // Limpar formulário
            setNewRedacao({ titulo: '', imagemUrl: '' });
            setSelectedFile(null);
            setShowUploadModal(false);
            loadRedacoes();

            // Passo 3: Abrir modal de análise automaticamente
            setTimeout(() => {
                setProcessingStep('Abrindo resultados');
                setProcessingDetails('✅ Processamento completo! Visualizando análise...');
                
                setTimeout(() => {
                    setProcessingOpen(false);
                    setRedacaoAnaliseId(created.id);
                    setAnaliseModalOpen(true);
                    setShowSuccessMessage(true);
                    setTimeout(() => setShowSuccessMessage(false), 3000);
                }, 1000);
            }, 1500);

        } catch (error: any) {
            console.error('Erro ao enviar redação:', error);
            setProcessingOpen(false);
            if (error.response?.status === 413) {
                alert('Imagem muito grande! Tente com uma imagem menor (máx 10MB).');
            } else if (error.response?.status === 400) {
                alert(error.response?.data?.erro || 'Imagem inválida ou corrompida. Verifique o arquivo e tente novamente.');
            } else {
                alert(error.response?.data?.erro || 'Erro ao enviar redação. Tente novamente.');
            }
        } finally {
            setUploadLoading(false);
        }
    };

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione apenas arquivos de imagem (JPG, PNG, etc.)');
            return;
        }

        // ✨ OTIMIZAÇÃO: Limite de upload aumentado para 10MB
        const maxSize = 10 * 1024 * 1024; // 10MB em bytes
        if (file.size > maxSize) {
            alert('Arquivo muito grande! Por favor, use uma imagem menor que 10MB.');
            return;
        }

        setSelectedFile(file);
        setNewRedacao({ ...newRedacao, imagemUrl: '' });
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
                        <button onClick={() => navigate('/dashboard')} className="text-purple-600 font-semibold bg-transparent">Dashboard</button>
                        <button onClick={() => navigate('/redacoes')} className="text-gray-600 hover:text-gray-800 bg-transparent">Redações</button>
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

            <div className="max-w-7xl mx-auto p-4 space-y-4">
                {/* Layout em grid 2x2 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[calc(100vh-160px)]">
                    
                    {/* Anexar imagem - Área grande superior esquerda */}
                    <div className="lg:col-span-2 lg:row-span-1">
                        <div className="bg-white rounded-lg shadow-lg p-6 overflow-y-auto flex flex-col h-full">
                            {showSuccessMessage && (
                                <div className="bg-green-50 border border-green-200 p-3 rounded-lg mb-4">
                                    <div className="flex justify-between items-center">
                                        <p className="text-green-800 text-sm">
                                            ✨ Texto analisado com sucesso!!
                                        </p>
                                        <button
                                            onClick={() => setShowSuccessMessage(false)}
                                            className="text-green-600 hover:text-green-800"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="text-center flex-1 flex flex-col justify-center">
                                <div className="flex items-center justify-center space-x-2 mb-6">
                                    <span className="text-2xl">📝</span>
                                    <h2 className="text-2xl font-bold text-gray-800">Anexar Imagem</h2>
                                </div>

                                <div
                                    className={`border-2 border-dashed rounded-lg p-12 mb-6 transition-colors cursor-pointer ${isDragging
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
                                        <div className="bg-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <span className="text-3xl">📄</span>
                                        </div>
                                        {selectedFile ? (
                                            <div>
                                                <p className="text-green-600 font-medium mb-3 text-lg">✅ Arquivo selecionado:</p>
                                                <p className="text-gray-700 text-base font-medium">{selectedFile.name}</p>
                                                <p className="text-gray-500 text-sm">
                                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedFile(null);
                                                    }}
                                                    className="mt-3 text-red-600 hover:text-red-800 text-sm"
                                                >
                                                    Remover arquivo
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-gray-600 mb-3 text-lg">Arraste a redação aqui</p>
                                                <p className="text-gray-500 text-base">ou clique para selecionar</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowUploadModal(true)}
                                    className="w-full bg-purple-600 text-white py-4 px-8 rounded-lg hover:bg-purple-700 mb-8 text-lg font-semibold"
                                >
                                    🤖 Processar com IA
                                </button>

                                <div className="bg-purple-600 text-white p-6 rounded-lg">
                                    <h3 className="font-bold mb-4 text-lg">🚀 Análise IA</h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-center justify-center space-x-2">
                                            <span className="text-green-300">✅</span>
                                            <span>OCR Engine: Ativo</span>
                                        </div>
                                        <div className="flex items-center justify-center space-x-2">
                                            <span className="text-green-300">✅</span>
                                            <span>Corretor IA: Standby</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Redações recentes - Superior direita */}
                    <div className="lg:col-span-1 lg:row-span-2">
                        <div className="bg-white rounded-lg shadow-lg p-4 overflow-y-auto flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                    <span className="text-xl">📄</span>
                                    <h2 className="text-lg font-bold text-gray-800">Redações Recentes</h2>
                                </div>
                                <button
                                    onClick={() => loadRedacoes()}
                                    className="text-purple-600 hover:text-purple-700 text-xs flex items-center gap-1"
                                >
                                    🔄
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col justify-start">
                                {loading ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500 text-sm">Carregando...</p>
                                    </div>
                                ) : redacoes.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500 text-sm">Nenhuma redação encontrada</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {redacoes.slice(0, 5).map((redacao) => (
                                            <div key={redacao.id} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex-1">
                                                        <h3 className="font-medium text-gray-800 text-sm">{redacao.titulo}</h3>
                                                        {/* Mostrar nota ENEM se disponível */}
                                                        {enemScores[redacao.id] && (
                                                            <div className="mt-1">
                                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                    🏆 Nota ENEM: {enemScores[redacao.id]}/1000
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-medium flex items-center gap-1 ${getStatusColor(redacao)}`}>
                                                        {getStatusIcon(redacao)} {getStatusText(redacao)}
                                                    </span>
                                                </div>

                                                {isOcrProcessing(redacao) && (
                                                    <div className="mb-3">
                                                        <div className="flex items-center gap-2 text-yellow-600">
                                                            <div className="animate-spin w-3 h-3 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                                                            <span className="text-xs">Processando...</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {isOcrNoText(redacao) && (
                                                    <div className="mb-3 text-orange-600 text-xs">
                                                        ⚠️ Nenhum texto detectado
                                                    </div>
                                                )}

                                                {/* Preview do texto extraído */}
                                                {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                                                    <div className="mb-3 p-3 bg-gray-50 rounded text-xs">
                                                        <p className="text-gray-700 line-clamp-2">
                                                            {redacao.textoExtraido}
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(redacao.criadoEm).toLocaleDateString('pt-BR')}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        {redacao.textoExtraido && redacao.textoExtraido.trim() !== '' && (
                                                            <>
                                                                <button
                                                                    onClick={() => abrirAnalise(redacao.id.toString())}
                                                                    className="text-purple-600 hover:text-purple-800 text-xs font-medium bg-purple-50 px-2 py-1 rounded"
                                                                >
                                                                    📊
                                                                </button>
                                                                <button
                                                                    onClick={() => abrirTexto(redacao)}
                                                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 px-2 py-1 rounded"
                                                                >
                                                                    📄
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeleteRedacao(redacao.id)}
                                                            className="text-red-600 hover:text-red-800 text-xs"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                                <h3 className="font-bold text-purple-800 mb-3 text-sm text-center">📋 Critérios ENEM</h3>
                                <div className="space-y-2 text-xs text-purple-700 text-center">
                                    <div>C1: Escrita formal</div>
                                    <div>C2: Compreensão</div>
                                    <div>C3: Argumentação</div>
                                    <div>C4: Mecanismos</div>
                                    <div>C5: Proposta</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Estatísticas - Inferior esquerda */}
                    <div className="lg:col-span-1 lg:row-span-1">
                        <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col justify-center h-full">
                            <div className="flex items-center justify-center space-x-2 mb-6">
                                <span className="text-xl">📊</span>
                                <h2 className="text-lg font-bold text-gray-800">Estatísticas</h2>
                            </div>

                            <div className="grid grid-cols-2 gap-4 flex-1 items-center">
                                <div className="text-center p-4 bg-blue-50 rounded-lg">
                                    <p className="text-xs text-gray-600 mb-2">Hoje</p>
                                    <p className="text-2xl font-bold text-blue-600">{redacoesHoje}</p>
                                </div>

                                <div className="text-center p-4 bg-orange-50 rounded-lg">
                                    <p className="text-xs text-gray-600 mb-2">Processando</p>
                                    <p className="text-2xl font-bold text-orange-600">{processando}</p>
                                </div>

                                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                                    <p className="text-xs text-gray-600 mb-2">Pendentes</p>
                                    <p className="text-2xl font-bold text-yellow-600">{pendentes}</p>
                                </div>

                                <div className="text-center p-4 bg-green-50 rounded-lg">
                                    <p className="text-xs text-gray-600 mb-2">Corrigidas</p>
                                    <p className="text-2xl font-bold text-green-600">{corrigidas}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Gráficos de melhora - Inferior direita */}
                    <div className="lg:col-span-1 lg:row-span-1">
                        <GraficoEvolucao redacoes={redacoes} />
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
                                    <p className="text-xs text-gray-500 mb-2">A imagem será enviada inteira para o OCR.</p>
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
                                // quando análise concluída, fechar modal de processamento e mostrar sucesso
                                setProcessingOpen(false);
                                setShowSuccessMessage(true);
                                // Auto-hide depois de 5 segundos
                                setTimeout(() => setShowSuccessMessage(false), 5000);
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