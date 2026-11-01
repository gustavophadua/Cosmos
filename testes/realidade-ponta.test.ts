/**
 * A camada de fatos de ponta a ponta, com o modelo local de verdade: o texto em português passa pela tradução cega
 * (qwen3:4b no Ollama), pelo Z3 e pela base de fatos. Só roda quando chamado, em duas fases (o modelo e o Z3 não cabem
 * juntos na memória):
 *   REALIDADE_PONTA=traduzir  e depois  REALIDADE_PONTA=conferir
 * As frases são públicas, escritas aqui; o resultado vai para tmp/realidade-ponta/ (fora do Git).
 */
import { it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { criarAdaptadorOllama, descarregarModeloOllama } from '../src/integracoes/provedores/ollama'
import { ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, lerProposta } from '../src/motor/formalizacao'
import { separarArgumento } from '../src/interfaces/assistente'
import { confrontarRealidade } from '../src/motor/realidade'
import type { Item } from '../src/motor/avaliacao'

const FASE = process.env.REALIDADE_PONTA, PASTA = 'tmp/realidade-ponta'
const FRASES = [
  'O celular esquentou. Logo, está com vírus.',
  'Ana é uma pessoa. Logo, Ana voa.',
  'Todo ser humano pode morrer. Logo, todo ser humano voa.',
  'O notebook ficou no sol. Logo, o notebook esquentou.',
  'As pessoas veem as outras como deuses. Logo, as pessoas sofrem.',
  // as frases do Gustavo (01/11/2026)
  'pessoa tem experiencia, logo ela só consegue ver o que as experiencias mostram, logo as experiencias que ela tem não é todas as experiencias que acontecem, logo ela está limitada o que ve',
  'Toda pessoa é parte do todo. Logo, toda pessoa está limitada no que vê.',
]
// REALIDADE_PONTA_SO=5,6 roda só essas frases (pelos índices)
const ESCOLHIDAS = process.env.REALIDADE_PONTA_SO ? process.env.REALIDADE_PONTA_SO.split(',').map(Number) : null

it.runIf(FASE === 'traduzir')('ponta a ponta, fase 1: o modelo local traduz', async () => {
  mkdirSync(PASTA, { recursive: true })
  const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
  const base = { modelo: 'qwen3:4b', temperatura: 0, semente: 0, contexto: 4096 }
  const premissas = criarAdaptadorOllama({ ...base, formato: ESQUEMA_PREMISSAS }), conclusao = criarAdaptadorOllama({ ...base, formato: ESQUEMA_CONCLUSAO })
  const saida: unknown[] = []
  for (const frase of FRASES.filter((_, i) => !ESCOLHIDAS || ESCOLHIDAS.includes(i))) {
    const t = separarArgumento(frase)
    if (!t) { saida.push({ frase, erro: 'não separou' }); continue }
    const inicio = Date.now()
    const r = await formalizarCego(premissas, conclusao, t, null, exemplos)
    let proposta: unknown = null, erro: string | null = null
    try { proposta = lerProposta(r.conteudo, null) } catch (e) { erro = (e as Error).message }
    saida.push({ frase, texto: t, proposta, erro, ms: Date.now() - inicio })
    writeFileSync(`${PASTA}/traducoes.json`, JSON.stringify(saida, null, 2) + '\n')
  }
  await descarregarModeloOllama('qwen3:4b').catch(() => undefined)
}, 3_600_000)

it.runIf(FASE === 'conferir' && existsSync(`${PASTA}/traducoes.json`))('ponta a ponta, fase 2: Z3 e base de fatos', async () => {
  const z3 = await import('z3-solver'); const api = await z3.init()
  const { classificar } = await import('../src/motor/avaliacaoZ3')
  const traducoes = JSON.parse(readFileSync(`${PASTA}/traducoes.json`, 'utf8')) as { frase: string; texto: { premissas: string[]; conclusao: string }; proposta: { vocabulario: never[]; premissas: string[]; conclusao: string } | null }[]
  const saida: unknown[] = []
  for (const x of traducoes) {
    if (!x.proposta) { saida.push({ frase: x.frase, erro: 'sem tradução' }); continue }
    const logica = await classificar(api, x.proposta.vocabulario, x.proposta.premissas, x.proposta.conclusao, 5_000).catch((e) => `erro: ${(e as Error).message}`)
    const inicio = Date.now()
    const realidade = await confrontarRealidade((v, ps, c) => classificar(api, v, ps, c, 5_000), x.proposta, x.texto).catch((e) => ({ erro: (e as Error).message }))
    saida.push({ frase: x.frase, vocabulario: x.proposta.vocabulario, formulas: [...x.proposta.premissas, x.proposta.conclusao], logica, realidade, ms: Date.now() - inicio })
  }
  writeFileSync(`${PASTA}/resultado.json`, JSON.stringify(saida, null, 2) + '\n')
  await z3.killThreads(api.em)
}, 1_800_000)
