// A formalização assistida (especificacao/formalizacao-v1.md): um modelo de linguagem PROPÕE a formalização em m2 de
// frases curtas em português; o Cosmos lê a proposta, recusa o que não se lê ou foge do vocabulário, e a lê de volta
// em português, sem modelo nenhum, para que a pessoa confira se a fórmula diz o que o texto dizia. Quem aprova é a
// pessoa; quem decide se a conclusão segue é a verificação (Z3, cvc5 e Carcara), nunca o modelo.
// O pedido ao modelo é sempre o mesmo para a mesma entrada (versão PROMPT_FORMALIZACAO): uma medição só vale com a
// versão do pedido junto.

import type { EntradaDicionario } from '../dados/tipos'
import { lerEmPortugues } from '../logica/leitura'
import { usosDeNomes } from '../logica/termos'
import { validar } from '../logica/validador'
import { comoDicionario } from './registro'
import { CLASSES, lerFormula, type Classe, type Item, type Termo } from './avaliacao'

export const PROMPT_FORMALIZACAO = 'formalizacao-v1'
export interface Mensagem { role: 'system' | 'user' | 'assistant'; content: string }
export interface Proposta { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null; completados?: string[] }

const SISTEMA = `Você formaliza frases curtas em português na linguagem m2 (lógica de primeira ordem).

Sintaxe do m2:
- quantificadores ∀x (…) e ∃x (…); conectivos ¬ (não), ∧ (e), ∨ (ou), ⟹ (se… então), ⟺ (se e somente se);
- predicados começam com maiúscula e usam só letras sem acento (Medico, Paciente, Admira); constantes em minúsculas sem acento (ana, joao); variáveis x, y, z;
- aplicação: Medico(ana), Admira(ana, joao).

Como ler o português:
- "Todo A é B" = ∀x (A(x) ⟹ B(x)); "Nenhum A é B" = ∀x (A(x) ⟹ ¬B(x)); "Algum A é B" = ∃x (A(x) ∧ B(x));
- "Algum A não é B" = ∃x (A(x) ∧ ¬B(x)); "Nem todo A é B" = ¬∀x (A(x) ⟹ B(x));
- "a é A só se é B" = A(a) ⟹ B(a); "ou" é inclusivo (∨);
- formalize literalmente, sem acrescentar premissas nem conhecimento do mundo.

Classifique a conclusão em relação às premissas, na lógica clássica:
- "segue": toda situação em que as premissas valem, a conclusão vale;
- "contradiz": toda situação em que as premissas valem, a conclusão é falsa;
- "independente": nem uma coisa nem outra. Atenção: "Todo A é B" não garante que exista algum A.

Responda SÓ com um objeto JSON, sem texto antes ou depois:
{"vocabulario": [{"simbolo": "...", "tipo": "predicado" ou "constante", "aridade": número, "leitura": "..."}], "premissas": ["..."], "conclusao": "...", "classe": "segue" | "contradiz" | "independente"}
Na leitura, use "x é médico" para predicado de um lugar, "x admira y" para dois lugares e o nome próprio para constante.`

/**
 * O formato da resposta como esquema JSON (versão SAIDA_FORMALIZACAO). Um provedor que aceita esquema (o Ollama, no
 * parâmetro `format`) só gera texto que o cumpre, e o JSON quebrado deixa de existir sem treino nenhum. O esquema só
 * prende a forma: se as fórmulas se leem em m2 com o vocabulário continua com lerProposta.
 */
export const SAIDA_FORMALIZACAO = 'esquema-json-v1'
export const ESQUEMA_RESPOSTA = {
  type: 'object',
  properties: {
    vocabulario: {
      type: 'array',
      items: {
        type: 'object',
        properties: { simbolo: { type: 'string' }, tipo: { type: 'string', enum: ['predicado', 'constante'] }, aridade: { type: 'integer' }, leitura: { type: 'string' } },
        required: ['simbolo', 'tipo', 'aridade', 'leitura'],
      },
    },
    premissas: { type: 'array', items: { type: 'string' } },
    conclusao: { type: 'string' },
    classe: { type: 'string', enum: ['segue', 'contradiz', 'independente'] },
  },
  required: ['vocabulario', 'premissas', 'conclusao', 'classe'],
} as const

const entradaDoUsuario =(texto: { premissas: string[]; conclusao: string }, vocabulario: Termo[] | null) =>
  [`Premissas:\n${texto.premissas.map((p) => `- ${p}`).join('\n')}`, `Conclusão: ${texto.conclusao}`,
    vocabulario ? `Use exatamente este vocabulário (repita-o na resposta):\n${JSON.stringify(vocabulario)}` : 'Proponha o vocabulário.'].join('\n\n')
/** A resposta certa de um item no formato pedido: a dos exemplos do pedido e a que o treino ensina. */
export const respostaDoExemplo = (i: Item) => JSON.stringify({ vocabulario: i.vocabulario, premissas: i.gabarito.premissas, conclusao: i.gabarito.conclusao, classe: i.gabarito.classe })

/**
 * As mensagens do pedido: as instruções, até dois exemplos resolvidos (dos exemplos públicos, nunca do conjunto
 * fechado) e a entrada. Com `vocabulario`, o modelo tem de usar exatamente aquele; sem ele, propõe um.
 */
export function mensagensDeFormalizacao(texto: { premissas: string[]; conclusao: string }, vocabulario: Termo[] | null, exemplos: Item[]): Mensagem[] {
  const m: Mensagem[] = [{ role: 'system', content: SISTEMA }]
  for (const e of exemplos.slice(0, 2)) m.push({ role: 'user', content: entradaDoUsuario(e.texto, e.vocabulario) }, { role: 'assistant', content: respostaDoExemplo(e) })
  m.push({ role: 'user', content: entradaDoUsuario(texto, vocabulario) })
  return m
}

/** O primeiro objeto JSON da resposta, sem o raciocínio entre <think> e sem cercas de código. */
function objetoDaResposta(conteudo: string): unknown {
  const limpo = conteudo.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '')
  const inicio = limpo.indexOf('{')
  if (inicio < 0) throw new Error('a resposta não tem um objeto JSON')
  let nivel = 0, emTexto = false, escape = false
  for (let i = inicio; i < limpo.length; i++) {
    const c = limpo[i]
    if (emTexto) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') emTexto = false; continue }
    if (c === '"') emTexto = true
    else if (c === '{') nivel++
    else if (c === '}' && --nivel === 0) return JSON.parse(limpo.slice(inicio, i + 1))
  }
  throw new Error('o objeto JSON da resposta não fecha')
}

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
function vocabularioProposto(v: unknown): Termo[] {
  if (!Array.isArray(v) || !v.length || v.length > 30) throw new Error('o vocabulário é uma lista de 1 a 30 símbolos')
  const vistos = new Set<string>()
  return v.map((t) => {
    if (!ehObjeto(t) || typeof t.simbolo !== 'string' || typeof t.leitura !== 'string' || !Number.isInteger(t.aridade)) throw new Error('cada símbolo tem simbolo, tipo, aridade e leitura')
    const constante = t.tipo === 'constante'
    if (!constante && t.tipo !== 'predicado') throw new Error(`tipo desconhecido em ${t.simbolo}`)
    if (!(constante ? /^[a-z][a-z0-9_]{0,30}$/ : /^[A-Z][A-Za-z0-9_]{0,30}$/).test(t.simbolo)) throw new Error(`símbolo fora do padrão: ${t.simbolo}`)
    if (constante ? t.aridade !== 0 : (t.aridade as number) < 0 || (t.aridade as number) > 4) throw new Error(`aridade fora do padrão em ${t.simbolo}`)
    if (vistos.has(t.simbolo)) throw new Error(`símbolo repetido: ${t.simbolo}`)
    vistos.add(t.simbolo)
    return { simbolo: t.simbolo, tipo: t.tipo, aridade: t.aridade as number, leitura: t.leitura.trim().slice(0, 80) } as Termo
  })
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
/**
 * Sem vocabulário dado, o modelo costuma propor símbolos fora do padrão: com acento ("Pássaro") ou constante com
 * maiúscula ("Tico"). Acerta a forma do símbolo (sem acento; predicado com a primeira letra maiúscula, constante toda
 * em minúscula) e das ocorrências dele nas fórmulas, só como palavra inteira (nunca a fórmula toda: "≠" se decompõe em
 * "=" e um acento). Símbolo proposto duas vezes fica como veio, e a leitura recusa. A leitura em português não muda.
 */
function acertarSimbolos(o: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(o.vocabulario)) return o
  const forma = (t: Record<string, unknown>, s: string) => {
    const b = semAcento(s)
    return t.tipo === 'constante' ? b.toLowerCase() : t.tipo === 'predicado' ? b.charAt(0).toUpperCase() + b.slice(1) : b
  }
  const simbolos = o.vocabulario.map((t) => (ehObjeto(t) && typeof t.simbolo === 'string' ? t.simbolo : null))
  const unico = (s: string) => simbolos.filter((x) => x === s).length === 1
  const trocas = o.vocabulario.flatMap((t) => (ehObjeto(t) && typeof t.simbolo === 'string' && unico(t.simbolo) && forma(t, t.simbolo) !== t.simbolo ? [[t.simbolo, forma(t, t.simbolo)]] : []))
  if (!trocas.length) return o
  const novos = new Map(trocas.map(([de, para]) => [de, para]))
  const trocar = (f: unknown) => typeof f !== 'string' ? f
    : f.replace(/(?<![\p{L}\p{N}_])[\p{L}_][\p{L}\p{N}_]*/gu, (palavra) => novos.get(palavra) ?? palavra)
  return { ...o, vocabulario: o.vocabulario.map((t) => (ehObjeto(t) && typeof t.simbolo === 'string' && novos.has(t.simbolo) ? { ...t, simbolo: novos.get(t.simbolo) } : t)),
    premissas: Array.isArray(o.premissas) ? o.premissas.map(trocar) : o.premissas, conclusao: trocar(o.conclusao) }
}

const VERBOS = new Set(['tem', 'gosta', 'come', 'voa', 'ama', 'conhece', 'possui', 'sabe', 'mora', 'vive', 'usa', 'faz', 'pode', 'deve', 'esta', 'gera', 'causa', 'ensina', 'estuda', 'trabalha', 'respeita', 'teme', 'odeia', 've', 'le', 'escreve', 'joga', 'corre', 'nada', 'canta'])
/** A leitura provisória de um símbolo completado, tirada do nome: "TemPenas" → "x tem penas", "Ave" → "x é ave". */
function leituraDoNome(simbolo: string, tipo: Termo['tipo'], aridade: number): string {
  const palavras = simbolo.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim()
  if (tipo === 'constante') return palavras.charAt(0).toUpperCase() + palavras.slice(1)
  if (aridade === 1) return VERBOS.has(palavras.split(' ')[0]) ? `x ${palavras}` : `x é ${palavras}`
  if (aridade === 2) return `x ${palavras} y`
  return `${simbolo}(${['x', 'y', 'z', 'w'].slice(0, aridade).join(', ')})`
}
/**
 * Sem vocabulário dado, o modelo às vezes usa nas fórmulas um símbolo que não declarou (o caso real: "¬Penas(galinha)"
 * com o vocabulário dizendo outra coisa). O símbolo entra com o tipo e a aridade do uso e uma leitura provisória tirada
 * do nome, e fica marcado em `completados` para a tela mostrar. Um nome usado de dois jeitos, fora do padrão ou já
 * declarado com outro tipo não se completa: a leitura recusa, como antes.
 */
function completarVocabulario(vocabulario: Termo[], formulas: string[]): { vocabulario: Termo[]; completados: string[] } {
  const v = [...vocabulario], completados: string[] = []
  for (const f of formulas) {
    const r = validar(f, comoDicionario(v.map(({ simbolo, tipo, aridade }) => ({ simbolo, tipo, aridade }))))
    if (!r.ast) continue
    for (const u of usosDeNomes(r.ast)) {
      if (v.some((t) => t.simbolo === u.nome) || (u.tipo !== 'predicado' && u.tipo !== 'constante')) continue
      if (!(u.tipo === 'constante' ? /^[a-z][a-z0-9_]{0,30}$/ : /^[A-Z][A-Za-z0-9_]{0,30}$/).test(u.nome) || u.aridade > 4) continue
      v.push({ simbolo: u.nome, tipo: u.tipo, aridade: u.aridade, leitura: leituraDoNome(u.nome, u.tipo, u.aridade) })
      completados.push(u.nome)
    }
  }
  return { vocabulario: v, completados }
}

/**
 * Lê a resposta do modelo como proposta: o objeto JSON, o vocabulário (o dado, se houver; senão o proposto, com os
 * símbolos na forma do padrão) e cada fórmula em m2 com esse vocabulário. Lança, com o motivo, o que não se lê.
 */
export function lerProposta(conteudo: string, vocabularioDado: Termo[] | null): Proposta {
  const lido = objetoDaResposta(conteudo)
  if (!ehObjeto(lido)) throw new Error('a resposta não é um objeto')
  const o = vocabularioDado ? lido : acertarSimbolos(lido)
  if (!Array.isArray(o.premissas) || !o.premissas.length || o.premissas.length > 10 || !o.premissas.every((p) => typeof p === 'string')) throw new Error('premissas: uma lista de 1 a 10 fórmulas')
  if (typeof o.conclusao !== 'string') throw new Error('falta a conclusão')
  const premissas = (o.premissas as string[]).map((p) => p.trim()), conclusao = o.conclusao.trim()
  // com o vocabulário dado (o piloto e a nota), nada se completa: o símbolo fora dele é erro do modelo
  const { vocabulario, completados } = vocabularioDado ? { vocabulario: vocabularioDado, completados: [] }
    : completarVocabulario(vocabularioProposto(o.vocabulario), [...premissas, conclusao])
  for (const f of [...premissas, conclusao]) lerFormula(f, vocabulario)
  const classe = CLASSES.includes(o.classe as Classe) ? (o.classe as Classe) : null
  return { vocabulario, premissas, conclusao, classe, ...(completados.length ? { completados } : {}) }
}

/**
 * A palavra que o leitor põe depois de "é" (ou o verbo, ou o nome), tirada da leitura do vocabulário. O leitor do
 * Caderno sempre escreve "a é termo" para predicado de um lugar; com verbo ("x gosta de banho") o termo vira "algo que
 * gosta de banho", para a frase continuar dizendo a mesma coisa: "Mimi não é algo que gosta de banho".
 */
function termoDaLeitura(t: Termo): string {
  const um = /^x é (.+)$/.exec(t.leitura), verbo = /^x (.+)$/.exec(t.leitura), dois = /^x (.+) y$/.exec(t.leitura)
  const termo = t.aridade === 1 ? (um ? um[1] : verbo ? `algo que ${verbo[1]}` : t.leitura) : t.aridade === 2 && dois ? dois[1] : t.leitura
  return termo.replace(/\s*\(.*\)$/, '')
}
/** A fórmula lida de volta em português, de forma determinística, com as palavras do vocabulário. */
export function lerDeVolta(formula: string, vocabulario: Termo[]): string {
  const dicionario: EntradaDicionario[] = vocabulario.map((t, i) => ({ id: `v${i}`, termo: termoDaLeitura(t), simbolo: t.simbolo, tipo: t.tipo, aridade: t.aridade, definicao: t.leitura }))
  return lerEmPortugues(lerFormula(formula, vocabulario), dicionario)
}
