/*
 * A cadeia pessoal no app (Fase 3, especificacao/cadeia-v1.md): a chave Ed25519 da pessoa, os registros que ela
 * assina (registro-v1, fechados: o compromisso vai na cadeia, e a fórmula fica guardada para revelar depois com o
 * certificado), o arquivo da cadeia para trocar com outros aparelhos e a comparação de versões recebidas.
 * A chave privada vive como chave do WebCrypto que o código não consegue exportar; a única cópia legível dela é a
 * cópia de segurança cifrada com a senha da pessoa, feita na criação (seção 6 da especificação).
 */
import { expandir } from '../logica/acucar'
import type { Formula } from '../logica/ast'
import { usosDeNomes } from '../logica/termos'
import { validar } from '../logica/validador'
import { conferirAssinatura } from '../motor/ed25519'
import { compararVersoes, conferirCadeia, conferirCadeiaTexto, deHex, FORMATO_CADEIA, novoElo, paraHex, ZEROS, type Cadeia, type ConferenciaDaCadeia, type RelacaoDeVersoes } from '../motor/cadeiaPessoal'
import { AFIRMACOES, comoDicionario, compromissoDe, conferirRegistro, FORMATO_REGISTRO, formaCanonica, sha256, textoDaFormula, textoDaTeoria, TIPOS, type Afirmacao, type Ficha } from '../motor/registro'

// ---- as fichas e o registro fechado

export interface Leitura { formula: Formula | null; erro: string | null }
/** A leitura m2 de um texto com as fichas: a árvore expandida, ou o primeiro erro, com a mensagem do leitor. */
export function lerComFichas(texto: string, fichas: Ficha[]): Leitura {
  const v = validar(texto, comoDicionario(fichas))
  if (!v.ast || !v.ok) return { formula: null, erro: v.diags.find(d => d.nivel === 'erro')?.msg ?? 'a fórmula não se lê' }
  return { formula: expandir(v.ast), erro: null }
}

/**
 * As fichas que os textos pedem, deduzidas do uso: predicados, funções e constantes (numéricas quando aparecem em
 * conta). Um nome solto no lugar de fórmula vira proposição (predicado de aridade 0). Um nome usado de dois jeitos
 * é recusado: aí a pessoa precisa escolher.
 */
export function deduzirFichas(textos: string[]): { fichas: Ficha[]; erro: string | null } {
  const fichas = new Map<string, Ficha>()
  const proposicoes = new Set<string>()
  for (let volta = 0; volta < 50; volta++) {
    const atuais = () => [...fichas.values(), ...[...proposicoes].map(p => ({ simbolo: p, tipo: 'predicado', aridade: 0 }) as Ficha)]
    let nova = false
    for (const texto of textos) {
      const v = validar(texto, comoDicionario(atuais()))
      if (!v.ast) {
        // o leitor diz "Se 'P' é uma proposição, declare-a": declarar P e tentar de novo
        const nome = v.diags.map(d => /Se '([^']+)' é uma proposição/.exec(d.msg)?.[1]).find(Boolean)
        if (nome && !proposicoes.has(nome) && !fichas.has(nome)) { proposicoes.add(nome); nova = true; break }
        return { fichas: atuais(), erro: `${texto}: ${v.diags.find(d => d.nivel === 'erro')?.msg ?? 'não se lê'}` }
      }
      for (const u of usosDeNomes(v.ast)) {
        if (proposicoes.has(u.nome)) continue
        const antes = fichas.get(u.nome)
        if (antes && (antes.tipo !== u.tipo || antes.aridade !== u.aridade)) return { fichas: atuais(), erro: `o nome ${u.nome} aparece como ${antes.tipo} de aridade ${antes.aridade} e como ${u.tipo} de aridade ${u.aridade}` }
        const ficha: Ficha = { simbolo: u.nome, tipo: u.tipo as Ficha['tipo'], aridade: u.aridade }
        if (u.tipo !== 'predicado' && (u.numerico || antes?.numerico)) ficha.numerico = true
        if (!antes || (ficha.numerico && !antes.numerico)) { fichas.set(u.nome, ficha); if (antes) nova = true }
      }
    }
    if (!nova) {
      const todas = atuais()
      for (const texto of textos) { const l = lerComFichas(texto, todas); if (l.erro) return { fichas: todas, erro: `${texto}: ${l.erro}` } }
      return { fichas: todas, erro: null }
    }
  }
  return { fichas: [], erro: 'as fichas não se resolveram' }
}

export interface DadosRegistro {
  afirmacao: Afirmacao
  formula: string
  premissas: string[]
  teoriaNome: string
  tipo: (typeof TIPOS)[number]
  dominio: string
  estado: 'proposta' | 'corroborada' | 'contestada' | 'refutada' | 'sem avaliação'
}
/** O que fica guardado para abrir o registro depois: sem isso, o compromisso não se revela. */
export interface Revelacao {
  formato: 'cosmos-revelacao-v1'
  compromisso: string
  sal: string
  formula: string
  formaCanonica: string
  teoria: { nome: string; fichas: Ficha[]; premissas: string[]; hash: string }
}
const hexAleatorio = (n: number) => paraHex(crypto.getRandomValues(new Uint8Array(n)))

/**
 * O registro fechado (seções 2 a 4 de registros-v1.md): a afirmação, o tipo, o domínio, o estado, o hash da teoria e
 * o compromisso da fórmula com um sal de 32 bytes. A fórmula, as premissas e o sal vão na revelação, que fica com a
 * pessoa. A conferência do próprio formato roda antes de devolver.
 */
export async function montarRegistroFechado(d: DadosRegistro, chavePublica: string): Promise<{ registroTexto: string; revelacao: Revelacao }> {
  if (!AFIRMACOES.includes(d.afirmacao)) throw new Error('afirmação desconhecida')
  if ((d.tipo === 'teorema') !== (d.afirmacao === 'segue')) throw new Error('"segue" vai com o tipo teorema, e teorema só com "segue"')
  if (!d.teoriaNome.trim() || !d.dominio.trim()) throw new Error('a teoria e o domínio precisam de nome')
  const textos = [d.formula, ...d.premissas].map(t => t.trim().normalize('NFC')).filter(Boolean)
  if (!d.formula.trim()) throw new Error('falta a fórmula')
  const { fichas, erro } = deduzirFichas(textos)
  if (erro) throw new Error(erro)
  const ler = (t: string) => { const l = lerComFichas(t, fichas); if (!l.formula) throw new Error(`${t}: ${l.erro}`); return l.formula }
  const formula = d.formula.trim().normalize('NFC'), premissas = d.premissas.map(p => p.trim().normalize('NFC')).filter(Boolean)
  const canonica = formaCanonica(ler(formula))
  const teoriaHash = await sha256(textoDaTeoria(premissas.map(p => formaCanonica(ler(p))), fichas))
  const sal = hexAleatorio(32)
  const compromisso = await compromissoDe(sal, textoDaFormula(canonica, fichas))
  const registro = {
    formato: FORMATO_REGISTRO, situacao: 'fechado', afirmacao: d.afirmacao,
    teoria: { nome: d.teoriaNome.trim().normalize('NFC'), hash: teoriaHash },
    tipo: d.tipo, dominio: d.dominio.trim().normalize('NFC'), estado: d.estado,
    semantica: { gramatica: 'm2', traducao: 't1' }, autor: await sha256(deHex(chavePublica)), compromisso: { hash: compromisso },
  }
  const registroTexto = JSON.stringify(registro)
  const forma = await conferirRegistro(registro, { ler: () => null, arquivo: () => null, traduzir: () => '' })
  if (forma.motivo) throw new Error(`o registro saiu fora da forma (${forma.motivo}): ${forma.detalhe}`)
  return { registroTexto, revelacao: { formato: 'cosmos-revelacao-v1', compromisso, sal, formula, formaCanonica: canonica, teoria: { nome: registro.teoria.nome, fichas, premissas, hash: teoriaHash } } }
}

/** Confere uma revelação contra o registro: o compromisso refeito com o sal e o hash da teoria. */
export async function conferirRevelacao(r: Revelacao, registroTexto: string): Promise<boolean> {
  const reg = JSON.parse(registroTexto) as { compromisso: { hash: string }; teoria: { hash: string } }
  const ler = (t: string) => lerComFichas(t, r.teoria.fichas).formula
  const f = ler(r.formula)
  if (!f || formaCanonica(f) !== r.formaCanonica) return false
  const premissas = r.teoria.premissas.map(ler)
  if (premissas.some(p => !p)) return false
  const teoria = await sha256(textoDaTeoria(premissas.map(p => formaCanonica(p!)), r.teoria.fichas))
  return reg.compromisso.hash === r.compromisso && r.compromisso === await compromissoDe(r.sal, textoDaFormula(r.formaCanonica, r.teoria.fichas)) && teoria === r.teoria.hash && reg.teoria.hash === teoria
}

// ---- a chave e a cópia de segurança

export interface CopiaDaChave {
  formato: 'cosmos-chave-ed25519-cifrada-v1'
  chave: string
  kdf: { algoritmo: 'PBKDF2-SHA-256'; iteracoes: number; sal: string }
  cifra: { algoritmo: 'AES-256-GCM'; iv: string }
  cifrado: string
}
export interface ChaveLocal { publica: string; privada: CryptoKey }
export const ITERACOES_PADRAO = 600_000
export const SENHA_MINIMA = 12

async function chaveDaSenha(senha: string, sal: Uint8Array, iteracoes: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteracoes }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
const contexto = (chave: string) => new TextEncoder().encode(`cosmos-chave-ed25519-cifrada-v1|${chave}`)

/** Confere que a chave privada assina pela chave pública: uma assinatura de teste, conferida pela regra estrita. */
async function conferirPar(publica: string, privada: CryptoKey): Promise<void> {
  const teste = new TextEncoder().encode(`cosmos-teste-de-chave|${publica}`)
  const assinatura = new Uint8Array(await crypto.subtle.sign('Ed25519', privada, teste))
  if (!(await conferirAssinatura(deHex(publica), teste, assinatura))) throw new Error('a chave privada não corresponde à chave pública')
}

/**
 * Cria a chave e a cópia de segurança cifrada com a senha. A chave privada volta como não exportável; os bytes dela
 * só existem, legíveis, durante a criação, e são apagados da memória ao fim.
 */
export async function criarChave(senha: string, iteracoes = ITERACOES_PADRAO): Promise<{ chave: ChaveLocal; copia: CopiaDaChave }> {
  if (senha.length < SENHA_MINIMA) throw new Error(`a senha tem pelo menos ${SENHA_MINIMA} caracteres`)
  const par = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair
  const publica = paraHex(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))
  try {
    const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: contexto(publica) }, await chaveDaSenha(senha, sal, iteracoes), pkcs8))
    const privada = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign'])
    await conferirPar(publica, privada)
    return { chave: { publica, privada }, copia: { formato: 'cosmos-chave-ed25519-cifrada-v1', chave: publica, kdf: { algoritmo: 'PBKDF2-SHA-256', iteracoes, sal: paraHex(sal) }, cifra: { algoritmo: 'AES-256-GCM', iv: paraHex(iv) }, cifrado: paraHex(cifrado) } }
  } finally { pkcs8.fill(0) }
}

/** Recupera a chave a partir da cópia e da senha; recusa cópia alterada, senha errada ou chave que não bate. */
export async function restaurarChave(copiaTexto: string, senha: string): Promise<ChaveLocal> {
  let c: CopiaDaChave
  try { c = JSON.parse(copiaTexto) } catch { throw new Error('a cópia não é um JSON') }
  if (c?.formato !== 'cosmos-chave-ed25519-cifrada-v1' || !/^[0-9a-f]{64}$/.test(c.chave) || c.kdf?.algoritmo !== 'PBKDF2-SHA-256' || c.cifra?.algoritmo !== 'AES-256-GCM'
    || !Number.isInteger(c.kdf.iteracoes) || c.kdf.iteracoes < 100_000 || c.kdf.iteracoes > 10_000_000 || !/^[0-9a-f]{32}$/.test(c.kdf.sal) || !/^[0-9a-f]{24}$/.test(c.cifra.iv) || !/^(?:[0-9a-f]{2}){32,512}$/.test(c.cifrado))
    throw new Error('a cópia não está no formato cosmos-chave-ed25519-cifrada-v1')
  let pkcs8: Uint8Array<ArrayBuffer> | null = null
  try {
    pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deHex(c.cifra.iv) as BufferSource, additionalData: contexto(c.chave) }, await chaveDaSenha(senha, deHex(c.kdf.sal), c.kdf.iteracoes), deHex(c.cifrado) as BufferSource))
  } catch { throw new Error('senha errada ou cópia alterada') }
  try {
    const privada = await crypto.subtle.importKey('pkcs8', pkcs8 as Uint8Array<ArrayBuffer>, 'Ed25519', false, ['sign'])
    await conferirPar(c.chave, privada)
    return { publica: c.chave, privada }
  } finally { pkcs8.fill(0) }
}

// ---- a cadeia

/** Põe um registro no fim da cadeia (ou começa uma), assinado pela chave, e confere a cadeia inteira de novo. */
export async function anexar(cadeia: Cadeia | null, chave: ChaveLocal, registroTexto: string): Promise<{ cadeia: Cadeia; conferencia: ConferenciaDaCadeia }> {
  if (cadeia && cadeia.chave !== chave.publica) throw new Error('esta cadeia é de outra chave')
  let anterior = ZEROS
  if (cadeia) {
    const c = await conferirCadeia(cadeia)
    if (c.veredito !== 'aceita') throw new Error(`a cadeia guardada não confere (${c.motivo}); nada foi assinado`)
    anterior = c.cabeca!
  }
  const indice = cadeia?.elos.length ?? 0
  const { elo } = await novoElo(chave.publica, indice, anterior, registroTexto, async m => new Uint8Array(await crypto.subtle.sign('Ed25519', chave.privada, m as BufferSource)))
  const nova: Cadeia = { formato: FORMATO_CADEIA, chave: chave.publica, elos: [...(cadeia?.elos ?? []), elo] }
  const conferencia = await conferirCadeia(nova)
  if (conferencia.veredito !== 'aceita') throw new Error(`a cadeia nova não confere (${conferencia.motivo}): ${conferencia.detalhe}`)
  return { cadeia: nova, conferencia }
}

export interface VersaoConhecida { chave: string; resumos: string[]; recebidaEm: string; texto: string }
export interface Recebimento { conferencia: ConferenciaDaCadeia; chave: string | null; relacao: RelacaoDeVersoes | 'nova' | null; elo: number | null }

/**
 * Confere uma cadeia recebida por arquivo e a compara com a versão que já se tinha dessa chave (seção 5): igual,
 * extensão (troca pela nova), encurtada ou bifurcada (acusar e guardar as duas).
 */
export async function receber(texto: string, conhecidas: VersaoConhecida[]): Promise<Recebimento> {
  const conferencia = await conferirCadeiaTexto(texto)
  if (conferencia.veredito !== 'aceita') return { conferencia, chave: null, relacao: null, elo: conferencia.elo }
  const chave = (JSON.parse(texto) as Cadeia).chave
  const antiga = conhecidas.find(v => v.chave === chave)
  if (!antiga) return { conferencia, chave, relacao: 'nova', elo: null }
  const { relacao, elo } = compararVersoes(antiga, { chave, resumos: conferencia.resumos })
  return { conferencia, chave, relacao, elo }
}

export const MOTIVOS_CADEIA: Record<string, string> = {
  C1: 'o arquivo não se lê ou tem a forma errada', C2: 'não é uma cadeia-v1', C3: 'a chave pública não é válida',
  C4: 'um elo está fora de posição', C5: 'um elo não aponta para o anterior: algo foi tirado, posto ou trocado',
  C6: 'um registro não se lê', C7: 'um registro é de outro autor', C8: 'uma assinatura não vale: o elo foi alterado',
}
