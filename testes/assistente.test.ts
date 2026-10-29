import { describe, expect, it } from 'vitest'
import { detectar, executar, lerPedido, respostaAfirmacao, resumoEmTexto, separarArgumento, type ClienteIA } from '../src/interfaces/assistente'
import { lerProposta } from '../src/motor/formalizacao'

const VOCAB = [{ simbolo: 'Cliente', tipo: 'predicado', aridade: 1, leitura: 'x é cliente' }, { simbolo: 'Suporte', tipo: 'predicado', aridade: 1, leitura: 'x tem suporte' }, { simbolo: 'padaria', tipo: 'constante', aridade: 0, leitura: 'a padaria' }]
const PROPOSTA = JSON.stringify({ vocabulario: VOCAB, premissas: ['∀x (Cliente(x) ⟹ Suporte(x))', 'Cliente(padaria)'], conclusao: 'Suporte(padaria)', classe: 'segue' })

describe('assistente da Conversa', () => {
  it('o comando vem da barra, do chip ou é escolhido pelo texto', () => {
    expect(lerPedido('/contrariar A é B. Logo C.', null)).toEqual({ comando: 'contrariar', texto: 'A é B. Logo C.', automatico: false })
    expect(lerPedido('/Revisar um plano', null)).toMatchObject({ comando: 'revisar', texto: 'um plano' })
    expect(lerPedido('qualquer coisa', 'desmistificar')).toMatchObject({ comando: 'desmistificar', automatico: false })
    expect(lerPedido('/buscar F2', null)).toMatchObject({ comando: 'afirmacao', automatico: true })
    expect(detectar('Todo humano é burro')).toBe('afirmacao')
    expect(detectar('sim')).toBe('afirmacao')
    expect(detectar('Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.')).toBe('verificar')
    expect(detectar('Parágrafo um. Outro.\n\nParágrafo dois.')).toBe('revisar')
    expect(detectar('x'.repeat(601))).toBe('revisar')
  })

  it('o argumento: as premissas e, por último, a conclusão', () => {
    expect(separarArgumento('Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.')).toEqual({ premissas: ['Todo cliente tem suporte.', 'A padaria é cliente.'], conclusao: 'Então a padaria tem suporte.' })
    expect(separarArgumento('Uma frase só.')).toBeNull()
    // numa frase só, com vírgulas e a marca da conclusão (o caso real do dono)
    expect(separarArgumento('todo homem parte de Deus, Deus é eterno, logo o homem é eterno')).toEqual({ premissas: ['Todo homem parte de Deus.', 'Deus é eterno.'], conclusao: 'O homem é eterno.' })
    expect(detectar('todo homem parte de Deus, Deus é eterno, logo o homem é eterno')).toBe('verificar')
    expect(separarArgumento('A padaria tem suporte porque é cliente do plano anual, e todo cliente do plano anual tem suporte')).toEqual({ premissas: ['É cliente do plano anual.', 'Todo cliente do plano anual tem suporte.'], conclusao: 'A padaria tem suporte.' })
    expect(separarArgumento('Choveu, portanto: a rua molhou.')).toEqual({ premissas: ['Choveu.'], conclusao: 'A rua molhou.' })
    // o "então" da condicional não é conclusão
    expect(separarArgumento('Se chover, então a rua molha')).toBeNull()
    expect(separarArgumento('A loja abre cedo, se chover, então fecha')).toBeNull()
    expect(separarArgumento('Ele está em São Paulo')).toBeNull()
    expect(separarArgumento('Linha um\nLinha dois')).toEqual({ premissas: ['Linha um'], conclusao: 'Linha dois' })
  })

  it('verificar: o modelo traduz, o Z3 decide; contrariar o provado acha as premissas que o sustentam', async () => {
    const conferidos: string[][] = []
    const cliente: ClienteIA = {
      formalizar: async () => ({ conteudo: PROPOSTA }),
      conferir: async (p) => { conferidos.push(p.premissas); return { classeZ3: p.premissas.length === 2 ? 'segue' : 'independente', motivo: '', ...(p.premissas.length < 2 ? { cenario: ['a padaria: é cliente; não: tem suporte'] } : {}) } },
      revisar: async () => undefined, estadoRevisao: async () => ({ estado: 'livre' }),
    }
    const passos: string[] = []
    const texto = 'Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.'
    const v = await executar(cliente, 'verificar', texto, (c) => lerProposta(c, null), (m) => passos.push(m))
    expect(v).toMatchObject({ tipo: 'argumento', classe: 'segue' })
    expect(conferidos).toHaveLength(1)
    const c = await executar(cliente, 'contrariar', texto, (x) => lerProposta(x, null), () => undefined)
    expect(c).toMatchObject({ classe: 'segue', essenciais: [0, 1] })
    expect(resumoEmTexto(c)).toContain('Para contrariar, é preciso negar uma destas premissas')
    expect(resumoEmTexto(v)).toMatch(/^Provado/)
    await expect(executar(cliente, 'verificar', 'Uma frase só.', (x) => lerProposta(x, null), () => undefined)).rejects.toThrow('Escreva o argumento em frases')
  })

  it('revisar: começa no serviço e acompanha até o relatório', async () => {
    const relatorio = { formato: 'cosmos-revisor-v1' as const, extrator: 'e', prompt: 'p', blocos: 1, afirmacoes: [], argumentos: [], avisos: [] }
    const estados = [{ estado: 'rodando', fase: 'extraindo', feito: 0, total: 1 }, { estado: 'pronto', relatorio }]
    const passos: string[] = []
    const cliente: ClienteIA = { formalizar: async () => ({ conteudo: '' }), conferir: async () => ({ classeZ3: null, motivo: '' }), revisar: async () => undefined, estadoRevisao: async () => estados.shift()! }
    const r = await executar(cliente, 'desmistificar', 'Um plano.', () => { throw new Error() }, (m) => passos.push(m), async () => undefined)
    expect(r).toEqual({ tipo: 'relatorio', comando: 'desmistificar', relatorio })
    expect(passos).toEqual(['Separando afirmações e conclusões…', 'Separando afirmações e conclusões: 1 de 1'])
    expect(resumoEmTexto(r).length).toBeLessThanOrEqual(6000)
  })

  it('a afirmação solta: sem modelo, diz que precisa de fonte; a generalização cai com um caso contrário', () => {
    const r = respostaAfirmacao('Todo humano é burro')
    expect(r).toContain('é uma afirmação sozinha')
    expect(r).toContain('generalização ("todo…")')
    expect(r).toContain('um único caso contrário')
    expect(respostaAfirmacao('O mercado vai crescer')).not.toContain('generalização')
  })
})
