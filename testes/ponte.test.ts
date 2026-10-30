import { describe, expect, it } from 'vitest'
import { buscarPonte, mensagensDaPonte, type ClassificarZ3 } from '../src/motor/ponte'
import { lerFormula, type Termo } from '../src/motor/avaliacao'
import { buscarModelo, nao } from '../src/motor/motor'

// o juiz dos testes: o motor finito no lugar do Z3 (sem modelo até 3 objetos = segue)
const juiz = (v: Termo[], contar?: { n: number }, falhas: number[] = []): ClassificarZ3 => async (ps, c) => {
  contar && contar.n++
  if (contar && falhas.includes(contar.n)) throw new Error('o Z3 foi encerrado')
  const fs = ps.map((p) => lerFormula(p, v))
  if (buscarModelo(fs, { N: 3, limite: 100_000, K: 1 }).status !== 'modelo') throw new Error('as premissas são inconsistentes')
  if (buscarModelo([...fs, nao(lerFormula(c, v))], { N: 3, limite: 100_000, K: 1 }).status !== 'modelo') return 'segue'
  return buscarModelo([...fs, lerFormula(c, v)], { N: 3, limite: 100_000, K: 1 }).status === 'modelo' ? 'independente' : 'contradiz'
}
const termo = (simbolo: string, aridade: number, leitura: string, tipo = 'predicado') => ({ simbolo, tipo, aridade, leitura }) as Termo

// o argumento real do dono (29/10/2026), formalizado à mão
const VISAO = [termo('Pessoa', 1, 'x é pessoa'), termo('ParteDoTodo', 1, 'x é parte do todo'), termo('Necessaria', 1, 'x é necessária ao todo'),
  termo('DonaDaFuncao', 1, 'x é dona da sua função'), termo('Invalida', 2, 'x invalida a existência de y')]
const ARG = { vocabulario: VISAO, premissas: ['∀x (Pessoa(x) ⟹ ParteDoTodo(x))', '∀x (Pessoa(x) ⟹ Necessaria(x))', '∀x (Pessoa(x) ⟹ ¬DonaDaFuncao(x))'],
  conclusao: '∀x ∀y (Pessoa(x) ∧ Pessoa(y) ⟹ ¬Invalida(x, y))' }
const HOMEM = [termo('Homem', 1, 'x é homem'), termo('ParteDeDeus', 1, 'x é parte de Deus'), termo('Eterno', 1, 'x é eterno'), termo('deus', 0, 'Deus', 'constante')]

describe('a ligação que falta', () => {
  it('a busca pela forma acha ligações que fecham, nenhuma é a conclusão disfarçada, e diz que fatos cada uma usa', async () => {
    const r = await buscarPonte(null, juiz(VISAO), ARG)
    if (!('fonte' in r)) throw new Error(r.motivo)
    expect(r.fonte).toBe('busca')
    expect(r.opcoes.length).toBe(4)
    // nenhuma usa "pessoa" (da conclusão): seria a conclusão com outras palavras
    expect(r.opcoes.every((o) => !o.ponte.slice(0, o.ponte.indexOf('⟹')).includes('Pessoa('))).toBe(true)
    // a de "necessária" usa só a premissa de que toda pessoa é necessária
    const necessaria = r.opcoes.find((o) => /Necessaria\(x\) ∧ Necessaria\(y\)/.test(o.ponte))!
    expect(necessaria.essenciais).toEqual([1])
    expect(necessaria.leitura).toBe('Para quaisquer A e B: se A é necessária ao todo e B é necessária ao todo, então A não invalida a existência de B.')
    // variadas: as quatro cobrem todas as propriedades das premissas, inclusive "não é dona da função"
    expect(r.opcoes.some((o) => o.ponte.includes('¬DonaDaFuncao(x) ∧ ¬DonaDaFuncao(y)'))).toBe(true)
    // a negação na leitura: "A não é dona da sua função"
    const todas = await buscarPonte(null, juiz(VISAO), { ...ARG, premissas: [ARG.premissas[2]] })
    if (!('fonte' in todas)) throw new Error(todas.motivo)
    expect(todas.opcoes[0].leitura).toContain('A não é dona da sua função')
  })

  it('conclusão sobre todos ("o homem é eterno"): a ligação parte do que as premissas dizem', async () => {
    const r = await buscarPonte(null, juiz(HOMEM), { vocabulario: HOMEM, premissas: ['∀x (Homem(x) ⟹ ParteDeDeus(x))', 'Eterno(deus)'], conclusao: '∀x (Homem(x) ⟹ Eterno(x))' })
    expect(r).toEqual({ opcoes: [{ ponte: '∀x (ParteDeDeus(x) ⟹ Eterno(x))', leitura: 'Para qualquer A: se A é parte de Deus, então A é eterno.', essenciais: [0] }], fonte: 'busca', outras: 0 })
  })

  it('conclusão sobre um indivíduo: "Eterno(socrates)" vira "todo x"', async () => {
    const V = [termo('Homem', 1, 'x é homem'), termo('Eterno', 1, 'x é eterno'), termo('socrates', 0, 'Sócrates', 'constante')]
    const r = await buscarPonte(null, juiz(V), { vocabulario: V, premissas: ['Homem(socrates)'], conclusao: 'Eterno(socrates)' })
    expect(r).toMatchObject({ opcoes: [{ ponte: '∀x (Homem(x) ⟹ Eterno(x))', essenciais: [0] }] })
  })

  it('sem forma que feche, o modelo propõe; a que não serve volta uma vez com o motivo; a que serve vale', async () => {
    const V = [termo('A', 1, 'x é a'), termo('B', 1, 'x é b'), termo('c', 0, 'c', 'constante')]
    // conclusão com ∃: a busca pela forma não se aplica
    const a = { vocabulario: V, premissas: ['A(c)'], conclusao: '∃x (B(x))' }
    const respostas = ['{"ponte": "∃x (B(x))"}', '{"ponte": "∀x (A(x) ⟹ B(x))"}']
    const vistas: string[] = [], ordem: string[] = []
    const r = await buscarPonte(async (m) => { vistas.push(m.at(-1)!.content); return { conteudo: respostas.shift()!, prompt: 1, completion: 1 } }, juiz(V), a,
      { antesDoModelo: () => { ordem.push('modelo') }, antesDoZ3: () => { ordem.push('z3') } })
    expect(r).toMatchObject({ opcoes: [{ ponte: '∀x (A(x) ⟹ B(x))', essenciais: [0] }], fonte: 'modelo' })
    expect(vistas[1]).toContain('Essa ligação não serve: ela repete a conclusão')
    expect(ordem).toEqual(['z3', 'modelo', 'z3', 'modelo', 'z3'])
    // sem modelo, diz que não achou
    expect(await buscarPonte(null, juiz(V), a)).toEqual({ opcoes: [], motivo: 'nenhuma ligação simples fecha o argumento' })
  })

  it('a ligação que contradiz as premissas não serve; a falha do Z3 nunca vira "não segue"', async () => {
    const V = [termo('A', 1, 'x é a'), termo('B', 1, 'x é b'), termo('c', 0, 'c', 'constante')]
    const r = await buscarPonte(async () => ({ conteudo: '{"ponte": "∀x (¬A(x))"}', prompt: 1, completion: 1 }), juiz(V), { vocabulario: V, premissas: ['A(c)'], conclusao: '∃x (B(x))' }, {}, 1)
    expect(r).toEqual({ opcoes: [], motivo: 'ela contradiz as premissas' })
    // o Z3 falha numa conferência dos fatos usados: tenta de novo e a conta sai certa
    const contar = { n: 0 }
    const s = await buscarPonte(null, juiz(VISAO, contar, [80]), ARG)
    if (!('fonte' in s)) throw new Error(s.motivo)
    expect(s.opcoes.find((o) => /Necessaria\(x\) ∧ Necessaria\(y\)/.test(o.ponte))?.essenciais ?? [1]).toEqual([1])
  })

  it('o pedido ao modelo leva o vocabulário, as fórmulas e o cenário, com um exemplo', () => {
    const m = mensagensDaPonte({ ...ARG, cenario: ['alguém 1 invalida a existência de alguém 1'] })
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(m.at(-1)!.content).toContain('alguém 1 invalida a existência de alguém 1')
    expect(m.at(-1)!.content).toContain(ARG.conclusao)
    expect(m[0].content).toContain('não copie a conclusão')
  })
})
