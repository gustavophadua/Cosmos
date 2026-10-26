/**
 * A avaliação de frases curtas (src/motor/avaliacao.ts, especificacao/avaliacao-v1.md).
 * Sempre: os exemplos públicos (avaliacao/exemplos-publicos-v1.jsonl) têm o gabarito que o Z3 dá, a nota só conta como
 * acerto com classe certa e fórmulas equivalentes, e o compromisso publicado do conjunto fechado é coerente.
 * Com AVALIACAO_PRIVADA=<arquivo .jsonl do conjunto fechado> (só na máquina do dono): cada gabarito confere pelo Z3 e
 * os compromissos refeitos batem com os publicados (ou, com AVALIACAO_SAIDA, são gravados para publicar). Com também
 * AVALIACAO_RESPOSTAS=<arquivo .jsonl de respostas>, dá a nota do lote.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { classificar, compromissoDoItem, pontuar, raizDoConjunto, resumir, CLASSES, type Item, type Resposta } from '../src/motor/avaliacao'

const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const EXEMPLOS = lerJsonl<Item>('avaliacao/exemplos-publicos-v1.jsonl')
const PUBLICADO = 'avaliacao/conjunto-fechado-v1.json'
const PRIVADA = process.env.AVALIACAO_PRIVADA, SAIDA = process.env.AVALIACAO_SAIDA, RESPOSTAS = process.env.AVALIACAO_RESPOSTAS

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any, killThreads: (em: unknown) => Promise<void>
beforeAll(async () => { const z3 = await import('z3-solver'); killThreads = z3.killThreads; api = await z3.init() }, 120_000)
afterAll(async () => { if (api) await killThreads(api.em) })
const perfeita = (i: Item): Resposta => ({ id: i.id, premissas: i.gabarito.premissas, conclusao: i.gabarito.conclusao, classe: i.gabarito.classe })

describe('Avaliação de frases curtas', () => {
  it('os exemplos públicos: 12 itens, 4 por classe, e o gabarito de cada um é o que o Z3 dá', async () => {
    expect(EXEMPLOS).toHaveLength(12)
    for (const c of CLASSES) expect(EXEMPLOS.filter((i) => i.gabarito.classe === c)).toHaveLength(4)
    for (const i of EXEMPLOS) expect(await classificar(api, i.vocabulario, i.gabarito.premissas, i.gabarito.conclusao), i.id).toBe(i.gabarito.classe)
  }, 120_000)

  it('a nota: só conta acerto com a classe certa E as fórmulas equivalentes às do gabarito', async () => {
    const i = EXEMPLOS.find((x) => x.gabarito.premissas.length === 2 && x.gabarito.classe === 'segue')!
    expect((await pontuar(api, i, perfeita(i))).completa).toBe(true)
    // premissas em outra ordem e fórmula escrita de outro jeito equivalente: ainda fiel
    const outraForma = { ...perfeita(i), premissas: [...i.gabarito.premissas].reverse(), conclusao: `¬¬(${i.gabarito.conclusao})` }
    expect((await pontuar(api, i, outraForma)).completa).toBe(true)
    // a classe certa com a conclusão trocada pela negação: não é acerto
    const infiel = await pontuar(api, i, { ...perfeita(i), conclusao: `¬(${i.gabarito.conclusao})` })
    expect(infiel).toMatchObject({ classeCerta: true, conclusaoFiel: false, completa: false })
    // a fórmula certa com a classe errada: não é acerto
    expect(await pontuar(api, i, { ...perfeita(i), classe: 'independente' })).toMatchObject({ classeCerta: false, premissasFieis: true, completa: false })
    // o que não se lê com o vocabulário do item
    expect(await pontuar(api, i, { ...perfeita(i), conclusao: 'Inventado(zz)' })).toMatchObject({ le: false, completa: false })
    // uma premissa a menos: as premissas deixam de ser equivalentes
    expect((await pontuar(api, i, { ...perfeita(i), premissas: i.gabarito.premissas.slice(0, 1) })).premissasFieis).toBe(false)
    const notas = await Promise.all(EXEMPLOS.map((x) => pontuar(api, x, perfeita(x))))
    expect(resumir(EXEMPLOS, notas)).toMatchObject({ itens: 12, completas: 12, segue: { itens: 4, completas: 4 } })
  }, 120_000)

  it('o compromisso publicado do conjunto fechado é coerente: a raiz é a dos compromissos, sem item em claro', () => {
    if (!existsSync(PUBLICADO)) return
    const p = JSON.parse(readFileSync(PUBLICADO, 'utf8'))
    expect(p.formato).toBe('avaliacao-frases-v1/compromisso')
    expect(p.compromissos).toHaveLength(p.itens)
    expect(p.compromissos.every((c: string) => /^[0-9a-f]{64}$/.test(c))).toBe(true)
    expect(Object.values(p.porClasse).reduce((a: number, b) => a + (b as number), 0)).toBe(p.itens)
    return raizDoConjunto(p.compromissos).then((raiz) => {
      expect(raiz).toBe(p.raiz)
      expect(readFileSync('public/cosmos-avaliacao-v1-raiz.txt', 'utf8')).toBe(`avaliacao-frases-v1 ${p.itens} ${p.raiz}\n`)
    })
  })

  it.runIf(!!PRIVADA)('o conjunto fechado (só na máquina do dono): gabaritos pelo Z3 e compromissos', async () => {
    const linhas = lerJsonl<{ sal: string; padrao: string; item: Item }>(PRIVADA!)
    const erradas: string[] = []
    // o Z3 em WebAssembly se desgasta depois de centenas de chamadas e uma delas trava sem respeitar o prazo; uma
    // instância nova no mesmo processo não ganha memória. Por isso AVALIACAO_FATIA=início-fim confere só uma fatia, e
    // o conjunto inteiro se confere em vários processos (os compromissos saem sempre do conjunto inteiro)
    const [de, ate] = (process.env.AVALIACAO_FATIA ?? `0-${linhas.length}`).split('-').map(Number)
    for (const { item, padrao } of linhas.slice(de, ate)) {
      const z = await classificar(api, item.vocabulario, item.gabarito.premissas, item.gabarito.conclusao, 5_000).catch((e: Error) => `erro: ${e.message}`)
      if (z !== item.gabarito.classe) erradas.push(`${item.id} (${padrao}): esperado ${item.gabarito.classe}, Z3 ${z}`)
    }
    expect(erradas).toEqual([])
    const compromissos = await Promise.all(linhas.map((l) => compromissoDoItem(l.item, l.sal)))
    const porClasse = Object.fromEntries(CLASSES.map((c) => [c, linhas.filter((l) => l.item.gabarito.classe === c).length]))
    const publico = { formato: 'avaliacao-frases-v1/compromisso', tarefa: 'formalizar frases curtas em português em m2 e classificar a conclusão (segue, contradiz, independente)', itens: linhas.length, porClasse, raiz: await raizDoConjunto(compromissos), compromissos }
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify(publico, null, 2) + '\n')
    else expect(JSON.parse(readFileSync(PUBLICADO, 'utf8'))).toMatchObject({ itens: publico.itens, raiz: publico.raiz, compromissos })
    if (RESPOSTAS) {
      const respostas = new Map(lerJsonl<Resposta>(RESPOSTAS).map((r) => [r.id, r]))
      const notas = []
      for (const { item } of linhas.slice(de, ate)) if (respostas.has(item.id)) notas.push(await pontuar(api, item, respostas.get(item.id)!))
      console.log(JSON.stringify(resumir(linhas.slice(de, ate).map((l) => l.item), notas), null, 2))
    }
  }, 600_000)
})
