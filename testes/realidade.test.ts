import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lerFormula, type Termo } from '../src/motor/avaliacao'
import { alinhar, BASE_REAL, confrontarRealidade, type ClassificarComVocabulario } from '../src/motor/realidade'
import { FATOS, VOCABULARIO_REAL } from '../src/dados/realidade-v1'

const t = (simbolo: string, leitura: string, aridade = 1, tipo: 'predicado' | 'constante' = 'predicado'): Termo => ({ simbolo, tipo, aridade, leitura })
const base = VOCABULARIO_REAL.map(({ simbolo, tipo, aridade, leitura }) => ({ simbolo, tipo, aridade, leitura }))

describe('a base de fatos', () => {
  it('cada fato se lê no vocabulário da base, tem fonte e id único; todo símbolo da base aparece em algum fato', () => {
    for (const f of FATOS) { expect(() => lerFormula(f.formula, base)).not.toThrow(); expect(f.fonte.nome.length).toBeGreaterThan(0) }
    expect(new Set(FATOS.map((f) => f.id)).size).toBe(FATOS.length)
    for (const s of VOCABULARIO_REAL) expect(FATOS.some((f) => new RegExp(`\\b${s.simbolo}\\(`).test(f.formula)), s.simbolo).toBe(true)
  })

  it('o alinhamento é por sinônimo exato, visível, e não alinha negação nem leitura ambígua', () => {
    const a = alinhar({ vocabulario: [t('Esquentou', 'x esquentou'), t('NaoEsquenta', 'x não esquenta'), t('TemVirus', 'x tem vírus'), t('celular', 'o celular', 0, 'constante'), t('Corpo', 'x faz parte do corpo docente')],
      premissas: ['Esquentou(celular)', 'NaoEsquenta(celular)', 'Corpo(celular)'], conclusao: 'TemVirus(celular)' })
    expect(a.alinhamentos.map((x) => [x.de, x.para])).toEqual([['Esquentou', 'Esquenta']])
    expect(a.tipagens.map((x) => x.formula)).toEqual(['Celular(celular)'])
    // o "Corpo" da pessoa é outra coisa: ganha outro nome, não se mistura com o da base
    expect(a.premissas).toEqual(['Esquenta(celular)', 'NaoEsquenta(celular)', 'CorpoDito(celular)'])
    expect(a.conclusao).toBe('TemVirus(celular)')
  })

  it('uma constante com nome de variável ("x") ganha outro nome e não se mistura com o x dos fatos', () => {
    // caso real (RF-07, 01/11/2026): o modelo declarou a constante x, e os fatos da base, que quantificam x, não se liam
    const a = alinhar({ vocabulario: [t('Consome', 'x consome y', 2), t('x', 'X', 0, 'constante'), t('oxigenio', 'oxigênio', 0, 'constante')], premissas: [], conclusao: 'Consome(x, oxigenio)' })
    expect(a.conclusao).toBe('Consome(xDito, oxigenio)')
    for (const f of FATOS) expect(() => lerFormula(f.formula, a.vocabulario)).not.toThrow()
  })
})

describe('o argumento diante da realidade registrada (Z3 real)', () => {
  let api: Awaited<ReturnType<typeof import('z3-solver')['init']>>
  let encerrar: typeof import('z3-solver')['killThreads']
  beforeAll(async () => { const z3 = await import('z3-solver'); encerrar = z3.killThreads; api = await z3.init() }, 120_000)
  afterAll(async () => { if (api) await encerrar(api.em) })
  const classificar: ClassificarComVocabulario = async (v, ps, c) => (await import('../src/motor/avaliacaoZ3')).classificar(api, v, ps, c, 5_000)

  it('a base é consistente', async () => {
    const v = [...base, t('a', 'a', 0, 'constante')]
    await expect(classificar(v, FATOS.map((f) => f.formula), 'Humano(a)')).resolves.toBe('independente')
  }, 60_000)

  it('"O celular esquentou, logo tem vírus": o calor tem causas registradas; o vírus não está em fato nenhum', async () => {
    const r = await confrontarRealidade(classificar,
      { vocabulario: [t('Esquentou', 'x esquentou'), t('TemVirus', 'x tem vírus'), t('celular', 'o celular', 0, 'constante')], premissas: ['Esquentou(celular)'], conclusao: 'TemVirus(celular)' },
      { premissas: ['O celular esquentou.'], conclusao: 'Logo, está com vírus.' })
    expect(r.frases.map((f) => f.situacao)).toEqual(['observacao', 'fora'])
    const m = r.mecanismos[0]
    expect(m.implica.map((x) => x.formula)).toEqual(['GeraCalor(celular) ∨ RecebeEnergia(celular)'])
    expect(m.caminhos.map((c) => [c.condicao, c.fatos])).toEqual(expect.arrayContaining([['Funcionando(celular)', ['R01', 'R03']], ['ExpostoAoSol(celular)', ['R21']]]))
    expect(r.conclusaoComRelato).toBe('independente')
  }, 120_000)

  it('"Ana é uma pessoa, logo Ana voa": os fatos contrariam a conclusão; "todo ser humano pode morrer" é fato', async () => {
    const r = await confrontarRealidade(classificar,
      { vocabulario: [t('Pessoa', 'x é uma pessoa'), t('Voa', 'x voa'), t('ana', 'Ana', 0, 'constante')], premissas: ['Pessoa(ana)'], conclusao: 'Voa(ana)' },
      { premissas: ['Ana é uma pessoa.'], conclusao: 'Logo, Ana voa.' })
    expect(r.frases.map((f) => f.situacao)).toEqual(['observacao', 'observacao'])
    expect(r.conclusaoComRelato).toBe('contradiz')
    const s = await confrontarRealidade(classificar,
      { vocabulario: [t('Humano', 'x é um ser humano'), t('Morre', 'x pode morrer'), t('Voa', 'x voa')], premissas: ['∀x (Humano(x) ⟹ Morre(x))'], conclusao: '∀x (Humano(x) ⟹ Voa(x))' },
      { premissas: ['Todo ser humano pode morrer.'], conclusao: 'Logo, todo ser humano voa.' })
    expect(s.frases.map((f) => [f.situacao, f.fatos])).toEqual([['fato', ['R05', 'R06', 'R07']], ['contraria', ['R10', 'R22']]])
  }, 120_000)

  it('o que não fala de nada que a base conhece fica como visão, sem chute', async () => {
    const r = await confrontarRealidade(classificar,
      { vocabulario: [t('VeComoDeus', 'x vê os outros como deuses'), t('Sofre', 'x sofre'), t('maria', 'Maria', 0, 'constante')], premissas: ['VeComoDeus(maria)'], conclusao: 'Sofre(maria)' },
      { premissas: ['Maria vê os outros como deuses.'], conclusao: 'Logo, Maria sofre.' })
    expect(r.frases.map((f) => f.situacao)).toEqual(['fora', 'fora'])
    expect(r.mecanismos).toEqual([])
    expect(BASE_REAL.fatos.length).toBe(FATOS.length)
  }, 60_000)
})

describe('o resultado que vem do serviço', () => {
  it('só passa com a forma certa', async () => {
    const { lerResultadoRealidade } = await import('../src/motor/realidade')
    const ok = { versao: 'realidade-v1', alinhamentos: [], tipagens: [], frases: [{ frase: 'a', formula: 'A(c)', conclusao: true, situacao: 'fato', fatos: ['R01'] }], mecanismos: [], conclusaoComRelato: null }
    expect(lerResultadoRealidade(ok)).toBe(true)
    expect(lerResultadoRealidade({ ...ok, versao: 'outra' })).toBe(false)
    expect(lerResultadoRealidade({ ...ok, frases: [{ ...ok.frases[0], situacao: 'verdade' }] })).toBe(false)
    expect(lerResultadoRealidade({ ...ok, conclusaoComRelato: 'talvez' })).toBe(false)
  })
})
