import { describe, expect, it } from 'vitest'
import { detectar, executar, leituraComVariavel, lerPedido, notasDaLeitura, provadoSoNaFormaForte, respostaAfirmacao, simboloDaLeitura, resumoEmTexto, separarArgumento, type ClienteIA } from '../src/interfaces/assistente'
import { lerProposta } from '../src/motor/formalizacao'
import type { Termo } from '../src/motor/avaliacao'

const VOCAB: Termo[] = [{ simbolo: 'Cliente', tipo: 'predicado', aridade: 1, leitura: 'x é cliente' }, { simbolo: 'Suporte', tipo: 'predicado', aridade: 1, leitura: 'x tem suporte' }, { simbolo: 'padaria', tipo: 'constante', aridade: 0, leitura: 'a padaria' }]
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

  it('sem "logo": três orações, a última é a conclusão suposta; "geralmente" vai na forma forte e a resposta avisa', () => {
    // o caso real do dono (29/10/2026), que caía em "afirmação sozinha"
    const frase = 'as pessoas geralmente são sociaveis, eu não sou sociavel, eu não sou pessoa'
    const a = separarArgumento(frase)
    expect(a).toEqual({ premissas: ['As pessoas são sociaveis.', 'Eu não sou sociavel.'], conclusao: 'Eu não sou pessoa.', suposta: true,
      atenuadas: [{ premissa: 0, palavra: 'geralmente', original: 'As pessoas geralmente são sociaveis.' }] })
    expect(detectar(frase)).toBe('verificar')
    const provado = notasDaLeitura({ texto: a!, classe: 'segue' })
    expect(provado[0]).toContain('li as primeiras partes como as razões e a última como a conclusão')
    expect(provado[1]).toContain('li como "As pessoas são sociaveis." (vale para todos)')
    expect(provado[2]).toContain('Com "geralmente", a conclusão não decorre')
    expect(notasDaLeitura({ texto: a!, classe: 'independente' })).toHaveLength(2)
    // o título: provado só na forma forte é salto como está escrito
    expect(provadoSoNaFormaForte({ texto: a!, classe: 'segue' })).toBe(true)
    expect(provadoSoNaFormaForte({ texto: { premissas: ['A.'], conclusao: 'B.' }, classe: 'segue' })).toBe(false)
    // em frases separadas também; o "geralmente" no meio de frase sai sem deixar espaço sobrando
    expect(separarArgumento('Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova.')!.premissas[0]).toBe('Clientes do plano anual renovam.')
    // lista não é argumento; a condicional partida por vírgulas também não
    expect(separarArgumento('comprei pão, leite, ovos')).toBeNull()
    expect(separarArgumento('se chover muito, a rua molha toda, a feira fecha cedo')).toBeNull()
    expect(separarArgumento('Ele está em São Paulo')).toBeNull()
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

  it('verificar um salto: pede a ligação que falta e o resumo separa fato, visão e lógica', async () => {
    const cliente: ClienteIA = {
      formalizar: async () => ({ conteudo: PROPOSTA }),
      conferir: async () => ({ classeZ3: 'independente', motivo: '', cenario: ['a padaria: é cliente; não: tem suporte'] }),
      ponte: async (a) => { expect(a.cenario).toEqual(['a padaria: é cliente; não: tem suporte']); return { opcoes: [{ ponte: '∀x (Cliente(x) ⟹ Suporte(x))', leitura: 'Para qualquer A: se A é cliente, então A tem suporte.', essenciais: [1] }], fonte: 'busca', outras: 2 } },
      revisar: async () => undefined, estadoRevisao: async () => ({ estado: 'livre' }),
    }
    const passos: string[] = []
    const r = await executar(cliente, 'verificar', 'Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.', (c) => lerProposta(c, null), (m) => passos.push(m))
    expect(passos).toContain('Procurando a ligação que falta…')
    const texto = resumoEmTexto(r)
    expect(texto).toContain('Para a conclusão valer, falta aceitar:')
    expect(texto).toContain('- Para qualquer A: se A é cliente, então A tem suporte.')
    expect(texto).toContain('Fatos que ela usa: A padaria é cliente.')
    expect(texto).toContain('Há mais 2 ligação(ões)')
    // contrariar não pede a ligação (o salto já é o contra-exemplo)
    const c = await executar({ ...cliente, ponte: async () => { throw new Error('não devia') } }, 'contrariar', 'Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.', (x) => lerProposta(x, null), () => undefined)
    expect(c).not.toHaveProperty('ligacao')
  })

  it('os termos corrigidos: o símbolo sai da leitura, a variável entra se faltar, e a tradução usa só esse vocabulário', async () => {
    expect(simboloDaLeitura('x é parte do todo', 'predicado', [])).toBe('ParteDoTodo')
    expect(simboloDaLeitura('x invalida a existência de y', 'predicado', [])).toBe('InvalidaAExistenciaDe')
    expect(simboloDaLeitura('Deus', 'constante', [])).toBe('deus')
    expect(simboloDaLeitura('x é parte do todo', 'predicado', ['ParteDoTodo'])).toBe('ParteDoTodo2')
    expect(simboloDaLeitura('???', 'predicado', [])).toBe('Termo')
    expect(leituraComVariavel('é parte do todo', 1)).toBe('x é parte do todo')
    expect(leituraComVariavel('x é parte do todo', 1)).toBe('x é parte do todo')
    expect(leituraComVariavel('Deus', 0)).toBe('Deus')
    const pedidos: unknown[] = []
    const cliente: ClienteIA = {
      formalizar: async (t) => { pedidos.push(t); return { conteudo: PROPOSTA } },
      conferir: async () => ({ classeZ3: 'segue', motivo: '' }), revisar: async () => undefined, estadoRevisao: async () => ({ estado: 'livre' }),
    }
    await executar(cliente, 'verificar', 'Todo cliente tem suporte. A padaria é cliente. Então a padaria tem suporte.', (c) => lerProposta(c, VOCAB), () => undefined, undefined, VOCAB)
    expect(pedidos).toEqual([{ premissas: ['Todo cliente tem suporte.', 'A padaria é cliente.'], conclusao: 'Então a padaria tem suporte.', vocabulario: VOCAB }])
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

  it('a afirmação solta: sem modelo, pede o raciocínio por trás com a própria frase; a generalização cai com um caso contrário', () => {
    // o caso real do dono (29/10/2026): a resposta antiga só dizia que não havia o que provar
    const p = respostaAfirmacao('toda pessoa possui senso proprio da realidade, e isso não invalida a visão dos outros')
    expect(p).toContain('é uma posição')
    expect(p).toContain('Logo, toda pessoa possui senso proprio da realidade, e isso não invalida a visão dos outros."')
    expect(p).toContain('a ligação que falta')
    const r = respostaAfirmacao('Todo humano é burro')
    expect(r).toContain('generalização ("todo…")')
    expect(r).toContain('um único caso contrário')
    expect(respostaAfirmacao('O mercado vai crescer')).not.toContain('generalização')
  })
})
