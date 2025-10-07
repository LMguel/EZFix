import React from 'react';

interface Props {
  isOpen: boolean;
  step?: string;
  details?: string;
}

const ProcessingModal: React.FC<Props> = ({ isOpen, step = 'Preparando', details = '' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h3 className="text-lg font-bold mb-2">🔄 Processando Redação</h3>
        <p className="text-sm text-gray-600 mb-4">O sistema está executando várias etapas para obter o melhor resultado possível.</p>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mt-1"></div>
            <div>
              <div className="font-medium">{step}</div>
              <div className="text-xs text-gray-500">{details}</div>
            </div>
          </div>

          <ul className="text-sm text-gray-600 list-disc list-inside">
            <li>Pré-processamento da imagem (ajuste de contraste e redução de ruído)</li>
            <li>Divisão em segmentos se necessário para melhor OCR</li>
            <li>Extração de texto com OCR otimizado</li>
            <li>Análise com GPT (ENEM) para feedback detalhado</li>
          </ul>
        </div>

        <div className="mt-6 text-right">
          <button className="px-4 py-2 bg-gray-200 rounded" disabled>Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default ProcessingModal;
