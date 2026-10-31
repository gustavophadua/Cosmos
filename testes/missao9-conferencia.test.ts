/** Uma resposta por processo: mede Z3/ponte após descarregar o modelo. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { lerProposta } from '../src/motor/formalizacao'
import { classificar } from '../src/motor/avaliacaoZ3'
import { buscarPonte } from '../src/motor/ponte'
import type { Item, Classe } from '../src/motor/avaliacao'

const indice = process.env.MISSAO9_CONFERIR
const ativo = indice !== undefined
let api: Awaited<ReturnType<typeof import('z3-solver')['init']>>
let encerrar: typeof import('z3-solver')['killThreads']
beforeAll(async () => { if (ativo) { const z3 = await import('z3-solver'); encerrar = z3.killThreads; api = await z3.init() } }, 120_000)
afterAll(async () => { if (api) await encerrar(api.em) })
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

it.runIf(ativo)('M9: mede uma resposta já traduzida, sem repetir uma linha gravada', async () => {
  if (!/^(?:[0-9]|[1-4][0-9])$/.test(indice!)) throw new Error('índice M9 fora de 0..49')
  const pasta = 'tmp/missoes/m9-variacao', destino = `${pasta}/conferencias.jsonl`
  const resumo = JSON.parse(readFileSync(`${pasta}/resumo-traducao.json`, 'utf8'))
  expect(hash(`${pasta}/respostas.jsonl`)).toBe(resumo.respostas_sha256)
  expect(hash('src/motor/ponte.ts')).toBe(resumo.ponte_sha256)
  expect(hash('src/motor/formalizacao.ts')).toBe(resumo.formalizacao_sha256)
  const linhas = readFileSync(`${pasta}/respostas.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  expect(linhas).toHaveLength(50)
  const r = linhas[Number(indice)]
  const anteriores = existsSync(destino) ? readFileSync(destino, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  if (anteriores.some((a) => a.id === r.id && a.repeticao === r.repeticao)) throw new Error('resposta M9 já medida; não repetir')
  expect(hash(resumo.conjunto)).toBe(resumo.conjunto_sha256)
  const itens = readFileSync(resumo.conjunto, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { parte: string; item: Item }).slice(0, 10)
  const item = itens.find((l) => l.item.id === r.id)
  if (!item || item.parte !== 'revisao') throw new Error('item fora da revisão M9')
  const p = lerProposta(r.conteudo, item.item.vocabulario)
  let classe: Classe | null = null, motivo: string | null = null
  const inicioZ3 = performance.now()
  try { classe = await classificar(api, p.vocabulario, p.premissas, p.conclusao, 5_000) }
  catch (e) { motivo = (e as Error).message }
  const z3Ms = performance.now() - inicioZ3
  let ponteMs: number | null = null, ponte: Awaited<ReturnType<typeof buscarPonte>> | null = null
  if (classe === 'independente') {
    const inicioPonte = performance.now()
    ponte = await buscarPonte(null, (ps, c) => classificar(api, p.vocabulario, ps, c, 5_000), p)
    ponteMs = performance.now() - inicioPonte
  }
  appendFileSync(destino, JSON.stringify({ id: r.id, repeticao: r.repeticao, indice: Number(indice), classe, motivo, z3Ms, ponteMs, ponte,
    respostas_sha256: resumo.respostas_sha256, medidoEm: new Date().toISOString() }) + '\n')
}, 1_200_000)
