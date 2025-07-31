import { Router } from 'express';
import {
    criarAvaliacao,
    listarAvaliacoes,
    buscarAvaliacao,
    atualizarAvaliacao,
    deletarAvaliacao,
} from '../controllers/avaliacaoController';

const router = Router();

router.post('/', criarAvaliacao);
router.get('/', listarAvaliacoes);
router.get('/:id', buscarAvaliacao);
router.put('/:id', atualizarAvaliacao);
router.delete('/:id', deletarAvaliacao);

export default router;
