/**
 * A nota item a item de um lote de respostas do piloto, para o relatório (scripts/relatorio-nota.py) e para comparar
 * duas medições item a item (McNemar). Só roda quando chamado:
 *   NOTA_CONJUNTO=<.jsonl>  NOTA_RESPOSTAS=<respostas.jsonl>  NOTA_SAIDA=<notas.jsonl>  [NOTA_FATIA=início-fim]
 * Cada fatia acrescenta suas linhas a NOTA_SAIDA (um processo por fatia: o Z3 em WebAssembly se desgasta depois de
 * centenas de chamadas). Além da nota de avaliacao-v1 (classe dita certa e fórmulas equivalentes), cada linha diz a
 * classe que o Z3 dá às fórmulas do modelo: no Cosmos é ela que vale, e não a que o modelo diz. Para um conjunto fora
 * de avaliacao/ (o fechado), NOTA_SAIDA fica na pasta dele, fora do Git.
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { Item, Resposta } from '../src/motor/avaliacao'
import { classificar, pontuar } from '../src/motor/avaliacaoZ3'

const CONJUNTO = process.env.NOTA_CONJUNTO, RESPOSTAS = process.env.NOTA_RESPOSTAS, SAIDA = process.env.NOTA_SAIDA
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const dentro = (pasta: string, caminho: string) => { const r = relative(resolve(pasta), resolve(caminho)); return !!r && !r.startsWith('..') && !isAbsolute(r) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any, killThreads: (em: unknown) => Promise<void>
const ativo = !!CONJUNTO && !!RESPOSTAS && !!SAIDA
beforeAll(async () => { if (!ativo) return; const z3 = await import('z3-solver'); killThreads = z3.killThreads; api = await z3.init() }, 120_000)
afterAll(async () => { if (api) await killThreads(api.em) })

it.runIf(ativo)('nota item a item de um lote de respostas', async () => {
  if (!dentro('avaliacao', CONJUNTO!) && !dentro(dirname(resolve(CONJUNTO!)), SAIDA!)) throw new Error(`NOTA_SAIDA fica dentro de ${dirname(resolve(CONJUNTO!))}`)
  const linhas = lerJsonl<Item | { padrao?: string; item: Item }>(CONJUNTO!).map((l) => ('item' in l ? l : { item: l as Item, padrao: undefined }))
  const respostas = new Map(lerJsonl<Resposta>(RESPOSTAS!).map((r) => [r.id, r]))
  const [de, ate] = (process.env.NOTA_FATIA ?? `0-${linhas.length}`).split('-').map(Number)
  let n = 0
  for (const { item, padrao } of linhas.slice(de, ate)) {
    const r = respostas.get(item.id)
    const base = { id: item.id, padrao: padrao ?? null, classe_gabarito: item.gabarito.classe }
    if (!r) { appendFileSync(SAIDA!, JSON.stringify({ ...base, classe_modelo: null, le: false, classeCerta: false, premissasFieis: false, conclusaoFiel: false, completa: false, classe_z3: null, motivo: 'sem resposta lida' }) + '\n'); n++; continue }
    const nota = await pontuar(api, item, r)
    const classeZ3 = nota.le ? await classificar(api, item.vocabulario, r.premissas, r.conclusao, 5_000).catch(() => null) : null
    appendFileSync(SAIDA!, JSON.stringify({ ...base, classe_modelo: r.classe ?? null, ...nota, classe_z3: classeZ3 }) + '\n')
    n++
  }
  expect(n).toBe(Math.min(ate, linhas.length) - de)
}, 1_800_000)
