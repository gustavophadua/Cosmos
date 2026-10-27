/**
 * Gera cadeias/exemplo-contraponto/ (só com GERAR_CADEIA_CONTRAPONTO=1): três registros que o verificador público abre
 * com o cvc5 e o Carcara de verdade, para os casos da resposta do GPT ao contraponto.
 *   elo 0 · CP07: "Q(b) segue de ∀x (P(x) ⟹ Q(x)) e P(a)": não se sustenta, com contramodelo exportável;
 *   elo 1 · CP08: a mesma conclusão com P(b) acrescentado: segue, apesar da refutação anterior (a memória não bloqueia);
 *   elo 2 · CP05: "R segue de S e ¬S": a base é inconsistente; abre com a marca vazio, não como consequência informativa.
 * A chave é a do teste 2 da RFC 8032: a privada é pública de propósito, como a de cadeias/exemplo-rfc8032.
 */
import { it, expect } from 'vitest'
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { montarRegistroFechado, type DadosRegistro } from '../src/interfaces/cadeiaLocal'
import { conferirCadeia, FORMATO_CADEIA, novoElo, ZEROS, type Cadeia } from '../src/motor/cadeiaPessoal'

const SEMENTE_RFC8032_TESTE2 = '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'
const PUBLICA_RFC8032_TESTE2 = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'

it.runIf(!!process.env.GERAR_CADEIA_CONTRAPONTO)('gera cadeias/exemplo-contraponto', async () => {
  const privada = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(SEMENTE_RFC8032_TESTE2, 'hex')]), format: 'der', type: 'pkcs8' })
  const publica = createPublicKey(privada).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
  expect(publica).toBe(PUBLICA_RFC8032_TESTE2)
  const base: Omit<DadosRegistro, 'formula' | 'premissas'> = { afirmacao: 'segue', teoriaNome: 'Contraponto', tipo: 'teorema', dominio: 'exemplo', estado: 'proposta' }
  const registros = [
    { formula: 'Q(b)', premissas: ['∀x (P(x) ⟹ Q(x))', 'P(a)'] },
    { formula: 'Q(b)', premissas: ['∀x (P(x) ⟹ Q(x))', 'P(a)', 'P(b)'] },
    { formula: 'R', premissas: ['S', '¬S'] },
  ]
  const cadeia: Cadeia = { formato: FORMATO_CADEIA, chave: publica, elos: [] }
  const revelacoes = []
  let anterior = ZEROS
  for (const [indice, r] of registros.entries()) {
    const { registroTexto, revelacao } = await montarRegistroFechado({ ...base, ...r }, publica)
    const { elo, resumo } = await novoElo(publica, indice, anterior, registroTexto, async (m) => new Uint8Array(sign(null, m, privada)))
    cadeia.elos.push(elo); revelacoes.push({ indice, revelacao }); anterior = resumo
  }
  expect((await conferirCadeia(cadeia)).veredito).toBe('aceita')
  mkdirSync('cadeias/exemplo-contraponto', { recursive: true })
  writeFileSync('cadeias/exemplo-contraponto/cadeia.json', JSON.stringify(cadeia))
  writeFileSync('cadeias/exemplo-contraponto/revelacoes.json', JSON.stringify(revelacoes, null, 2) + '\n')
})
