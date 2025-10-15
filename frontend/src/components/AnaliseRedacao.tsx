import React, { useState, useEffect, useCallback, useRef } from 'react';
import { redacaoService } from '../services/api';

// Estrutura de dados final, sincronizada com o backend
interface DetalheCompetencia {
    nome: string; nota: number; comentario: string; pontosFortes: string[]; pontosAMelhorar: string[];
}
interface AnaliseENEM {
    notaFinal1000: number; tesePrincipal: string; tituloSugerido: string; comentarioGeral: string;
    competencias: { c1: DetalheCompetencia; c2: DetalheCompetencia; c3: DetalheCompetencia; c4: DetalheCompetencia; c5: DetalheCompetencia; };
}

interface AnaliseRedacaoProps {
    redacaoId: string;
    isVisible: boolean;
    onClose: () => void;
    onProgress?: (step: string, details?: string) => void;
}

const AnaliseRedacao: React.FC<AnaliseRedacaoProps> = ({ redacaoId, isVisible, onClose, onProgress }) => {
    const [analise, setAnalise] = useState<AnaliseENEM | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const fetchAnalysis = async () => {
        try {
            const response = await redacaoService.getAnaliseEnem(redacaoId);

            if (response.status === 'running') {
                onProgress?.('Analisando redação', 'A IA está avaliando o texto...');
                return;
            }

            if (response.status === 'completed' && response.analise) {
                stopPolling();
                setAnalise(response.analise);
                setIsLoading(false);
                setError(null);
                onProgress?.('Análise Concluída!', '');
            }
        } catch (err: any) {
            setError(err.message || 'Não foi possível carregar a análise.');
            setIsLoading(false);
            onProgress?.('Erro na Análise', err.message);
            stopPolling();
        }
    };

    useEffect(() => {
        if (isVisible && redacaoId) {
            setIsLoading(true);
            setAnalise(null);
            setError(null);

            fetchAnalysis(); // Primeira chamada imediata

            const intervalId = setInterval(fetchAnalysis, 5000);
            pollRef.current = intervalId;

            const timeoutId = setTimeout(() => {
                if (pollRef.current) { // Verifica se o polling ainda está ativo antes de setar o erro
                    stopPolling();
                    setError("A análise excedeu o tempo limite. Por favor, feche e tente novamente.");
                    setIsLoading(false);
                    onProgress?.('Erro', 'Tempo limite excedido');
                }
            }, 60000); // Timeout de 60 segundos

            return () => { // Função de limpeza
                stopPolling();
                clearTimeout(timeoutId);
            };
        }
        // Removida dependência de fetchAnalysis para evitar loops infinitos
    }, [isVisible, redacaoId]);

    const renderCompetencia = (c: DetalheCompetencia, key: string) => (
        <div key={key} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
            <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                <h4 className="font-bold text-gray-800 flex-1">{c.nome}</h4>
                <span className="text-2xl font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">{c.nota}</span>
            </div>
            <p className="text-sm text-gray-600 italic mb-4">"{c.comentario}"</p>
            {c.pontosFortes && c.pontosFortes.length > 0 && (
                <div className="mb-3">
                    <h5 className="text-sm font-semibold text-green-700 mb-1">Pontos Fortes:</h5>
                    <ul className="list-disc list-inside text-sm text-green-800 space-y-1">
                        {c.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                </div>
            )}
            {c.pontosAMelhorar && c.pontosAMelhorar.length > 0 && (
                <div>
                    <h5 className="text-sm font-semibold text-red-700 mb-1">Pontos a Melhorar:</h5>
                    <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                        {c.pontosAMelhorar.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-100 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">📊 Análise Inteligente da Redação</h2>
                    <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold">×</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {isLoading && (
                        <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                            <p className="text-gray-600">Carregando análise...</p>
                            <p className="text-xs text-gray-400 mt-2">Isso pode levar até um minuto.</p>
                        </div>
                    )}
                    {error && (
                        <div className="text-center py-12">
                            <p className="font-bold text-lg text-red-600 mb-2">Ocorreu um Erro</p>
                            <p className="text-gray-700">{error}</p>
                        </div>
                    )}

                    {analise && (
                        <div className="space-y-6">
                            <div className="text-center border-b pb-4">
                                <p className="text-sm text-gray-500">Nota Final (0-1000)</p>
                                <p className="text-6xl font-bold text-blue-600">{analise.notaFinal1000}</p>
                                {analise.tituloSugerido && <p className="text-md text-gray-700 mt-2"><strong>Título Sugerido:</strong> {analise.tituloSugerido}</p>}
                            </div>

                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h3 className="font-semibold text-gray-800 mb-2">Comentário Geral do Corretor</h3>
                                <p className="text-sm text-gray-600">{analise.comentarioGeral}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h3 className="font-semibold text-gray-800 mb-2">Tese Principal Identificada</h3>
                                <p className="text-sm text-gray-600 italic">"{analise.tesePrincipal}"</p>
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Análise por Competência</h3>
                                <div className="space-y-4">
                                    {analise.competencias.c1 && renderCompetencia(analise.competencias.c1, "c1")}
                                    {analise.competencias.c2 && renderCompetencia(analise.competencias.c2, "c2")}
                                    {analise.competencias.c3 && renderCompetencia(analise.competencias.c3, "c3")}
                                    {analise.competencias.c4 && renderCompetencia(analise.competencias.c4, "c4")}
                                    {analise.competencias.c5 && renderCompetencia(analise.competencias.c5, "c5")}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-gray-200 px-6 py-3 flex justify-end border-t">
                    <button onClick={onClose} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default AnaliseRedacao;