/**
 * O modo automático da formalização com o Z3 de verdade (src/motor/avaliacaoZ3.ts, conferirProposta): passa só a
 * proposta cuja classe dita é a das fórmulas; o resto é descartado com o motivo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import { conferirProposta } from '../src/motor/avaliacaoZ3'
import { lerProposta } from '../src/motor/formalizacao'
import type { Termo } from '../src/motor/avaliacao'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any
beforeAll(async () => { api = await init() }, 120_000)
afterAll(async () => { await killThreads(api.em) })

const V: Termo[] = [
  { simbolo: 'Passaro', tipo: 'predicado', aridade: 1, leitura: 'x é pássaro' },
  { simbolo: 'TemPenas', tipo: 'predicado', aridade: 1, leitura: 'x tem penas' },
  { simbolo: 'tico', tipo: 'constante', aridade: 0, leitura: 'Tico' },
]
const TICO = { vocabulario: V, premissas: ['∀x (Passaro(x) ⟹ TemPenas(x))', '¬TemPenas(tico)'], conclusao: '¬Passaro(tico)' }

describe('Formalização automática: a conferência pelo Z3', () => {
  it('aceita quando a classe dita é a do Z3, descarta quando não é ou quando falta', async () => {
    expect(await conferirProposta(api, { ...TICO, classe: 'segue' })).toEqual({ classeZ3: 'segue', aceita: true, motivo: '' })
    expect(await conferirProposta(api, { ...TICO, classe: 'independente' })).toEqual({ classeZ3: 'segue', aceita: false, motivo: 'o modelo disse independente, o Z3 diz segue' })
    expect(await conferirProposta(api, { ...TICO, classe: null })).toMatchObject({ classeZ3: 'segue', aceita: false })
    // a conclusão trocada pela afirmação: contradiz
    expect((await conferirProposta(api, { ...TICO, conclusao: 'Passaro(tico)', classe: 'contradiz' })).aceita).toBe(true)
  })

  it('premissas inconsistentes são descartadas, com o motivo', async () => {
    const c = await conferirProposta(api, { ...TICO, premissas: ['TemPenas(tico)', '¬TemPenas(tico)'], classe: 'segue' })
    expect(c).toEqual({ classeZ3: null, aceita: false, motivo: 'as premissas são inconsistentes' })
  })

  it('a galinha de Diógenes: com o símbolo completado, a proposta se lê e passa', async () => {
    const p = lerProposta(JSON.stringify({ vocabulario: [{ simbolo: 'Bipede', tipo: 'predicado', aridade: 1, leitura: 'x é bípede' }, { simbolo: 'Homem', tipo: 'predicado', aridade: 1, leitura: 'x é homem' }, { simbolo: 'galinha', tipo: 'constante', aridade: 0, leitura: 'a galinha' }],
      premissas: ['∀x ((Bipede(x) ∧ ¬Penas(x)) ⟹ Homem(x))', 'Bipede(galinha)', '¬Penas(galinha)'], conclusao: 'Homem(galinha)', classe: 'segue' }), null)
    expect(p.completados).toEqual(['Penas'])
    expect(await conferirProposta(api, p)).toEqual({ classeZ3: 'segue', aceita: true, motivo: '' })
  })
})
