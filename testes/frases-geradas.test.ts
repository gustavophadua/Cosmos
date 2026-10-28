/**
 * As frases do gerador público (scripts/gerar-frases.py): o conjunto de validação publicado se refaz byte a byte pelo
 * gerador e tem 50 itens por classe. O gabarito pelo Z3 só roda com FRASES_FATIA=início-fim, um processo por fatia de
 * até 25 itens: o Z3 em WebAssembly se desgasta depois de centenas de chamadas e uma delas trava sem respeitar o prazo
 * (150 itens num processo só travaram). A CI confere a validação inteira em 6 fatias (pages.yml). Com
 * FRASES_ARQUIVO=<.jsonl> (um lote de treino), confere aquele lote e grava os recusados em FRASES_RECUSADOS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { CLASSES, type Item } from '../src/motor/avaliacao'
import { classificar } from '../src/motor/avaliacaoZ3'

const VALIDACAO = 'avaliacao/validacao-v1.jsonl'
const ARQUIVO = process.env.FRASES_ARQUIVO ?? VALIDACAO, FATIA = process.env.FRASES_FATIA
interface Linha { padrao: string; formas: number[]; item: Item }
const lerJsonl = (arquivo: string): Linha[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Linha)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any, killThreads: (em: unknown) => Promise<void>
beforeAll(async () => { if (!FATIA) return; const z3 = await import('z3-solver'); killThreads = z3.killThreads; api = await z3.init() }, 120_000)
afterAll(async () => { if (api) await killThreads(api.em) })

describe('Frases do gerador público', () => {
  it.runIf(ARQUIVO === VALIDACAO)('a validação se refaz igual pelo gerador e tem 50 itens por classe', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'frases-'))
    try {
      execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', '-X', 'utf8', '-B', 'scripts/gerar-frases.py', 'validacao', join(pasta, 'v.jsonl')])
      expect(readFileSync(join(pasta, 'v.jsonl')).equals(readFileSync(VALIDACAO))).toBe(true)
    } finally { rmSync(pasta, { recursive: true, force: true }) }
    const linhas = lerJsonl(VALIDACAO)
    for (const c of CLASSES) expect(linhas.filter((l) => l.item.gabarito.classe === c)).toHaveLength(50)
    // só as formas de base, como no conjunto fechado
    expect(linhas.every((l) => l.formas.every((f) => f === 0))).toBe(true)
  }, 60_000)

  it.runIf(!!FATIA)('o gabarito de cada item é o que o Z3 dá', async () => {
    const linhas = lerJsonl(ARQUIVO)
    const [de, ate] = FATIA!.split('-').map(Number)
    const erradas: string[] = []
    for (const { item, padrao } of linhas.slice(de, ate)) {
      const z = await classificar(api, item.vocabulario, item.gabarito.premissas, item.gabarito.conclusao, 5_000).catch((e: Error) => `erro: ${e.message}`)
      if (z !== item.gabarito.classe) {
        erradas.push(`${item.id} (${padrao}): esperado ${item.gabarito.classe}, Z3 ${z}`)
        if (process.env.FRASES_RECUSADOS) appendFileSync(process.env.FRASES_RECUSADOS, JSON.stringify({ id: item.id, padrao, motivo: `Z3 ${z}` }) + '\n')
      }
    }
    if (process.env.FRASES_RECUSADOS) console.log(`${ate - de - erradas.length} aceitos, ${erradas.length} recusados`)
    else expect(erradas).toEqual([])
  }, 600_000)
})
