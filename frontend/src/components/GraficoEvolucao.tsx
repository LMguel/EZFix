import React from 'react';
import { Redacao } from '../types';

interface GraficoEvolucaoProps {
    redacoes: Redacao[];
}

const GraficoEvolucao: React.FC<GraficoEvolucaoProps> = ({ redacoes }) => {
    // Filtrar redações com nota e ordenar por data
    const redacoesComNota = redacoes
        .filter(r => r.notaFinal)
        .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())
        .slice(-10); // Últimas 10 redações

    if (redacoesComNota.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-lg p-6 h-full flex flex-col">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📈 Evolução das Notas</h3>
                <div className="text-center py-8 text-gray-500 flex-1 flex flex-col justify-center">
                    <div className="text-4xl mb-2">📊</div>
                    <p>Nenhuma redação corrigida ainda</p>
                    <p className="text-sm mt-1">Envie suas primeiras redações!</p>
                </div>
            </div>
        );
    }

    const maxNota = Math.max(...redacoesComNota.map(r => r.notaFinal || 0));
    const minNota = Math.min(...redacoesComNota.map(r => r.notaFinal || 0));

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 mb-4">📈 Evolução das Notas</h3>
            
            {/* Estatísticas Rápidas */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-blue-50 rounded">
                    <div className="text-xl font-bold text-blue-600">{redacoesComNota.length}</div>
                    <div className="text-xs text-gray-600">Redações</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                    <div className="text-xl font-bold text-green-600">{maxNota}</div>
                    <div className="text-xs text-gray-600">Maior Nota</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                    <div className="text-xl font-bold text-purple-600">
                        {(redacoesComNota.reduce((acc, r) => acc + (r.notaFinal || 0), 0) / redacoesComNota.length).toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-600">Média</div>
                </div>
            </div>

            {/* Gráfico Simples */}
            <div className="relative flex-1 min-h-32 border-l-2 border-b-2 border-gray-300 mb-4">
                {redacoesComNota.map((redacao, index) => {
                    const altura = ((redacao.notaFinal || 0) / 1000) * 100; // Altura em %
                    const largura = 100 / redacoesComNota.length; // Largura da barra
                    
                    return (
                        <div
                            key={redacao.id}
                            className="absolute bottom-0 bg-blue-500 hover:bg-blue-600 transition-colors"
                            style={{
                                left: `${index * largura}%`,
                                width: `${largura - 2}%`,
                                height: `${altura}%`,
                                minHeight: '4px'
                            }}
                            title={`${redacao.titulo}: ${redacao.notaFinal}/1000`}
                        />
                    );
                })}
            </div>

            {/* Labels do Eixo X */}
            <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{new Date(redacoesComNota[0].criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                <span>{new Date(redacoesComNota[redacoesComNota.length - 1].criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </div>

            {/* Tendência */}
            {redacoesComNota.length >= 2 && (
                <div className="mt-4 p-3 bg-gray-50 rounded text-center">
                    {(redacoesComNota[redacoesComNota.length - 1].notaFinal || 0) > (redacoesComNota[0].notaFinal || 0) ? (
                        <span className="text-green-600 text-sm">📈 Tendência de melhoria!</span>
                    ) : (
                        <span className="text-blue-600 text-sm">📊 Continue praticando!</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default GraficoEvolucao;