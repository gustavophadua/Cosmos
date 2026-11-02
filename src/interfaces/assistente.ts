// O assistente da Conversa: os comandos ("/verificar", "/revisar"…), a escolha automática quando a pessoa não diz qual,
// e o texto que vai para o cofre. A IA roda no serviço local (Ollama); quem decide é o Z3. A afirmação solta (uma frase
// só) tem resposta sem modelo: não há o que provar, ela precisa de fonte.

import type { Classe, Termo } from '../motor/avaliacao'
import { objetoDaResposta, type Proposta } from '../motor/formalizacao'
import { relatorioEmMarkdown, tituloDoVeredito, type RelatorioRevisor } from '../motor/revisor-relatorio'
import type { Ligacao } from './ollama-cliente'
import { fatoPorId, type ResultadoRealidade, type Situacao } from '../motor/realidade'
import { modoRemoto } from './modo-remoto'

export type Comando = 'verificar' | 'revisar' | 'desmistificar' | 'contrariar'
/** o que a Conversa faz com o texto: um comando de IA, ou a resposta sem modelo para a afirmação solta */
export type Acao = Comando | 'afirmacao'
export const COMANDOS: { nome: Comando; titulo: string; descricao: string; exemplo: string; ia: boolean }[] = [
  { nome: 'verificar', titulo: 'Verificar', ia: true, descricao: 'Um argumento curto: a conclusão decorre das premissas? Provado ou salto, com o cenário.',
    exemplo: 'Todo cliente do plano anual tem suporte. A padaria é cliente do plano anual. Então a padaria tem suporte.' },
  { nome: 'revisar', titulo: 'Revisar plano', ia: true, descricao: 'Um plano ou projeto inteiro (ou um arquivo): cada conclusão, provada ou salto.',
    exemplo: 'Nossos clientes são pequenas empresas, e toda pequena empresa precisa controlar o caixa. Por isso, nossos clientes vão comprar o módulo de caixa.' },
  { nome: 'desmistificar', titulo: 'Desmistificar', ia: true, descricao: 'O que o texto afirma sem provar (precisa de fonte) e o que ele tira sem base.',
    exemplo: 'Todo mundo que trabalha de casa produz menos. A Ana trabalha de casa. Por isso a Ana produz menos que o time.' },
  { nome: 'contrariar', titulo: 'Contrariar', ia: true, descricao: 'Como derrubar a conclusão: o cenário contra ela, ou as premissas que é preciso negar.',
    exemplo: 'Se o servidor cair, o site sai do ar. O site saiu do ar. Então o servidor caiu.' },
]

/** "/contrariar texto" → o comando e o resto; sem barra, o comando escolhido sozinho. */
export function lerPedido(texto: string, escolhido: Comando | null): { comando: Acao; texto: string; automatico: boolean } {
  const m = /^\/(\p{L}+)\s*([\s\S]*)$/u.exec(texto.trim())
  const nome = m && COMANDOS.find((c) => c.nome === m[1].toLowerCase())
  if (nome) return { comando: nome.nome, texto: m[2].trim(), automatico: false }
  if (escolhido) return { comando: escolhido, texto: texto.trim(), automatico: false }
  return { comando: detectar(texto), texto: texto.trim(), automatico: true }
}

const frases = (texto: string) => texto.replace(/\r\n?/g, '\n').split(/\n+|(?<=[.!?;])\s+(?=\p{Lu}|["“(])/u).map((s) => s.trim()).filter((s) => s.length > 1)
/** Texto longo ou com parágrafos: revisar; duas frases ou mais: verificar; uma frase só: a afirmação solta. */
export function detectar(texto: string): Acao {
  const t = texto.trim()
  if (t.length > 600 || t.split(/\n\s*\n/).filter((p) => p.trim()).length >= 2) return 'revisar'
  return separarArgumento(t) ? 'verificar' : 'afirmacao'
}

// as marcas de conclusão ("A, B, logo C") e de razão ("C porque A"), como palavra inteira
const MARCA_CONCLUSAO = /(?<![\p{L}])(logo|ent[aã]o|portanto|por isso|por conseguinte|consequentemente|assim sendo|da[ií] que|dessa forma|desse modo)(?![\p{L}])[,:]?\s*/giu
const MARCA_RAZAO = /(?<![\p{L}])(porque|pois|j[aá] que|visto que|uma vez que)(?![\p{L}])\s*/iu
// a oração de finalidade ("…, para saberem que…", "…, a fim de…") completa a anterior: não é uma razão a mais
const FINALIDADE = /^(para|pra|a fim de|de modo a)(?![\p{L}])/iu
const partes = (s: string) => s.split(/\s*[;,]\s*/).map((p) => p.trim().replace(/^(e|mas|também)\s+/iu, '')).filter((p) => p.length > 1)
  .reduce<string[]>((r, p) => (FINALIDADE.test(p) && r.length ? [...r.slice(0, -1), `${r.at(-1)}, ${p}`] : [...r, p]), [])
const comPonto = (s: string) => { const t = s.trim().replace(/[\s,;:]+$/, ''); return /[.!?]$/.test(t) ? t : `${t}.` }
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/**
 * Uma frase só com o argumento dentro: "todo homem parte de Deus, Deus é eterno, logo o homem é eterno" (premissas
 * separadas por vírgula antes da marca) ou "o homem é eterno porque Deus é eterno". O "então" de "se A, então B" é
 * uma condicional, não uma conclusão.
 */
function argumentoNumaFrase(f: string): ArgumentoSeparado | null {
  const marcas = [...f.matchAll(MARCA_CONCLUSAO)].filter((m) => m.index! > 0).reverse()
  for (const m of marcas) {
    const antes = f.slice(0, m.index).replace(/[\s,;:]+$/, ''), depois = f.slice(m.index! + m[0].length).trim()
    if (/^(se|caso|quando)\s/iu.test(antes.split(/[,;]/).at(-1)!.trim())) continue
    const ps = partes(antes)
    if (ps.length && depois.length > 1) return { premissas: ps.map((p) => comPonto(maiuscula(p))), conclusao: comPonto(maiuscula(depois)) }
  }
  const r = MARCA_RAZAO.exec(f)
  if (r && r.index > 0) {
    const conclusao = f.slice(0, r.index), ps = partes(f.slice(r.index + r[0].length))
    if (ps.length && conclusao.trim().length > 1) return { premissas: ps.map((p) => comPonto(maiuscula(p))), conclusao: comPonto(maiuscula(conclusao)) }
  }
  // sem marca: três orações ou mais, separadas por vírgula ("as pessoas são sociáveis, eu não sou sociável, eu não sou
  // pessoa"): a última é a conclusão provável, e a resposta diz que foi suposta. Cada parte com três palavras ou mais
  // (uma lista, "comprei pão, leite, ovos", não é argumento); com "se/caso/quando", a vírgula parte a condicional
  const ps = partes(f)
  if (ps.length >= 3 && ps.every((p) => p.split(/\s+/).length >= 3) && !ps.some((p) => /^(se|caso|quando)\s/iu.test(p)))
    return { premissas: ps.slice(0, -1).map((p) => comPonto(maiuscula(p))), conclusao: comPonto(maiuscula(ps.at(-1)!)), suposta: true }
  return null
}

// "geralmente", "normalmente"…: a lógica do Cosmos não tem "a maioria". Para conferir, a premissa vai na forma forte
// (vale para todos) e a resposta avisa: com a palavra, há exceções, e o caso da conclusão pode ser uma delas
const ATENUANTE = /(?<![\p{L}])(geralmente|normalmente|em geral|quase sempre|na maioria das vezes|frequentemente|tipicamente|muitas vezes)(?![\p{L}])\s*,?\s*/iu
export interface ArgumentoSeparado {
  premissas: string[]; conclusao: string
  /** sem "logo"/"então": a última parte foi tomada como a conclusão */
  suposta?: true
  /** as premissas que diziam "geralmente" (e o texto como veio), conferidas como se valessem para todos */
  atenuadas?: { premissa: number; palavra: string; original: string }[]
  /** "as próprias", "elas"… no começo de uma razão, lidos como o sujeito da frase ("as pessoas") */
  sujeitos?: { premissa: number; pronome: string; sujeito: string }[]
  /** a conclusão sem sujeito ("Logo, está com vírus"), lida com o sujeito da primeira razão: o texto como veio */
  conclusaoOriginal?: string
  /** "A, logo B, logo C": os índices das razões que são passos (conclusões intermediárias), conferidos um a um */
  passos?: number[]
}
// o sujeito da frase (artigo e substantivo no começo da conclusão ou da primeira razão) e os pronomes que voltam a ele
const SUJEITO = /^(?:(?:logo|então|portanto),?\s+)?((os|as|o|a)\s+\p{L}+)/iu
const PRONOME = /^(as próprias|os próprios|a própria|o próprio|as mesmas|os mesmos|elas|eles|ela|ele)(?![\p{L}])/iu
const plural = (s: string) => /^(os|as)\s/iu.test(s) || /^(elas|eles|as |os )/iu.test(s)
// palavras que já são sujeito, ou frases que não pedem um ("há", "existe"): a conclusão que começa por elas fica como está
const NAO_E_VERBO = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'todo', 'toda', 'todos', 'todas', 'nenhum', 'nenhuma', 'algum', 'alguma', 'alguns', 'algumas',
  'cada', 'ele', 'ela', 'eles', 'elas', 'isso', 'isto', 'aquilo', 'ninguém', 'alguém', 'tudo', 'nada', 'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 'meu', 'minha',
  'seu', 'sua', 'quem', 'que', 'se', 'há', 'existe', 'existem', 'eu', 'você', 'nós', 'vocês', 'mas', 'e', 'ou', 'nem', 'só', 'apenas', 'qualquer', 'sempre', 'nunca'])
/** "Logo, está com vírus": a conclusão sem sujeito ganha o da primeira razão ("o celular"), e a tela avisa. */
function conclusaoComSujeito(a: ArgumentoSeparado): ArgumentoSeparado {
  const m = /^((?:[Ll]ogo|[Ee]ntão|[Pp]ortanto|[Pp]or isso),?\s+)?(\p{Ll}[\p{L}-]*)/u.exec(a.conclusao)
  const sujeito = SUJEITO.exec(a.premissas[0] ?? '')
  if (!m || !sujeito || NAO_E_VERBO.has(m[2]) || (m[2] === 'não' && NAO_E_VERBO.has(/^\S+\s+(\S+)/u.exec(a.conclusao.slice((m[1] ?? '').length))?.[1] ?? 'o'))) return a
  const inicio = (m[1] ?? '').length
  return { ...a, conclusao: `${a.conclusao.slice(0, inicio)}${sujeito[1].toLowerCase()} ${a.conclusao.slice(inicio)}`, conclusaoOriginal: a.conclusao }
}
function comSujeito(a0: ArgumentoSeparado): ArgumentoSeparado {
  const a = conclusaoComSujeito(a0)
  const achado = SUJEITO.exec(a.conclusao) ?? SUJEITO.exec(a.premissas[0] ?? '')
  if (!achado) return a
  const sujeito = achado[1].toLowerCase(), sujeitos: NonNullable<ArgumentoSeparado['sujeitos']> = []
  const premissas = a.premissas.map((p, i) => {
    const m = PRONOME.exec(p)
    if (!m || plural(m[1].toLowerCase() + ' ') !== plural(sujeito)) return p
    sujeitos.push({ premissa: i, pronome: m[1].toLowerCase(), sujeito })
    return maiuscula(sujeito) + p.slice(m[1].length)
  })
  return sujeitos.length ? { ...a, premissas, sujeitos } : a
}
function semAtenuantes(a: ArgumentoSeparado): ArgumentoSeparado {
  const atenuadas: NonNullable<ArgumentoSeparado['atenuadas']> = []
  const premissas = a.premissas.map((p, i) => {
    const m = ATENUANTE.exec(p)
    if (!m) return p
    atenuadas.push({ premissa: i, palavra: m[1].toLowerCase(), original: p })
    return comPonto(maiuscula(p.replace(ATENUANTE, '').replace(/\s+([,.;!?])/g, '$1').trim()))
  })
  return atenuadas.length ? { ...a, premissas, atenuadas } : a
}

/** As notas sobre como o texto foi lido: a conclusão suposta e as premissas com "geralmente". */
export function notasDaLeitura(r: { texto: ArgumentoSeparado; classe: Classe | null }): string[] {
  const l: string[] = []
  if (r.texto.suposta) l.push('Não havia "logo" nem "então": li as primeiras partes como as razões e a última como a conclusão.')
  for (const s of r.texto.sujeitos ?? []) l.push(`Li "${s.pronome}" como "${s.sujeito}", o sujeito da frase.`)
  if (r.texto.conclusaoOriginal) l.push(`"${r.texto.conclusaoOriginal}" não diz quem; li como "${r.texto.conclusao}", com o sujeito da primeira frase.`)
  for (const a of r.texto.atenuadas ?? []) {
    l.push(`"${a.original}" diz "${a.palavra}", e a lógica não tem "a maioria": para conferir, li como "${r.texto.premissas[a.premissa]}" (vale para todos).`)
    if (r.classe === 'segue') l.push(`Com "${a.palavra}", a conclusão não decorre: "${a.palavra}" admite exceções, e o caso da conclusão pode ser uma delas. Ela só está provada se a frase valer para todos, e aí essa premissa é uma generalização que precisa de fonte.`)
  }
  return l
}

/**
 * A resposta para uma frase só, sem modelo. Uma frase solta costuma ser uma posição, e a posição tem um raciocínio por
 * trás: a resposta pede esse raciocínio com a própria frase da pessoa ("…, logo [a frase]") e diz o que o Cosmos faz
 * com ele (se não decorrer, mostra a ligação que falta). A generalização ("todo", "nenhum"…) cai com um caso contrário.
 */
export function respostaAfirmacao(texto: string): string {
  const t = texto.trim().replace(/\s+/g, ' ')
  if (t.split(' ').length < 3) return 'Escreva um raciocínio (as razões e a conclusão) ou cole um plano, e o Cosmos separa o que decorre dos fatos do que é salto. Toque em + para ver os comandos.'
  const geral = /^(tod[oa]s?|nenhum[a]?|ningu[eé]m|sempre|nunca|qualquer|cada)(?![\p{L}])/iu.exec(t)
  const frase = t.slice(0, 300).replace(/[.!?]+$/, '')
  const l = [`"${frase}" é uma posição. Sozinha, ela não tem o que provar: o Cosmos trabalha com o raciocínio por trás dela.`,
    `Por que você pensa isso? Escreva as razões, uma por frase, e termine com "logo" e a sua frase. Por exemplo: "[primeira razão]. [segunda razão]. Logo, ${frase[0].toLowerCase()}${frase.slice(1)}."`,
    'Ou: o que você tira disso? Escreva a sua frase, as outras razões e, no fim, "logo" e a conclusão.',
    'O Z3 confere se a conclusão decorre das razões. Se não decorrer, o Cosmos mostra a ligação que falta: a visão que você precisa aceitar para ela ficar de pé, separada dos fatos que precisam de fonte.']
  if (geral) l.push(`É uma generalização ("${geral[1].toLowerCase()}…"): basta um único caso contrário para derrubá-la. Exemplos a favor não a provam; é preciso que não exista nenhum caso contra.`)
  return l.join('\n\n')
}
/** Um argumento curto: as frases menos a última são as premissas; a última é a conclusão. Null com menos de duas. */
export function separarArgumento(texto: string): ArgumentoSeparado | null {
  const fs = frases(texto)
  if (fs.length === 1) { const a = argumentoNumaFrase(fs[0]); return a && comPassos(semAtenuantes(comSujeito(a))) }
  if (fs.length < 2 || fs.length > 11) return null
  return comPassos(semAtenuantes(comSujeito({ premissas: fs.slice(0, -1).map((f) => f.slice(0, 500)), conclusao: fs.at(-1)!.slice(0, 500) })))
}
/** Uma razão que começa com "logo"/"então" é um passo da cadeia: tira o conector e guarda o índice. */
const PASSO = /^(?:logo|então|portanto|por isso),?\s+/iu
function comPassos(a: ArgumentoSeparado): ArgumentoSeparado {
  const passos = a.premissas.flatMap((p, i) => (i > 0 && PASSO.test(p) ? [i] : []))
  if (!passos.length) return a
  return { ...a, passos, premissas: a.premissas.map((p, i) => (passos.includes(i) ? maiuscula(p.replace(PASSO, '')) : p)) }
}
/**
 * A tradução que não se leu, dita em português: qual parte o modelo não conseguiu (a conclusão, uma razão) e o que fazer.
 * Nunca mostra só '"" não se lê'.
 */
export function falhaDaTraducao(conteudo: string, t: ArgumentoSeparado, detalhe: string): string {
  const o = (() => { try { return objetoDaResposta(conteudo) as { premissas?: unknown; conclusao?: unknown } | null } catch { return null } })()
  // no modo remoto a nuvem já vem ligada: a dica não manda ligar o que já está ligado
  const dica = `Tente uma frase por razão, cada uma com quem faz e o que faz (por exemplo, "A pessoa vê só o que chega até ela.")${modoRemoto() ? '.' : ', ou ligue o modelo grande na nuvem.'}`
  if (o && typeof o.conclusao === 'string' && !o.conclusao.trim())
    return `Tradução ilegível: o modelo não conseguiu traduzir a conclusão "${t.conclusao}" sem copiar uma das razões. Nenhuma classe lógica foi atribuída. ${dica}`
  if (o && (!Array.isArray(o.premissas) || o.premissas.length !== t.premissas.length))
    return `Tradução ilegível: o modelo não conseguiu traduzir cada razão em uma fórmula. Nenhuma classe lógica foi atribuída. ${dica}`
  return `Tradução ilegível: ${detalhe.replace(/[.!?]$/, '')}. Nenhuma classe lógica foi atribuída. ${dica}`
}
/** Como um passo da cadeia fica diante do que veio antes. */
export const PASSO_DA_CADEIA: Record<Classe, string> = {
  segue: 'decorre do que veio antes',
  independente: 'não decorre do que veio antes: é uma afirmação nova',
  contradiz: 'contradiz o que veio antes',
}

export type ResultadoIA =
  | { tipo: 'argumento'; comando: 'verificar' | 'contrariar'; texto: ArgumentoSeparado; proposta: Proposta; classe: Classe | null; motivo?: string; cenario?: string[]; essenciais?: number[]; reparo?: string; ligacao?: Ligacao; nuvem?: string; realidade?: ResultadoRealidade; cadeia?: { premissa: number; classe: Classe | null }[] }
  | { tipo: 'relatorio'; comando: 'revisar' | 'desmistificar'; relatorio: RelatorioRevisor }

export interface ClienteIA {
  formalizar(texto: { premissas: string[]; conclusao: string; vocabulario?: Termo[]; nuvem?: boolean }, signal?: AbortSignal): Promise<{ conteudo: string; reparo?: string; modelo?: string; reserva?: boolean }>
  conferir(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, signal?: AbortSignal): Promise<{ classeZ3: Classe | null; motivo: string; cenario?: string[] }>
  revisar(texto: string, signal?: AbortSignal): Promise<unknown>
  /** a ligação que falta num salto (ponte.ts); sem ela, o salto vem sem a proposta */
  ponte?(a: { vocabulario: Termo[]; premissas: string[]; conclusao: string; cenario: string[] }, signal?: AbortSignal): Promise<Ligacao>
  /** a camada de fatos (realidade.ts): cada frase diante da base de fatos físicos; sem ela, a resposta fica só na lógica */
  realidade?(a: { vocabulario: Termo[]; premissas: string[]; conclusao: string; texto: { premissas: string[]; conclusao: string } }, signal?: AbortSignal): Promise<ResultadoRealidade>
  estadoRevisao(signal?: AbortSignal): Promise<{ estado: string; fase?: string; feito?: number; total?: number; relatorio?: RelatorioRevisor; erro?: string }>
}

/** Detalhe textual para a UI local; sem stack nem corpo bruto do provedor. Oculta marcadores de credencial conhecidos. */
function detalheDaFalha(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return m.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [oculto]')
    .replace(/\b(api[_-]?key|token|senha|password|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[oculto]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[oculto]@')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1000).trim() || 'motivo não informado'
}

/**
 * Executa um comando de IA. `ler` lê a proposta do modelo (lerProposta), `progresso` mostra a fase. Com `vocabulario`
 * (os termos corrigidos pela pessoa no cartão), a tradução usa só ele; com `nuvem`, quem traduz é o modelo grande no
 * Groq (a pessoa ligou; o texto sai do computador). Quem decide continua sendo o Z3, aqui.
 */
export async function executar(cliente: ClienteIA, comando: Comando, texto: string, ler: (conteudo: string) => Proposta,
  progresso: (msg: string) => void, esperar = (ms: number) => new Promise((r) => setTimeout(r, ms)), opcoes: { vocabulario?: Termo[]; nuvem?: boolean } = {}): Promise<ResultadoIA> {
  const { vocabulario, nuvem } = opcoes
  if (comando === 'revisar' || comando === 'desmistificar') {
    progresso('Separando afirmações e conclusões…')
    await cliente.revisar(texto)
    for (;;) {
      await esperar(2000)
      const e = await cliente.estadoRevisao()
      if (e.estado === 'pronto' && e.relatorio) return { tipo: 'relatorio', comando, relatorio: e.relatorio }
      if (e.estado === 'erro' || e.estado === 'livre') throw new Error(e.erro ?? 'a revisão parou')
      progresso(`${{ extraindo: 'Separando afirmações e conclusões', traduzindo: 'Traduzindo cada argumento', conferindo: 'O Z3 está conferindo' }[e.fase ?? ''] ?? 'Revisando'}${e.total ? `: ${(e.feito ?? 0) + 1} de ${e.total}` : '…'}`)
    }
  }
  const t = separarArgumento(texto)
  if (!t) throw new Error('Escreva o argumento em frases: as premissas e, por último, a conclusão (por exemplo: "Todo A é B. X é A. Então X é B.").')
  progresso(nuvem ? 'O modelo grande, na nuvem, está traduzindo o argumento…' : 'O modelo está traduzindo o argumento…')
  let r: Awaited<ReturnType<ClienteIA['formalizar']>>
  try { r = await cliente.formalizar({ premissas: t.premissas, conclusao: t.conclusao, ...(vocabulario ? { vocabulario } : {}), ...(nuvem ? { nuvem } : {}) }) }
  catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (['sessao-expirada', 'conflito', 'limite'].includes(m)) throw e
    if (m === 'provedor-recusou') throw new Error('O provedor recusou a tradução. Nenhuma classe lógica foi atribuída.')
    const motivos: Record<string, string> = {
      'sem-servico': 'Serviço local não iniciado ou inacessível. Confira se o Cosmos e o Ollama estão abertos',
      indisponivel: 'O modelo está indisponível. Confira seu estado no Ollama',
      invalido: 'O serviço devolveu uma resposta fora do formato esperado',
    }
    const detalhe = Object.hasOwn(motivos, m) ? motivos[m] : detalheDaFalha(e)
    throw new Error(`Tradução indisponível: ${detalhe.replace(/[.!?]$/, '')}. Nenhuma classe lógica foi atribuída.`)
  }
  let proposta: Proposta
  try { proposta = ler(r.conteudo) }
  catch (e) { throw new Error(falhaDaTraducao(r.conteudo, t, detalheDaFalha(e))) }
  progresso('O Z3 está conferindo…')
  const c = await cliente.conferir({ vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao, classe: null })
  const logica = { tipo: 'argumento' as const, comando, texto: t, proposta, classe: c.classeZ3, ...(c.motivo ? { motivo: c.motivo } : {}), ...(c.cenario ? { cenario: c.cenario } : {}), ...(r.reparo ? { reparo: r.reparo } : {}), ...(nuvem && r.modelo && !r.reserva ? { nuvem: r.modelo } : {}) }
  // a realidade registrada: cada frase diante da base de fatos físicos (só com a tradução lida e a lógica decidida)
  let base: typeof logica & { realidade?: ResultadoRealidade; cadeia?: { premissa: number; classe: Classe | null }[] } = logica
  if (t.passos?.length && proposta.premissas.length === t.premissas.length) {
    progresso('Conferindo cada passo da cadeia…')
    const cadeia: { premissa: number; classe: Classe | null }[] = []
    for (const i of t.passos) {
      const k = await cliente.conferir({ vocabulario: proposta.vocabulario, premissas: proposta.premissas.slice(0, i), conclusao: proposta.premissas[i], classe: null }).catch(() => null)
      cadeia.push({ premissa: i, classe: k?.classeZ3 ?? null })
    }
    base = { ...base, cadeia }
  }
  if (comando === 'verificar' && c.classeZ3 && cliente.realidade) {
    progresso('Conferindo cada frase com os fatos registrados…')
    try { base = { ...logica, realidade: await cliente.realidade({ vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao, texto: { premissas: t.premissas, conclusao: t.conclusao } }) } } catch { /* sem a camada de fatos, a resposta fica só na lógica */ }
  }
  if (comando === 'verificar' && c.classeZ3 === 'independente' && cliente.ponte) {
    // o salto: o que falta para a conclusão valer, proposto pelo modelo e conferido pelo Z3
    progresso('Procurando a ligação que falta…')
    try { return { ...base, ligacao: await cliente.ponte({ vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao, cenario: c.cenario ?? [] }) } } catch { return base }
  }
  if (comando !== 'contrariar' || c.classeZ3 !== 'segue' || proposta.premissas.length < 2) return base
  // contrariar o que está provado: as premissas sem as quais a conclusão deixa de seguir
  progresso('Procurando as premissas que sustentam a conclusão…')
  const essenciais: number[] = []
  for (let i = 0; i < proposta.premissas.length; i++) {
    const pedido = { vocabulario: proposta.vocabulario, premissas: proposta.premissas.filter((_, j) => j !== i), conclusao: proposta.conclusao, classe: null }
    // o Z3 sem decidir não diz que a premissa é essencial: tenta de novo uma vez e, se falhar, não lista nenhuma
    let sem = await cliente.conferir(pedido)
    if (sem.classeZ3 === null) sem = await cliente.conferir(pedido)
    if (sem.classeZ3 === null) return base
    if (sem.classeZ3 !== 'segue') essenciais.push(i)
  }
  return { ...base, essenciais }
}

export const TITULO_DA_CLASSE: Record<Classe, string> = { segue: 'Provado: a conclusão decorre das premissas', independente: 'Salto: a conclusão não decorre das premissas', contradiz: 'Contradição: as premissas provam o contrário' }
/** Provado só com "geralmente" lido como "todos": para o texto como veio, é salto, e o título diz isso. */
export const provadoSoNaFormaForte = (r: { texto: ArgumentoSeparado; classe: Classe | null }) => r.classe === 'segue' && !!r.texto.atenuadas?.length
export const TITULO_FORMA_FORTE = 'Salto como está escrito; provado só se valer para todos'

/** Estado de ausência de classe, separado do resultado lógico e de certificado. */
export function tituloNaoDecidido(motivo?: string): string {
  if (/inconsisten|incompatíve/i.test(motivo ?? '')) return 'Premissas incompatíveis entre si: não há classe lógica'
  if (/Z3|timeout|tempo.*esgot/i.test(motivo ?? '')) return 'Z3 não concluiu a verificação: não há classe lógica'
  return `Tradução não interpretada: ${motivo || 'a tradução não se leu'}`
}

/** Como cada frase fica diante dos fatos registrados (realidade.ts). */
export const SITUACAO_REAL: Record<Situacao, string> = {
  fato: 'Fato registrado',
  contraria: 'Contraria os fatos registrados',
  observacao: 'Relato seu: os fatos registrados não decidem',
  fora: 'Visão: fora dos fatos registrados',
  'nao-decidido': 'O Z3 não concluiu',
}
export const CONCLUSAO_REAL: Record<Classe, string> = {
  segue: 'Pelos fatos registrados e pelo que você relatou, a conclusão é obrigatória.',
  contradiz: 'Pelos fatos registrados e pelo que você relatou, a conclusão é falsa.',
  independente: 'Os fatos registrados, com o que você relatou, não levam a essa conclusão.',
}
/** A camada de fatos em texto: para o cofre e para o relatório. */
export function textoDaRealidade(r: ResultadoRealidade): string[] {
  const fonte = (ids: string[]) => ids.length ? ` [${ids.map((id) => { const f = fatoPorId(id); return f ? `${id}: ${f.fonte.nome}` : id }).join('; ')}]` : ''
  const l = ['A realidade registrada:']
  for (const a of r.alinhamentos) l.push(`- entendi: "${a.leituraDe}" = "${a.leituraPara}"`)
  for (const t of r.tipagens) l.push(`- entendi: ${t.leituraTipo}`)
  for (const f of r.frases) l.push(`- ${f.conclusao ? 'Conclusão' : 'Frase'} "${f.frase}": ${SITUACAO_REAL[f.situacao]}${fonte(f.fatos)}`)
  for (const m of r.mecanismos) {
    l.push(`- Por trás de "${m.frase}", pelos fatos:`)
    for (const i of m.implica) l.push(`  · isso implica: ${i.leitura}`)
    for (const c of m.caminhos) l.push(`  · ${c.leitura} → ${c.produz}${fonte(c.fatos)}`)
  }
  if (r.conclusaoComRelato) l.push(CONCLUSAO_REAL[r.conclusaoComRelato])
  return l
}

/** O que vai para o cofre: um resumo em texto (o cofre guarda conversas de até 12 mil caracteres). */
export function resumoEmTexto(r: ResultadoIA): string {
  if (r.tipo === 'relatorio') {
    const md = relatorioEmMarkdown(r.relatorio)
    return md.length <= 6000 ? md : `${md.slice(0, 5900)}\n\n(resumo cortado; baixe o relatório completo na hora da revisão)`
  }
  const notas = [...notasDaLeitura(r), ...(r.nuvem ? [`Traduzido na nuvem por ${r.nuvem}; o Z3 decidiu ${modoRemoto() ? 'no seu computador' : 'neste computador'}.`] : [])]
  const l = [provadoSoNaFormaForte(r) ? `${TITULO_FORMA_FORTE}.` : r.classe ? `${TITULO_DA_CLASSE[r.classe]}.` : `${tituloNaoDecidido(r.motivo)}.`, ...(notas.length ? ['', ...notas] : []), '', 'Premissas:', ...r.texto.premissas.map((p) => `- ${p}`), `Conclusão: ${r.texto.conclusao}`]
  if (r.cenario) l.push('', 'Cenário em que as premissas valem e a conclusão não:', ...r.cenario.map((c) => `- ${c}`))
  if (r.cadeia) l.push('', 'A cadeia, passo a passo:', ...r.cadeia.map((p) => `- "${r.texto.premissas[p.premissa]}": ${p.classe ? PASSO_DA_CADEIA[p.classe] : 'o Z3 não concluiu'}`))
  if (r.realidade) l.push('', ...textoDaRealidade(r.realidade))
  if (r.ligacao && 'fonte' in r.ligacao) l.push('', ...textoDaLigacao(r.ligacao, r.texto.premissas))
  else if (r.ligacao && 'motivo' in r.ligacao) l.push('', `Não achei uma ligação que feche: ${r.ligacao.motivo}.`)
  if (r.essenciais) l.push('', 'Para contrariar, é preciso negar uma destas premissas:', ...r.essenciais.map((i) => `- ${r.texto.premissas[i]}`))
  l.push('', 'Fórmulas (m2):', ...r.proposta.premissas.map((p) => `- ${p}`), `- conclusão: ${r.proposta.conclusao}`)
  return l.join('\n').slice(0, 6000)
}
/**
 * Premissa, visão e lógica de um salto com a ligação achada: as premissas que a conclusão usa precisam ser fatos (com
 * fonte) ou são a base; a ligação é a visão (o que a pessoa escolhe aceitar); com as duas, a conclusão é obrigatória.
 */
export function textoDaLigacao(l: Extract<Ligacao, { fonte: string }>, premissas: string[]): string[] {
  const varias = l.opcoes.length > 1
  return [varias ? 'Para a conclusão valer, falta aceitar uma ligação. Qualquer uma destas fecha o argumento (o Z3 conferiu cada uma):' : 'Para a conclusão valer, falta aceitar:', '',
    ...l.opcoes.flatMap((o, n) => {
      const sobram = premissas.filter((_, i) => !o.essenciais.includes(i))
      return [`${varias ? `${n + 1}. ` : '- '}${o.leitura}`,
        ...(o.essenciais.length ? [`   Premissas que ela usa: ${o.essenciais.map((i) => premissas[i]).join(' ')}`] : []),
        ...(sobram.length ? [`   Não fazem falta: ${sobram.join(' ')}`] : []), '']
    }),
    ...(l.outras > 0 ? [`Há mais ${l.outras} ligação(ões) parecida(s) que também fecham.`, ''] : []),
    'A ligação é a visão por trás do argumento: não é um fato, é o que você escolhe aceitar. As premissas que ela usa precisam ser fatos (com fonte), ou são a base que você assume. Com as duas, a conclusão é obrigatória.']
}
/**
 * O símbolo de um termo novo ou corrigido, pela leitura: "x é parte do todo" → ParteDoTodo; "Deus" (constante) → deus.
 * Sem acento, só letras e números, até 30; o primeiro livre entre os que já existem (ParteDoTodo2…).
 */
export function simboloDaLeitura(leitura: string, tipo: Termo['tipo'], usados: string[]): string {
  const palavras = leitura.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b[xyz]\b/g, ' ').split(/[^A-Za-z0-9]+/).filter(Boolean)
    .filter((p, i, ps) => ps.length === 1 || !/^(e|o|a|os|as|de|do|da|que)$/i.test(p) || i > 0)
  let base = palavras.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('').slice(0, 28) || 'Termo'
  if (!/^[A-Za-z]/.test(base)) base = `T${base}`
  if (tipo === 'constante') base = base[0].toLowerCase() + base.slice(1)
  let s = base
  for (let n = 2; usados.includes(s); n++) s = `${base}${n}`
  return s
}
/** A leitura de um predicado começa pela variável ("x é parte do todo"); se a pessoa não pôs, o Cosmos põe. */
export const leituraComVariavel = (leitura: string, aridade: number) => aridade === 0 || /^[xy]\s/.test(leitura.trim()) ? leitura.trim() : `x ${leitura.trim()}`
export { tituloDoVeredito }
