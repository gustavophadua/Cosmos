// O assistente da Conversa: os comandos ("/verificar", "/revisar"…), a escolha automática quando a pessoa não diz qual,
// e o texto que vai para o cofre. A IA roda no serviço local (Ollama); quem decide é o Z3. A afirmação solta (uma frase
// só) tem resposta sem modelo: não há o que provar, ela precisa de fonte.

import type { Classe, Termo } from '../motor/avaliacao'
import type { Proposta } from '../motor/formalizacao'
import { relatorioEmMarkdown, tituloDoVeredito, type RelatorioRevisor } from '../motor/revisor-relatorio'
import type { Ligacao } from './ollama-cliente'

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
const partes = (s: string) => s.split(/\s*[;,]\s*/).map((p) => p.trim().replace(/^(e|mas|também)\s+/iu, '')).filter((p) => p.length > 1)
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
  for (const a of r.texto.atenuadas ?? []) {
    l.push(`"${a.original}" diz "${a.palavra}", e a lógica não tem "a maioria": para conferir, li como "${r.texto.premissas[a.premissa]}" (vale para todos).`)
    if (r.classe === 'segue') l.push(`Com "${a.palavra}", a conclusão não decorre: "${a.palavra}" admite exceções, e o caso da conclusão pode ser uma delas. Ela só está provada se a frase valer para todos, e aí essa premissa é uma generalização que precisa de fonte.`)
  }
  return l
}

/**
 * A resposta para uma frase só, sem modelo: não há premissas, então não há o que provar nem derrubar pela lógica; a
 * afirmação precisa de fonte. A generalização ("todo", "nenhum", "sempre"…) cai com um único caso contrário.
 */
export function respostaAfirmacao(texto: string): string {
  const t = texto.trim().replace(/\s+/g, ' ')
  if (t.split(' ').length < 3) return 'Escreva um raciocínio (as razões e a conclusão) ou cole um plano, e o Cosmos separa o que decorre dos fatos do que é salto. Toque em + para ver os comandos.'
  const geral = /^(tod[oa]s?|nenhum[a]?|ningu[eé]m|sempre|nunca|qualquer|cada)(?![\p{L}])/iu.exec(t)
  const l = [`"${t.slice(0, 300)}" é uma afirmação sozinha: não vem com razões (premissas), então não há o que provar nem derrubar pela lógica. Ela pode até ser verdade, mas quem diz isso é uma fonte (dado, pesquisa, documento), não o raciocínio.`]
  if (geral) l.push(`É uma generalização ("${geral[1].toLowerCase()}…"): basta um único caso contrário para derrubá-la. Exemplos a favor não a provam; é preciso que não exista nenhum caso contra.`)
  l.push('Para o Cosmos conferir um raciocínio, escreva as razões e a conclusão. Por exemplo: "Todo cliente do plano anual tem suporte. A padaria é cliente do plano anual. Então a padaria tem suporte."')
  return l.join('\n\n')
}
/** Um argumento curto: as frases menos a última são as premissas; a última é a conclusão. Null com menos de duas. */
export function separarArgumento(texto: string): ArgumentoSeparado | null {
  const fs = frases(texto)
  if (fs.length === 1) { const a = argumentoNumaFrase(fs[0]); return a && semAtenuantes(a) }
  if (fs.length < 2 || fs.length > 11) return null
  return semAtenuantes({ premissas: fs.slice(0, -1).map((f) => f.slice(0, 500)), conclusao: fs.at(-1)!.slice(0, 500) })
}

export type ResultadoIA =
  | { tipo: 'argumento'; comando: 'verificar' | 'contrariar'; texto: ArgumentoSeparado; proposta: Proposta; classe: Classe | null; motivo?: string; cenario?: string[]; essenciais?: number[]; reparo?: string; ligacao?: Ligacao }
  | { tipo: 'relatorio'; comando: 'revisar' | 'desmistificar'; relatorio: RelatorioRevisor }

export interface ClienteIA {
  formalizar(texto: { premissas: string[]; conclusao: string }, signal?: AbortSignal): Promise<{ conteudo: string; reparo?: string }>
  conferir(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, signal?: AbortSignal): Promise<{ classeZ3: Classe | null; motivo: string; cenario?: string[] }>
  revisar(texto: string, signal?: AbortSignal): Promise<unknown>
  /** a ligação que falta num salto (ponte.ts); sem ela, o salto vem sem a proposta */
  ponte?(a: { vocabulario: Termo[]; premissas: string[]; conclusao: string; cenario: string[] }, signal?: AbortSignal): Promise<Ligacao>
  estadoRevisao(signal?: AbortSignal): Promise<{ estado: string; fase?: string; feito?: number; total?: number; relatorio?: RelatorioRevisor; erro?: string }>
}

/** Executa um comando de IA. `ler` lê a proposta do modelo (lerProposta), `progresso` mostra a fase. */
export async function executar(cliente: ClienteIA, comando: Comando, texto: string, ler: (conteudo: string) => Proposta,
  progresso: (msg: string) => void, esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ResultadoIA> {
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
  progresso('O modelo está traduzindo o argumento…')
  const r = await cliente.formalizar({ premissas: t.premissas, conclusao: t.conclusao })
  const proposta = ler(r.conteudo)
  progresso('O Z3 está conferindo…')
  const c = await cliente.conferir({ vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao, classe: null })
  const base = { tipo: 'argumento' as const, comando, texto: t, proposta, classe: c.classeZ3, ...(c.motivo ? { motivo: c.motivo } : {}), ...(c.cenario ? { cenario: c.cenario } : {}), ...(r.reparo ? { reparo: r.reparo } : {}) }
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
    const sem = await cliente.conferir({ vocabulario: proposta.vocabulario, premissas: proposta.premissas.filter((_, j) => j !== i), conclusao: proposta.conclusao, classe: null })
    if (sem.classeZ3 !== 'segue') essenciais.push(i)
  }
  return { ...base, essenciais }
}

export const TITULO_DA_CLASSE: Record<Classe, string> = { segue: 'Provado: a conclusão decorre das premissas', independente: 'Salto: a conclusão não decorre das premissas', contradiz: 'Contradição: as premissas provam o contrário' }
/** Provado só com "geralmente" lido como "todos": para o texto como veio, é salto, e o título diz isso. */
export const provadoSoNaFormaForte = (r: { texto: ArgumentoSeparado; classe: Classe | null }) => r.classe === 'segue' && !!r.texto.atenuadas?.length
export const TITULO_FORMA_FORTE = 'Salto como está escrito; provado só se valer para todos'

/** O que vai para o cofre: um resumo em texto (o cofre guarda conversas de até 12 mil caracteres). */
export function resumoEmTexto(r: ResultadoIA): string {
  if (r.tipo === 'relatorio') {
    const md = relatorioEmMarkdown(r.relatorio)
    return md.length <= 6000 ? md : `${md.slice(0, 5900)}\n\n(resumo cortado; baixe o relatório completo na hora da revisão)`
  }
  const notas = notasDaLeitura(r)
  const l = [provadoSoNaFormaForte(r) ? `${TITULO_FORMA_FORTE}.` : r.classe ? `${TITULO_DA_CLASSE[r.classe]}.` : `Não decidido: ${r.motivo ?? 'a tradução não se leu'}.`, ...(notas.length ? ['', ...notas] : []), '', 'Premissas:', ...r.texto.premissas.map((p) => `- ${p}`), `Conclusão: ${r.texto.conclusao}`]
  if (r.cenario) l.push('', 'Cenário em que as premissas valem e a conclusão não:', ...r.cenario.map((c) => `- ${c}`))
  if (r.ligacao && 'fonte' in r.ligacao) l.push('', ...textoDaLigacao(r.ligacao, r.texto.premissas))
  else if (r.ligacao && 'motivo' in r.ligacao) l.push('', `Não achei uma ligação que feche: ${r.ligacao.motivo}.`)
  if (r.essenciais) l.push('', 'Para contrariar, é preciso negar uma destas premissas:', ...r.essenciais.map((i) => `- ${r.texto.premissas[i]}`))
  l.push('', 'Fórmulas (m2):', ...r.proposta.premissas.map((p) => `- ${p}`), `- conclusão: ${r.proposta.conclusao}`)
  return l.join('\n').slice(0, 6000)
}
/**
 * Fato, visão e lógica de um salto com a ligação achada: as premissas que a conclusão usa são os fatos (precisam de fonte
 * ou são a base); a ligação é a visão (o que a pessoa escolhe aceitar); com as duas, a conclusão é obrigatória.
 */
export function textoDaLigacao(l: Extract<Ligacao, { fonte: string }>, premissas: string[]): string[] {
  const varias = l.opcoes.length > 1
  return [varias ? 'Para a conclusão valer, falta aceitar uma ligação. Qualquer uma destas fecha o argumento (o Z3 conferiu cada uma):' : 'Para a conclusão valer, falta aceitar:', '',
    ...l.opcoes.flatMap((o, n) => {
      const sobram = premissas.filter((_, i) => !o.essenciais.includes(i))
      return [`${varias ? `${n + 1}. ` : '- '}${o.leitura}`,
        ...(o.essenciais.length ? [`   Fatos que ela usa: ${o.essenciais.map((i) => premissas[i]).join(' ')}`] : []),
        ...(sobram.length ? [`   Não fazem falta: ${sobram.join(' ')}`] : []), '']
    }),
    ...(l.outras > 0 ? [`Há mais ${l.outras} ligação(ões) parecida(s) que também fecham.`, ''] : []),
    'A ligação é a visão por trás do argumento: não é um fato, é o que você escolhe aceitar. Os fatos (as premissas que ela usa) precisam de fonte, ou são a base que você assume. Com os dois, a conclusão é obrigatória.']
}
export { tituloDoVeredito }
