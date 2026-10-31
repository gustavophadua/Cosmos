/** M10: audita as explicações da M1 sem traduzir novamente. */
import { describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Avaliador } from '../src/motor/avaliar'
import { buscarModelo, nao, type Modelo } from '../src/motor/motor'
import { lerFormula, type Item, type Resposta, type Termo } from '../src/motor/avaliacao'
import { cenarioDoSalto, cenarioEmPortugues } from '../src/motor/revisor'

const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
const ler = <T>(p: string): T[] => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)

describe('M10: fidelidade das explicações', () => {
  it('o avaliador acusa uma premissa falsa e uma conclusão verdadeira em modelo adulterado', () => {
    const v: Termo[] = [{ simbolo: 'A', tipo: 'predicado', aridade: 1, leitura: 'x é a' }, { simbolo: 'B', tipo: 'predicado', aridade: 1, leitura: 'x é b' }, { simbolo: 'c', tipo: 'constante', aridade: 0, leitura: 'C' }]
    const m: Modelo = { n: 1, mundos: 1, constantes: [{ nome: 'c', valor: 0 }], funcoes: [], predicados: [{ nome: 'B', aridade: 1, verdadeiros: [{ args: [0], w: 0 }] }], pertence: [], acessos: [] }
    const av = new Avaliador(m)
    expect(av.avaliar(lerFormula('A(c)', v))).toBe(false)
    expect(av.avaliar(lerFormula('B(c)', v))).toBe(true)
  })
  it.runIf(process.env.MISSAO10_MEDIR === '1')('confere todas as explicações disponíveis dos independentes M1', () => {
    const pasta = 'tmp/missoes/m10-cenarios'
    if (existsSync(pasta)) throw new Error('M10 já tem saída; não repetir automaticamente')
    const base = 'tmp/frases-gpt/cego2-teste'
    expect(hash(`${base}/notas.jsonl`)).toBe('e711c7e733c65553da16a6cf14fc23b04e40cbfa687799b7d42e572c3993ec26')
    expect(hash(`${base}/respostas.jsonl`)).toBe('41aa3c9e91b398ace6d148dcc57e67c6d4c95ca813094f62e4ed3647da1a2185')
    const notas = ler<{ id: string; classe_z3: string | null }>(`${base}/notas.jsonl`)
    expect(notas).toHaveLength(100)
    const independentes = notas.filter((n) => n.classe_z3 === 'independente')
    const respostas = new Map(ler<Resposta>(`${base}/respostas.jsonl`).map((r) => [r.id, r]))
    const itens = new Map(ler<{ item: Item }>('tmp/frases-gpt/teste.jsonl').map((r) => [r.item.id, r.item]))
    mkdirSync(pasta, { recursive: true })
    const inicio = Date.now(), resultados: { id: string; estado: string }[] = []
    const meta = { formato: 'cosmos-m10-cenarios-v1', origemClasse: 'notas-z3-m1', origemCenario: 'motor-finito-do-produto-sem-z3',
      notas_sha256: hash(`${base}/notas.jsonl`), respostas_sha256: hash(`${base}/respostas.jsonl`),
      conjunto_sha256: hash('tmp/frases-gpt/teste.jsonl'), revisor_sha256: hash('src/motor/revisor.ts'),
      avaliador_sha256: hash('src/motor/avaliar.ts'), inicio: new Date(inicio).toISOString(), ids: independentes.map((n) => n.id) }
    writeFileSync(`${pasta}/meta-inicio.json`, JSON.stringify(meta, null, 2) + '\n')
    for (const { id } of independentes) {
      const r = respostas.get(id), item = itens.get(id)
      if (!r || !item) throw new Error('independente sem resposta ou item M1')
      const p = { vocabulario: item.vocabulario, premissas: r.premissas, conclusao: r.conclusao }
      const fs = r.premissas.map((f) => lerFormula(f, item.vocabulario)), c = lerFormula(r.conclusao, item.vocabulario)
      // Mesma busca/limites que cenarioDoSalto; nenhum extrator de modelo Z3 foi inventado.
      const b = buscarModelo([...fs, nao(c)], { N: 4, limite: 200_000, K: 1, prazo: Date.now() + 5_000 })
      if (b.status !== 'modelo') {
        const registro = { id, estado: 'cenario-indisponivel', status: b.status }
        resultados.push(registro)
        appendFileSync(`${pasta}/resultados.jsonl`, JSON.stringify(registro) + '\n')
        continue
      }
      const av = new Avaliador(b.modelo), premissas = fs.map((f) => av.avaliar(f)), conclusao = av.avaliar(c)
      const cenario = cenarioEmPortugues(b.modelo, p.vocabulario)
      const exibido = cenarioDoSalto(p)
      const correspondeAoProduto = JSON.stringify(cenario) === JSON.stringify(exibido)
      const valido = premissas.every(Boolean) && !conclusao && correspondeAoProduto
      const registro = { id, estado: valido ? 'conferido' : 'falha', premissas, conclusao, correspondeAoProduto, cenario, modelo: b.modelo }
      resultados.push(registro)
      appendFileSync(`${pasta}/resultados.jsonl`, JSON.stringify(registro) + '\n')
      expect(valido, `cenário inválido no item ${id}`).toBe(true)
    }
    expect(hash('src/motor/revisor.ts')).toBe(meta.revisor_sha256)
    expect(hash('src/motor/avaliar.ts')).toBe(meta.avaliador_sha256)
    const resumo = { ...meta, fim: new Date().toISOString(), ms: Date.now() - inicio, total: resultados.length,
      conferidos: resultados.filter((r) => r.estado === 'conferido').length,
      indisponiveis: resultados.filter((r) => r.estado === 'cenario-indisponivel').length,
      falhas: resultados.filter((r) => r.estado === 'falha').length, resultados_sha256: hash(`${pasta}/resultados.jsonl`) }
    writeFileSync(`${pasta}/resumo.json`, JSON.stringify(resumo, null, 2) + '\n')
    expect(resultados).toHaveLength(independentes.length)
    console.log(JSON.stringify(resumo))
  }, 900_000)
})
