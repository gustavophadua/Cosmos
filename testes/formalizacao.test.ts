/**
 * A formalização assistida (src/motor/formalizacao.ts): o pedido ao modelo, a leitura da resposta (o que se lê, o que
 * é recusado) e a leitura de volta em português, sem modelo nenhum.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CLASSES, type Item } from '../src/motor/avaliacao'
import { ESQUEMA_RESPOSTA, lerDeVolta, lerProposta, mensagensDeFormalizacao } from '../src/motor/formalizacao'

const EXEMPLOS = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
const VOCAB = [
  { simbolo: 'Medico', tipo: 'predicado' as const, aridade: 1, leitura: 'x é médico (médica)' },
  { simbolo: 'Paciente', tipo: 'predicado' as const, aridade: 1, leitura: 'x é paciente' },
  { simbolo: 'Admira', tipo: 'predicado' as const, aridade: 2, leitura: 'x admira y' },
  { simbolo: 'ana', tipo: 'constante' as const, aridade: 0, leitura: 'Ana' },
]
const resposta = (o: unknown) => JSON.stringify(o)

describe('Formalização assistida', () => {
  it('o pedido leva as instruções, dois exemplos públicos resolvidos e a entrada, nessa ordem', () => {
    const m = mensagensDeFormalizacao({ premissas: ['Todo médico é paciente.'], conclusao: 'Ana é paciente.' }, VOCAB, EXEMPLOS)
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(m[0].content).toContain('Responda SÓ com um objeto JSON')
    expect(m.at(-1)!.content).toContain('Todo médico é paciente.')
    expect(m.at(-1)!.content).toContain('"simbolo":"Medico"')
    expect(JSON.parse(m[2].content).classe).toBe(EXEMPLOS[0].gabarito.classe)
  })

  it('o esquema JSON da resposta pede o que a leitura lê, e as respostas dos exemplos o cumprem', () => {
    expect(ESQUEMA_RESPOSTA.required).toEqual(['vocabulario', 'premissas', 'conclusao', 'classe'])
    expect(ESQUEMA_RESPOSTA.properties.classe.enum).toEqual(CLASSES)
    const m = mensagensDeFormalizacao({ premissas: ['Todo médico é paciente.'], conclusao: 'Ana é paciente.' }, VOCAB, EXEMPLOS)
    for (const r of [m[2], m[4]].map((x) => JSON.parse(x.content))) {
      expect(Object.keys(r).sort()).toEqual([...ESQUEMA_RESPOSTA.required].sort())
      for (const t of r.vocabulario) expect(Object.keys(t).sort()).toEqual([...ESQUEMA_RESPOSTA.properties.vocabulario.items.required].sort())
      expect(lerProposta(JSON.stringify(r), r.vocabulario).classe).toBe(r.classe)
    }
  })

  it('lê a resposta mesmo com raciocínio entre <think> e cerca de código, e confere cada fórmula', () => {
    const conteudo = '<think>talvez {isto} não</think>\n```json\n' + resposta({ premissas: ['∀x (Medico(x) ⟹ Paciente(x))', 'Medico(ana)'], conclusao: 'Paciente(ana)', classe: 'segue' }) + '\n```'
    expect(lerProposta(conteudo, VOCAB)).toEqual({ vocabulario: VOCAB, premissas: ['∀x (Medico(x) ⟹ Paciente(x))', 'Medico(ana)'], conclusao: 'Paciente(ana)', classe: 'segue' })
  })

  it('sem vocabulário dado, acerta a forma dos símbolos propostos, só nas palavras inteiras', () => {
    // os casos reais da tela com o qwen3:4b, em 28/10/2026: "Pássaro" e a constante "Tico" ficavam fora do padrão
    const r = lerProposta(JSON.stringify({ vocabulario: [{ simbolo: 'Pássaro', tipo: 'predicado', aridade: 1, leitura: 'x é pássaro' }, { simbolo: 'TemPenas', tipo: 'predicado', aridade: 1, leitura: 'x tem penas' }, { simbolo: 'Tico', tipo: 'constante', aridade: 0, leitura: 'Tico' }],
      premissas: ['∀x (Pássaro(x) ⟹ TemPenas(x))', '¬TemPenas(Tico)'], conclusao: '¬Pássaro(Tico)', classe: 'segue' }), null)
    expect(r.vocabulario.map((t) => t.simbolo)).toEqual(['Passaro', 'TemPenas', 'tico'])
    expect(r.vocabulario[0].leitura).toBe('x é pássaro')
    expect(r.premissas).toEqual(['∀x (Passaro(x) ⟹ TemPenas(x))', '¬TemPenas(tico)'])
    expect(r.conclusao).toBe('¬Passaro(tico)')
    expect(lerDeVolta(r.conclusao, r.vocabulario)).toContain('pássaro')
    // com o vocabulário dado (o piloto e a nota), nada muda: a constante com maiúscula continua fora do vocabulário
    expect(() => lerProposta(JSON.stringify({ premissas: ['Medico(Ana)'], conclusao: 'Paciente(ana)' }), VOCAB)).toThrow()
    // dois símbolos que ficam iguais sem acento continuam recusados
    expect(() => lerProposta(JSON.stringify({ vocabulario: [{ simbolo: 'Pé', tipo: 'predicado', aridade: 1, leitura: 'x é pé' }, { simbolo: 'Pe', tipo: 'predicado', aridade: 1, leitura: 'x é pe' }], premissas: ['Pe(a)'], conclusao: 'Pe(a)' }), null)).toThrow(/repetido/)
  })

  it('recusa fórmula fora do vocabulário, que não se lê, ou resposta sem JSON', () => {
    expect(() => lerProposta(resposta({ premissas: ['Medico(bruno)'], conclusao: 'Paciente(ana)', classe: 'segue' }), VOCAB)).toThrow(/vocabulário/)
    expect(() => lerProposta(resposta({ premissas: ['∀x (Medico(x) ⟹'], conclusao: 'Paciente(ana)', classe: 'segue' }), VOCAB)).toThrow(/não se lê/)
    expect(() => lerProposta('Ana é paciente, porque é médica.', VOCAB)).toThrow(/JSON/)
    // classe desconhecida não derruba a proposta: a classe é a verificação que decide
    expect(lerProposta(resposta({ premissas: ['Medico(ana)'], conclusao: 'Paciente(ana)', classe: 'talvez' }), VOCAB).classe).toBeNull()
  })

  it('sem vocabulário dado, aceita o proposto pelo modelo só no padrão (predicado com maiúscula, constante em minúscula)', () => {
    const v = [{ simbolo: 'Gato', tipo: 'predicado', aridade: 1, leitura: 'x é gato' }, { simbolo: 'tom', tipo: 'constante', aridade: 0, leitura: 'Tom' }]
    expect(lerProposta(resposta({ vocabulario: v, premissas: ['Gato(tom)'], conclusao: 'Gato(tom)' }), null).vocabulario).toHaveLength(2)
    // a forma se acerta (gato → Gato); o que não tem conserto continua fora do padrão
    expect(lerProposta(resposta({ vocabulario: [{ ...v[0], simbolo: 'gato' }, v[1]], premissas: ['gato(tom)'], conclusao: 'gato(tom)' }), null).conclusao).toBe('Gato(tom)')
    expect(() => lerProposta(resposta({ vocabulario: [{ ...v[0], simbolo: 'Gato-preto' }, v[1]], premissas: ['Gato(tom)'], conclusao: 'Gato(tom)' }), null)).toThrow(/padrão/)
    expect(() => lerProposta(resposta({ vocabulario: [v[0], v[0]], premissas: ['Gato(tom)'], conclusao: 'Gato(tom)' }), null)).toThrow(/repetido/)
  })

  it('lê de volta em português, sem modelo: é o que a pessoa confere antes de aprovar', () => {
    expect(lerDeVolta('∀x (Medico(x) ⟹ Paciente(x))', VOCAB)).toBe('todo médico é paciente')
    expect(lerDeVolta('Medico(ana)', VOCAB)).toBe('Ana é médico')
    expect(lerDeVolta('¬Paciente(ana)', VOCAB)).toBe('Ana não é paciente')
    expect(lerDeVolta('∃x (Medico(x) ∧ Admira(ana, x))', VOCAB)).toContain('existe um médico x')
    // predicado com verbo, como o modelo propõe ("x gosta de banho"): a frase continua dizendo a mesma coisa
    const comVerbo = [{ simbolo: 'Gato', tipo: 'predicado' as const, aridade: 1, leitura: 'x é gato' }, { simbolo: 'GostaBanho', tipo: 'predicado' as const, aridade: 1, leitura: 'x gosta de banho' }, { simbolo: 'mimi', tipo: 'constante' as const, aridade: 0, leitura: 'Mimi' }]
    expect(lerDeVolta('∀x (Gato(x) ⟹ ¬GostaBanho(x))', comVerbo)).toBe('nenhum gato é algo que gosta de banho')
    expect(lerDeVolta('¬GostaBanho(mimi)', comVerbo)).toBe('Mimi não é algo que gosta de banho')
  })
})
