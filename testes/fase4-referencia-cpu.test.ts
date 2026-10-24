import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ARGS_CVC5_CPU, ENTRADA_CPU, SHA_ENTRADA_CPU, LIMITE_CPU, gerarReferenciaCpu, verificarReferenciaCpu, shaCpu, type ConfigCpu } from '../src/fase4/referencia-cpu-node'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
const spawn = vi.mocked(spawnSync)
let raiz: string, pacote: string, config: ConfigCpu
// Artefato deliberadamente fictício: testa fronteira do adaptador, não semântica Alethe.
const provaMock = '(step fim (cl) :rule REGRA_FICTICIA)\n'
const retorno = (texto: string) => ({ status: 0, signal: null, stdout: Buffer.from(texto), stderr: Buffer.alloc(0), pid: 1, output: [] })
beforeEach(() => {
  vi.resetAllMocks()
  raiz = mkdtempSync(join(tmpdir(), 'cosmos-fase4-cpu-'))
  pacote = join(raiz, 'pacote')
  const cvc = join(raiz, 'cvc5-mock'), carcara = join(raiz, 'carcara-mock')
  writeFileSync(cvc, 'produtor ficticio'); writeFileSync(carcara, 'checker ficticio')
  config = { cvc5: { binario: cvc, sha256: shaCpu(readFileSync(cvc)) }, carcara: { binario: carcara, sha256: shaCpu(readFileSync(carcara)) } }
  spawn.mockReturnValue(retorno('unsat\n' + provaMock) as ReturnType<typeof spawnSync>)
})
afterEach(() => { rmSync(raiz, { recursive: true, force: true }) })
function gerar() { expect(gerarReferenciaCpu(pacote, config).estado).toBe('gerado-nao-verificado'); spawn.mockReset() }
function verificar(c = config) { return verificarReferenciaCpu(pacote, join(raiz, 'conferencia'), c) }
function mudarCert(mudar: (c: Record<string, unknown>) => void) {
  const c = JSON.parse(readFileSync(join(pacote, 'cert.json'), 'utf8')); mudar(c)
  writeFileSync(join(pacote, 'cert.json'), JSON.stringify(c, null, 2) + '\n')
}

describe('entrada fixa CPU, sem GPU', () => {
  it('vincula os bytes exatos da entrada e fixa seed/opções do produtor', () => {
    expect(shaCpu(readFileSync(ENTRADA_CPU))).toBe(SHA_ENTRADA_CPU)
    expect(ARGS_CVC5_CPU).toEqual(['--dump-proofs', '--proof-format-mode=alethe', '--seed=0'])
  })
  it('enumera as 4096 atribuições e confirma UNSAT das 34 cláusulas; controle enfraquecido é SAT', () => {
    const linhas = readFileSync(ENTRADA_CPU, 'utf8').split('\n').filter(l => l.startsWith('(assert '))
    expect(linhas).toHaveLength(34)
    const satisfaz = (ls: string[], mask: number) => ls.every(l => {
      const negada = l.includes('(not ')
      const literais = [...l.matchAll(/p([0-3])h([0-2])/g)]
      return literais.some(m => Boolean(mask & (1 << (Number(m[1]) * 3 + Number(m[2])))) !== negada)
    })
    const atribs = Array.from({ length: 4096 }, (_, i) => i)
    expect(atribs.some(m => satisfaz(linhas, m))).toBe(false)
    expect(atribs.some(m => satisfaz(linhas.filter(l => !l.includes('p3h')), m))).toBe(true)
  })
})

describe('produtor CPU pinado — transporte simulado', () => {
  it('gera certificado pendente, nunca verificado; mantém bytes sem CRLF normalizado', () => {
    spawn.mockReturnValue(retorno('unsat\r\n' + provaMock.replaceAll('\n', '\r\n')) as ReturnType<typeof spawnSync>)
    const r = gerarReferenciaCpu(pacote, config)
    expect(r.estado).toBe('gerado-nao-verificado'); expect(r.gpu).toBe('pendente')
    expect(readFileSync(join(pacote, 'proof.alethe'), 'utf8')).toBe(provaMock.replaceAll('\n', '\r\n'))
    expect(spawn.mock.calls[0][1]).toEqual([...ARGS_CVC5_CPU, 'entrada.smt2'])
    const op = spawn.mock.calls[0][2]!
    expect(op.shell).toBe(false); expect(op.timeout).toBe(20000); expect(op.maxBuffer).toBe(LIMITE_CPU)
    expect(Object.keys(op.env!)).toEqual(process.platform === 'win32' ? ['SystemRoot'] : [])
    expect(readFileSync(join(pacote, 'entrada.smt2'))).toEqual(readFileSync(ENTRADA_CPU))
  })
  it('não sobrescreve pacote existente', () => {
    mkdirSync(pacote); writeFileSync(join(pacote, 'cert.json'), 'preservar')
    expect(gerarReferenciaCpu(pacote, config).estado).toBe('indisponivel')
    expect(readFileSync(join(pacote, 'cert.json'), 'utf8')).toBe('preservar'); expect(spawn).not.toHaveBeenCalled()
  })
  it('recusa executável divergente antes de executar', () => {
    expect(gerarReferenciaCpu(pacote, { ...config, cvc5: { ...config.cvc5, sha256: '0'.repeat(64) } }).estado).toBe('indisponivel')
    expect(spawn).not.toHaveBeenCalled(); expect(existsSync(pacote)).toBe(false)
  })
  it.each([0, -1, 1.5, Infinity, 20001])('recusa prazo inválido %s antes da execução', prazoMs => {
    expect(gerarReferenciaCpu(pacote, { ...config, prazoMs }).estado).toBe('indisponivel'); expect(spawn).not.toHaveBeenCalled()
  })
  it.each(['sat\n', 'unknown\n', 'unsat\n', 'unsat\nnao-e-prova'])('não gera certificado para saída incompleta %j', texto => {
    spawn.mockReturnValue(retorno(texto) as ReturnType<typeof spawnSync>)
    expect(gerarReferenciaCpu(pacote, config).estado).toBe('invalido'); expect(existsSync(join(pacote, 'cert.json'))).toBe(false)
  })
  it('recusa stdout excedente', () => {
    spawn.mockReturnValue(retorno('unsat\n' + 'x'.repeat(LIMITE_CPU)) as ReturnType<typeof spawnSync>)
    expect(gerarReferenciaCpu(pacote, config).estado).toBe('indisponivel')
  })
  it('recusa UTF-8 inválido', () => {
    spawn.mockReturnValue({ ...retorno(''), stdout: Buffer.from([255]) } as ReturnType<typeof spawnSync>)
    expect(gerarReferenciaCpu(pacote, config).estado).toBe('indisponivel')
  })
})

describe('conferência CPU — mocks não demonstram Carcara real', () => {
  it('sem Carcara não aprova mesmo com todos os hashes corretos', () => {
    gerar(); expect(verificar({ cvc5: config.cvc5 }).estado).toBe('indisponivel'); expect(spawn).not.toHaveBeenCalled()
  })
  it('recusa entrada trocada mesmo com certificado recalculado', () => {
    gerar(); writeFileSync(join(pacote, 'entrada.smt2'), '(check-sat)\n')
    mudarCert(c => { c.entradaSha256 = shaCpu(readFileSync(join(pacote, 'entrada.smt2'))) })
    expect(verificar().estado).toBe('invalido'); expect(spawn).not.toHaveBeenCalled()
  })
  it('recusa byte da prova adulterado sem recalcular hash', () => {
    gerar(); writeFileSync(join(pacote, 'proof.alethe'), provaMock + 'x')
    expect(verificar().estado).toBe('invalido'); expect(spawn).not.toHaveBeenCalled()
  })
  it('encaminha prova adulterada com hash recalculado ao checker; invalid recusa', () => {
    gerar(); writeFileSync(join(pacote, 'proof.alethe'), '(step errado)\n')
    mudarCert(c => { c.provaSha256 = shaCpu(readFileSync(join(pacote, 'proof.alethe'))) })
    spawn.mockReturnValue(retorno('invalid\n') as ReturnType<typeof spawnSync>)
    expect(verificar().estado).toBe('invalido'); expect(spawn).toHaveBeenCalledTimes(1)
  })
  it.each(['holey\n', 'invalid\n', '', 'valid\ninvalid\n', 'validado\n', '\u001b[32mvalid\u001b[0m'])('recusa veredito não exclusivo %j', texto => {
    gerar(); spawn.mockReturnValue(retorno(texto) as ReturnType<typeof spawnSync>)
    expect(verificar().estado).toBe('invalido')
  })
  it('só aceita status zero e veredito valid exclusivo, com escopo CPU explícito', () => {
    gerar(); spawn.mockReturnValue(retorno('valid\n') as ReturnType<typeof spawnSync>)
    expect(verificar().estado).toBe('verificado-cpu')
    expect(spawn.mock.calls[0][1]).toEqual(['--no-color', 'check', 'proof.alethe', 'entrada.smt2'])
    expect(readFileSync(join(raiz, 'conferencia', 'proof.alethe'), 'utf8')).toBe(provaMock)
  })
  it('não confia em saída valid com status não zero', () => {
    gerar(); spawn.mockReturnValue({ ...retorno('valid\n'), status: 1 } as ReturnType<typeof spawnSync>)
    expect(verificar().estado).toBe('indisponivel')
  })
  it('timeout/sinal de encerramento nunca aprova', () => {
    gerar(); spawn.mockReturnValue({ ...retorno('valid\n'), signal: 'SIGTERM', error: new Error('ETIMEDOUT') } as ReturnType<typeof spawnSync>)
    expect(verificar().estado).toBe('indisponivel')
  })
  it('recusa pin do checker divergente sem execução', () => {
    gerar(); expect(verificar({ ...config, carcara: { ...config.carcara!, sha256: '0'.repeat(64) } }).estado).toBe('indisponivel'); expect(spawn).not.toHaveBeenCalled()
  })
  it.each(['resultado', 'escopo', 'produtor', 'produtorSha256'])('recusa metadado adulterado: %s', campo => {
    gerar(); mudarCert(c => { c[campo] = 'adulterado' }); expect(verificar().estado).toBe('invalido'); expect(spawn).not.toHaveBeenCalled()
  })
  it('recusa campo desconhecido no certificado', () => {
    gerar(); mudarCert(c => { c.gpu = 'aprovada' }); expect(verificar().estado).toBe('invalido')
  })
  it('recusa chave duplicada no JSON do certificado', () => {
    gerar(); const f = join(pacote, 'cert.json'); writeFileSync(f, readFileSync(f, 'utf8').replace('{', '{"resultado":"sat",'))
    expect(verificar().estado).toBe('invalido')
  })
  it('recusa prova truncada vazia e ausente', () => {
    gerar(); writeFileSync(join(pacote, 'proof.alethe'), ''); expect(verificar().estado).toBe('invalido')
    rmSync(join(pacote, 'proof.alethe')); expect(verificar().estado).toBe('invalido')
  })
  it('recusa prova acima de 1 MiB', () => {
    gerar(); writeFileSync(join(pacote, 'proof.alethe'), Buffer.alloc(LIMITE_CPU + 1)); expect(verificar().estado).toBe('invalido')
  })
  it('não sobrescreve diretório de conferência existente', () => {
    gerar(); mkdirSync(join(raiz, 'conferencia')); expect(verificar().estado).toBe('indisponivel'); expect(spawn).not.toHaveBeenCalled()
  })
  it('não precisa executar produtor para verificar pacote exportado', () => {
    gerar(); copyFileSync(join(pacote, 'entrada.smt2'), join(raiz, 'entrada-copia.smt2'))
    spawn.mockReturnValue(retorno('valid') as ReturnType<typeof spawnSync>)
    expect(verificar({ ...config, cvc5: { ...config.cvc5, binario: '' } }).estado).toBe('verificado-cpu'); expect(spawn).toHaveBeenCalledTimes(1)
  })
})
