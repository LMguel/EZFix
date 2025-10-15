import React from 'react';
import { Redacao } from '../types'; // Importando o tipo central

interface VisualizarTextoProps {
    isVisible: boolean;
    onClose: () => void;
    redacao: Redacao | null; // Usando o tipo Redacao completo
}

const VisualizarTexto: React.FC<VisualizarTextoProps> = ({ isVisible, onClose, redacao }) => {
    if (!isVisible || !redacao) return null;

    const textoLimpo = redacao.textoExtraido || '';
    const palavrasDetectadas = textoLimpo.split(/\s+/).filter(p => p.trim().length > 0).length;
    const linhasDetectadas = textoLimpo.split('\n').filter(l => l.trim().length > 0).length;

    // MUDANÇA: Usando a nota final da análise ENEM e convertendo para escala 0-10
    const notaFinalExibicao = redacao.notaFinal ? (redacao.notaFinal / 100).toFixed(1) : 'N/A';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold">📄 Texto Extraído pela IA</h2>
                        <p className="text-blue-100 text-sm">{redacao.titulo}</p>
                    </div>
                    <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold">×</button>
                </div>

                {/* Stats */}
                <div className="bg-gray-50 p-4 border-b">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{palavrasDetectadas}</div>
                            <div className="text-sm text-gray-600">Palavras</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{linhasDetectadas}</div>
                            <div className="text-sm text-gray-600">Linhas</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">{notaFinalExibicao}</div>
                            <div className="text-sm text-gray-600">Nota Final (0-10)</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">{textoLimpo.length}</div>
                            <div className="text-sm text-gray-600">Caracteres</div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {textoLimpo ? (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-3">🔍 Texto como foi lido e formatado:</h3>
                            <div className="bg-gray-50 border rounded-lg p-4">
                                {/* MUDANÇA: Simplificado para exibir o texto que já vem limpo do backend */}
                                <pre className="whitespace-pre-wrap font-sans text-base text-gray-800 leading-relaxed">
                                    {textoLimpo}
                                </pre>
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
                <div className="bg-gray-100 px-6 py-3 flex justify-between items-center border-t">
                    <div className="text-sm text-gray-500">
                        Processado em: {new Date(redacao.criadoEm).toLocaleString('pt-BR')}
                    </div>
                    <button onClick={onClose} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VisualizarTexto;