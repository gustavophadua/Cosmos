/**
 * Os testes de rede G01–G06 (src/v3/catalogo.ts, TESTES_REDE), simulados num aparelho com três chaves, como o roteiro
 * especificacao/teste-3-notebooks.md manda fazer com três computadores de verdade. Esta simulação não substitui o
 * teste real: ela mostra que o software dá as respostas que o roteiro espera.
 */
import { describe, it, expect } from 'vitest'
import { anexar, criarChave, montarRegistroFechado, receber, type ChaveLocal, type DadosRegistro, type VersaoConhecida } from '../src/interfaces/cadeiaLocal'
import { abrirRegistro } from '../src/motor/abrirRegistro'
import { comoDicionario, conferirRegistro, type Ficha } from '../src/motor/registro'
import { validar } from '../src/logica/validador'
import { expandir } from '../src/logica/acucar'
import { conferirCadeia, type Cadeia } from '../src/motor/cadeiaPessoal'
import { TESTES_REDE } from '../src/v3/catalogo'

const RAPIDO = 100_000
const base: DadosRegistro = { afirmacao: 'consistente', formula: 'P(a)', premissas: ['∀x (P(x) ⟹ Q(x))'], teoriaNome: 'Todo P é Q', tipo: 'hipótese', dominio: 'teste de rede', estado: 'proposta' }

class Aparelho {
  conhecidas: VersaoConhecida[] = []
  cadeia: Cadeia | null = null
  constructor(readonly nome: string, readonly chave: ChaveLocal) {}
  async registrar(d: Partial<DadosRegistro> = {}) {
    const { registroTexto, revelacao } = await montarRegistroFechado({ ...base, ...d }, this.chave.publica)
    this.cadeia = (await anexar(this.cadeia, this.chave, registroTexto)).cadeia
    return revelacao
  }
  arquivo() { return JSON.stringify(this.cadeia) }
  async receberDe(texto: string) {
    const r = await receber(texto, this.conhecidas)
    if (r.conferencia.veredito === 'aceita' && (r.relacao === 'nova' || r.relacao === 'extensao'))
      this.conhecidas = [...this.conhecidas.filter((v) => v.chave !== r.chave), { chave: r.chave!, resumos: r.conferencia.resumos, recebidaEm: 'teste', texto }]
    return r
  }
}

describe('Rede G01–G06, simulada com três aparelhos', () => {
  it('o catálogo tem os seis testes do roteiro', () => expect(TESTES_REDE.map((t) => t.id)).toEqual(['G01', 'G02', 'G03', 'G04', 'G05', 'G06']))

  it('G01–G06', async () => {
    const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(async (n) => new Aparelho(n, (await criarChave(`senha do aparelho ${n}`, RAPIDO)).chave)))
    for (const x of [A, B, C]) await x.registrar()

    // G06: os três trocam as cadeias por arquivo, e cada um aceita as dos outros dois
    for (const x of [A, B, C]) for (const y of [A, B, C]) if (x !== y) expect((await y.receberDe(x.arquivo())).relacao).toBe('nova')
    for (const y of [A, B, C]) expect(y.conhecidas).toHaveLength(2)

    // G01: fórmula alterada no arquivo (um byte do registro) → assinatura que não vale (C8)
    expect((await B.receberDe(A.arquivo().replace('proposta', 'Proposta'))).conferencia).toMatchObject({ veredito: 'recusada', motivo: 'C8', elo: 0 })

    // G02: o mesmo arquivo de novo é idempotente (igual); outro conteúdo no mesmo índice é conflito (bifurcada)
    expect((await B.receberDe(A.arquivo())).relacao).toBe('igual')
    const outraHistoria = (await anexar(null, A.chave, (await montarRegistroFechado({ ...base, formula: 'Q(a)' }, A.chave.publica)).registroTexto)).cadeia
    expect(await B.receberDe(JSON.stringify(outraHistoria))).toMatchObject({ relacao: 'bifurcada', elo: 0 })

    // G04: C fica desligado enquanto A registra mais dois; ao voltar, a versão nova é extensão (o prefixo se mantém)
    await A.registrar({ formula: 'Q(a)' }); await A.registrar({ formula: 'P(b)' })
    expect((await C.receberDe(A.arquivo())).relacao).toBe('extensao')
    // ... e um arquivo com um elo tirado do meio é recusado (lacuna)
    const lacuna = structuredClone(A.cadeia!); lacuna.elos.splice(1, 1)
    expect(['C4', 'C5']).toContain((await C.receberDe(JSON.stringify(lacuna))).conferencia.motivo)

    // G05: a versão antiga (mais curta) depois da nova é acusada como encurtada
    const v1 = structuredClone(A.cadeia!); v1.elos = v1.elos.slice(0, 1)
    expect((await C.receberDe(JSON.stringify(v1))).relacao).toBe('encurtada')

    // G03: conclusão falsa: "segue" que não segue é recusada ao abrir. Aqui o cvc5 é simulado (responde sat), mas o
    // contramodelo vem da busca real do motor e sai como contra-registro "não segue", conferido pela conferência de
    // registro-v1. O caminho com o cvc5 e o Carcara de verdade roda no verificador público (cadeias/exemplo-rfc8032, elo 4).
    const falsa = await A.registrar({ afirmacao: 'segue', tipo: 'teorema', formula: 'P(b)', premissas: ['∀x (P(x) ⟹ Q(x))'] })
    const elo = A.cadeia!.elos.at(-1)!
    const aberto = await abrirRegistro(JSON.parse(elo.registroTexto), falsa, 'G03', { traduzir: () => '', refutar: async () => ({ veredito: 'sat' }) })
    expect(aberto.estado).toBe('nao-se-sustenta')
    if (aberto.estado !== 'nao-se-sustenta') throw new Error('G03')
    expect(aberto.contra.registro).toMatchObject({ afirmacao: 'nao-segue', tipo: 'hipótese', situacao: 'aberto', certificado: { modelo: expect.anything() } })
    const ler = (t: string, fichas: Ficha[]) => { const v = validar(t, comoDicionario(fichas)); return v.ast && v.ok ? expandir(v.ast) : null }
    expect((await conferirRegistro(aberto.contra.registro, { ler, arquivo: () => null, traduzir: () => '' })).motivo).toBeNull()
    // um cvc5 que diz sat sem que haja modelo exportável fica como diagnóstico do produtor (pendente), não como refutação
    const premissaDura = await A.registrar({ afirmacao: 'segue', tipo: 'teorema', formula: 'Q(a)', premissas: ['∀x (P(x) ⟹ Q(x))', 'P(a)'] })
    const semModelo = await abrirRegistro(JSON.parse(A.cadeia!.elos.at(-1)!.registroTexto), premissaDura, 'G03b', { traduzir: () => '', refutar: async () => ({ veredito: 'sat' }) })
    expect(semModelo).toMatchObject({ estado: 'pendente', detalhe: expect.stringContaining('diagnóstico do produtor') })

    // no fim, as três cadeias continuam conferindo
    for (const x of [A, B, C]) expect((await conferirCadeia(x.cadeia)).veredito).toBe('aceita')
  }, 60_000)
})
