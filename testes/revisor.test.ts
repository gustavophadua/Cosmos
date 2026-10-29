import { describe, expect, it } from 'vitest'
import { blocosDoTexto, cenarioEmPortugues, lerExtracao, relatorioEmMarkdown, revisarPlano, type PassosRevisor } from '../src/motor/revisor'
import { lerFormula, type Termo } from '../src/motor/avaliacao'
import { buscarModelo, nao } from '../src/motor/motor'
import { formalizarComReparo } from '../src/motor/formalizacao'

const resposta = (o: unknown) => ({ conteudo: JSON.stringify(o), prompt: 10, completion: 5 })

describe('revisor de planos', () => {
  it('blocos: junta parágrafos até o limite e parte o parágrafo grande por frases', () => {
    expect(blocosDoTexto('A.\n\nB.\n\n\nC.', 10)).toEqual(['A.\nB.\nC.'])
    expect(blocosDoTexto('Uma frase longa aqui. Outra frase longa.', 25)).toEqual(['Uma frase longa aqui.', 'Outra frase longa.'])
    expect(blocosDoTexto('   \n\n  ')).toEqual([])
  })

  it('extração: ids repetidos, apoio inexistente, repetido ou igual à conclusão saem', () => {
    const e = lerExtracao(JSON.stringify({ afirmacoes: [{ id: 1, texto: ' A  b ' }, { id: 1, texto: 'dup' }, { id: 2, texto: 'C' }, { id: 3, texto: '' }],
      argumentos: [{ conclusao: 2, apoios: [1, 1, 2, 9] }, { conclusao: 9, apoios: [1] }, { conclusao: 1, apoios: [3] }] }))
    expect(e).toEqual({ afirmacoes: [{ id: 1, texto: 'A b' }, { id: 2, texto: 'C' }], argumentos: [{ conclusao: 2, apoios: [1] }] })
    expect(() => lerExtracao('não é json')).toThrow('não é JSON')
  })

  it('cenário: o salto de "só pode votar se credenciado" mostra alguém credenciado que não pode votar', () => {
    const v: Termo[] = [{ simbolo: 'PodeVotar', tipo: 'predicado', aridade: 1, leitura: 'x pode votar' }, { simbolo: 'Credenciado', tipo: 'predicado', aridade: 1, leitura: 'x está credenciado' },
      { simbolo: 'rep', tipo: 'constante', aridade: 0, leitura: 'o representante' }]
    const b = buscarModelo([lerFormula('∀x (PodeVotar(x) ⟹ Credenciado(x))', v), lerFormula('Credenciado(rep)', v), nao(lerFormula('PodeVotar(rep)', v))], { N: 3, limite: 100_000, K: 1 })
    expect(b.status).toBe('modelo')
    if (b.status === 'modelo') expect(cenarioEmPortugues(b.modelo, v)).toEqual(['o representante: está credenciado; não: pode votar'])
  })

  it('o caminho inteiro: extrai, traduz (com reparo), descarrega o modelo antes do Z3 e dá o veredito com cenário', async () => {
    const ordem: string[] = []
    const vocab = [{ simbolo: 'Pequena', tipo: 'predicado', aridade: 1, leitura: 'x é pequena empresa' }, { simbolo: 'Precisa', tipo: 'predicado', aridade: 1, leitura: 'x precisa controlar o caixa' },
      { simbolo: 'Compra', tipo: 'predicado', aridade: 1, leitura: 'x compra o módulo' }, { simbolo: 'cliente', tipo: 'constante', aridade: 0, leitura: 'o cliente' }]
    const traducoes = [
      // uma premissa a menos: volta uma vez ao modelo com o erro
      resposta({ vocabulario: vocab, premissas: ['Pequena(cliente)'], conclusao: 'Compra(cliente)', classe: 'segue' }),
      resposta({ vocabulario: vocab, premissas: ['Pequena(cliente)', '∀x (Pequena(x) ⟹ Precisa(x))'], conclusao: 'Compra(cliente)', classe: 'segue' }),
      resposta({ vocabulario: vocab, premissas: ['∀x (Pequena(x) ⟹ Precisa(x))', 'Pequena(cliente)'], conclusao: 'Precisa(cliente)', classe: 'segue' }),
    ]
    const passos: PassosRevisor = {
      prompt: 'formalizacao-teste',
      extrair: async () => {
        ordem.push('extrair')
        return resposta({ afirmacoes: [{ id: 1, texto: 'O cliente é pequena empresa.' }, { id: 2, texto: 'Toda pequena empresa precisa controlar o caixa.' },
          { id: 3, texto: 'O cliente vai comprar o módulo.' }, { id: 4, texto: 'O cliente precisa controlar o caixa.' }],
        argumentos: [{ conclusao: 3, apoios: [1, 2] }, { conclusao: 4, apoios: [2, 1] }] })
      },
      traduzir: (t) => formalizarComReparo(async () => { ordem.push('formalizar'); return traducoes.shift()! }, [{ role: 'user', content: JSON.stringify(t) }], null, t.premissas.length),
      descarregar: async () => { ordem.push('descarregar') },
      classificar: async (p) => { ordem.push('z3'); return p.conclusao === 'Compra(cliente)' ? 'independente' : 'segue' },
    }
    const r = await revisarPlano('O cliente é pequena empresa. Toda pequena empresa precisa controlar o caixa. Então vai comprar o módulo.', passos)
    expect(ordem).toEqual(['extrair', 'formalizar', 'formalizar', 'formalizar', 'descarregar', 'z3', 'z3'])
    expect(r.argumentos.map((a) => a.veredito)).toEqual(['salto', 'provado'])
    expect(r.argumentos[0].reparo).toContain('o texto tem 2 premissa(s)')
    expect(r.argumentos[0].cenario).toEqual(['o cliente: é pequena empresa; precisa controlar o caixa; não: compra o módulo'])
    expect(r.afirmacoes.map((a) => a.papel)).toEqual(['base', 'base', 'conclusao', 'conclusao'])
    const md = relatorioEmMarkdown(r, new Date('2026-10-29T12:00:00Z'))
    expect(md).toContain('**2 conclusões:** 1 provadas, 1 saltos')
    expect(md).toContain('Salto: não decorre do que o plano afirma')
    expect(md).toContain('formalizacao-teste')
  })

  it('o bloco que o extrator não responde vira aviso, e as afirmações incompatíveis aparecem como tal', async () => {
    const vocab = [{ simbolo: 'A', tipo: 'predicado', aridade: 1, leitura: 'x é a' }, { simbolo: 'c', tipo: 'constante', aridade: 0, leitura: 'c' }]
    const r = await revisarPlano('um\n\n' + 'x'.repeat(1600), {
      prompt: 'p', descarregar: async () => undefined,
      extrair: async (m) => m.at(-1)!.content.includes('um') ? resposta({ afirmacoes: [{ id: 1, texto: 'c é a' }, { id: 2, texto: 'c não é a' }, { id: 3, texto: 'c é a e não é' }], argumentos: [{ conclusao: 3, apoios: [1, 2] }] }) : { conteudo: '{', prompt: 0, completion: 0 },
      traduzir: async () => ({ ...resposta({ vocabulario: vocab, premissas: ['A(c)', '¬A(c)'], conclusao: 'A(c)', classe: null }), reparo: null }),
      classificar: async () => { throw new Error('as premissas são inconsistentes') },
    })
    expect(r.blocos).toBe(2)
    expect(r.avisos).toEqual(['bloco 2: a resposta do extrator não é JSON'])
    expect(r.argumentos[0].veredito).toBe('incompativel')
  })
})
