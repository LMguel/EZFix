export interface User {
  id: string;
  nome: string;
  email: string;
  criadoEm: string;
}

export interface Redacao {
  id: string;
  titulo: string;
  imagemUrl: string;
  tema?: string;
  textoExtraido?: string;
  notaGerada?: number;
  notaFinal?: number;
  feedback?: string;
  sugestoes?: string;
  criadoEm: string;
  usuarioId: string;
  avaliacoes: Avaliacao[];
}

export interface Avaliacao {
  id: string;
  competencia: number;
  notaComp: number;
  comentario?: string;
  redacaoId: string;
}

export interface LoginRequest {
  email: string;
  senha: string;
}

export interface RegisterRequest {
  nome: string;
  email: string;
  senha: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateRedacaoRequest {
  titulo: string;
  imagemUrl: string;
}

export interface CreateAvaliacaoRequest {
  competencia: number;
  notaComp: number;
  comentario?: string;
  redacaoId: string;
}