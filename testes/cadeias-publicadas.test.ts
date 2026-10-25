/**
 * As cadeias pessoais publicadas em cadeias/<nome>/ (cadeia.json, exportada pelo app, e revelacoes.json, as que a
 * pessoa quis abrir). Sempre: cada cadeia confere por C1–C8 e cada revelação abre o compromisso do registro fechado.
 * Com CADEIAS_SAIDA e CVC5 (o verificador público): abre cada registro revelado, com o certificado gerado pela tradução
 * t1 (Z3) e pelo cvc5, ou pela busca de modelo, confere pela conferência do Caderno e grava o registro aberto e os
 * arquivos em CADEIAS_SAIDA/<nome>/, para a implementação independente e o Carcara conferirem depois.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Formula } from '../src/logica/ast'
import { abrirRegistro, conferirRevelacaoDoRegistro, type RevelacaoDeRegistro } from '../src/motor/abrirRegistro'
import { conferirCadeiaTexto } from '../src/motor/cadeiaPessoal'
import { comoDicionario, conferirRegistro, type Ficha } from '../src/motor/registro'
import { validar } from '../src/logica/validador'
import { expandir } from '../src/logica/acucar'
// @ts-expect-error módulo .mjs sem tipos
import { extrairCorpoCvc5 } from '../scripts/fase4-extrair-cvc5.mjs'

const RAIZ = 'cadeias'
const pastas = existsSync(RAIZ) ? readdirSync(RAIZ, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []
const SAIDA = process.env.CADEIAS_SAIDA, CVC5 = process.env.CVC5
const OPCOES_CVC5 = ['--dump-proofs', '--proof-format-mode=alethe', '--proof-granularity=dsl-rewrite', '--proof-alethe-res-pivots', '--simplification=none', '--dag-thresh=0', '--tlimit=20000']
const ler = (texto: string, fichas: Ficha[]): Formula | null => { const v = validar(texto, comoDicionario(fichas)); return v.ast && v.ok ? expandir(v.ast) : null }
interface Revelada { indice: number; revelacao: RevelacaoDeRegistro }

describe('Cadeias publicadas em cadeias/', () => {
  it('há pelo menos a cadeia de exemplo', () => expect(pastas.length).toBeGreaterThan(0))

  for (const pasta of pastas) {
    it(`${pasta}: a cadeia confere por C1–C8 e cada revelação abre o compromisso do seu registro`, async () => {
      const texto = readFileSync(join(RAIZ, pasta, 'cadeia.json'), 'utf8')
      const c = await conferirCadeiaTexto(texto)
      expect(c.veredito, `${c.motivo} ${c.detalhe}`).toBe('aceita')
      const elos = JSON.parse(texto).elos as { registroTexto: string }[]
      const arquivoRev = join(RAIZ, pasta, 'revelacoes.json')
      const reveladas: Revelada[] = existsSync(arquivoRev) ? JSON.parse(readFileSync(arquivoRev, 'utf8')) : []
      for (const { indice, revelacao } of reveladas) {
        expect(elos[indice], `${pasta}: a revelação aponta para o elo ${indice}, que não existe`).toBeDefined()
        expect(await conferirRevelacaoDoRegistro(JSON.parse(elos[indice].registroTexto), revelacao), `${pasta}, elo ${indice}`).toBeNull()
      }
    })
  }

  it.runIf(!!SAIDA && !!CVC5)('abre os registros revelados com certificado e confere pela conferência do Caderno', async () => {
    const { init, killThreads } = await import('z3-solver')
    const { problemaSmt } = await import('../src/motor/z3')
    const { modeloExatoPeloZ3 } = await import('../src/motor/z3Modelo')
    const api = await init()
    const tmp = mkdtempSync(join(tmpdir(), 'cosmos-cvc5-'))
    try {
      const refutar = async (problema: string) => {
        const arq = join(tmp, 'p.smt2'); writeFileSync(arq, problema)
        const r = spawnSync(CVC5!, [...OPCOES_CVC5, arq], { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })
        const saida = r.stdout ?? ''
        if (saida.startsWith('sat')) return { veredito: 'sat' as const }
        const unsat = /^unsat\r?\n/.exec(saida)
        if (!unsat) return { veredito: 'unknown' as const }
        const { corpo } = extrairCorpoCvc5(Buffer.from(saida.slice(unsat[0].length).replace(/\r\n/g, '\n')))
        const prova = corpo.toString('utf8')
        // sem passo hole nem trust: uma prova com lacuna não é certificado
        return /\b(hole|trust)\b/.test(prova) ? { veredito: 'unknown' as const } : { veredito: 'unsat' as const, prova }
      }
      const traduzir = (fs: Formula[], numericos: Set<string>) => problemaSmt(api, fs, numericos)
      const modeloExato = async (fs: Formula[], numericos: Set<string>) => { const e = await modeloExatoPeloZ3(api, fs, numericos); return 'modelo' in e ? e.modelo : null }
      for (const pasta of pastas) {
        const elos = JSON.parse(readFileSync(join(RAIZ, pasta, 'cadeia.json'), 'utf8')).elos as { registroTexto: string }[]
        const arquivoRev = join(RAIZ, pasta, 'revelacoes.json')
        const reveladas: Revelada[] = existsSync(arquivoRev) ? JSON.parse(readFileSync(arquivoRev, 'utf8')) : []
        const resultados = []
        for (const { indice, revelacao } of reveladas) {
          const a = await abrirRegistro(JSON.parse(elos[indice].registroTexto), revelacao, `E${indice}`, { traduzir, refutar, modeloExato })
          if (a.estado === 'pendente') { resultados.push({ indice, estado: a.estado, detalhe: a.detalhe }); continue }
          // o registro aberto, ou, quando a afirmação não vale, o contra-registro que mostra isso: os dois com certificado
          const { registro, arquivos } = a.estado === 'aberto' ? a : a.contra
          for (const [caminho, conteudo] of Object.entries(arquivos)) { const destino = join(SAIDA!, pasta, caminho); mkdirSync(dirname(destino), { recursive: true }); writeFileSync(destino, conteudo) }
          const c = await conferirRegistro(registro, { ler, arquivo: (p) => (arquivos[p] === undefined ? null : new TextEncoder().encode(arquivos[p])), traduzir })
          expect(c.motivo, `${pasta}, elo ${indice}: ${c.detalhe}`).toBeNull()
          resultados.push(a.estado === 'aberto'
            ? { indice, estado: 'aberto', provasParaOCarcara: c.provasSemConferir, registro }
            : { indice, estado: 'nao-se-sustenta', detalhe: a.detalhe, provasParaOCarcara: c.provasSemConferir, contra: registro })
        }
        // a cadeia de exemplo tem resposta conhecida: quatro abertos, um falso de propósito (G03) e um com números
        if (pasta === 'exemplo-rfc8032') expect(resultados.map((x) => `${x.indice}:${x.estado}`)).toEqual(['0:aberto', '1:aberto', '2:aberto', '3:aberto', '4:nao-se-sustenta', '5:aberto'])
        // o G03 do teste real com três notebooks (25/10/2026): o notebook A afirmou que Q(b) segue de ∀x (P(x) ⟹ Q(x)) e P(a)
        if (pasta === 'teste-3-notebooks-a') expect(resultados.map((x) => `${x.indice}:${x.estado}`)).toEqual(['0:aberto', '1:nao-se-sustenta'])
        mkdirSync(join(SAIDA!, pasta), { recursive: true })
        writeFileSync(join(SAIDA!, pasta, 'registros.json'), JSON.stringify({ pasta, resultados }, null, 2))
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      await killThreads(api.em)
    }
  }, 600_000)
})
