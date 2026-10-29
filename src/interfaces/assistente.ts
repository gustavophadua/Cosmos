// O assistente da Conversa: os comandos ("/verificar", "/revisar"…), a escolha automática quando a pessoa não diz qual,
// e o texto que vai para o cofre. A IA roda no serviço local (Ollama); quem decide é o Z3. Sem o serviço, só /buscar.

import type { Classe, Termo } from '../motor/avaliacao'
import type { Proposta } from '../motor/formalizacao'
import { relatorioEmMarkdown, tituloDoVeredito, type RelatorioRevisor } from '../motor/revisor-relatorio'

export type Comando = 'verificar' | 'revisar' | 'desmistificar' | 'contrariar' | 'buscar'
export const COMANDOS: { nome: Comando; titulo: string; descricao: string; exemplo: string; ia: boolean }[] = [
  { nome: 'verificar', titulo: 'Verificar', ia: true, descricao: 'Um argumento curto: a conclusão decorre das premissas? Provado ou salto, com o cenário.',
    exemplo: 'Todo cliente do plano anual tem suporte. A padaria é cliente do plano anual. Então a padaria tem suporte.' },
  { nome: 'revisar', titulo: 'Revisar plano', ia: true, descricao: 'Um plano ou projeto inteiro (ou um arquivo): cada conclusão, provada ou salto.',
    exemplo: 'Nossos clientes são pequenas empresas, e toda pequena empresa precisa controlar o caixa. Por isso, nossos clientes vão comprar o módulo de caixa.' },
  { nome: 'desmistificar', titulo: 'Desmistificar', ia: true, descricao: 'O que o texto afirma sem provar (precisa de fonte) e o que ele tira sem base.',
    exemplo: 'Todo mundo que trabalha de casa produz menos. A Ana trabalha de casa. Por isso a Ana produz menos que o time.' },
  { nome: 'contrariar', titulo: 'Contrariar', ia: true, descricao: 'Como derrubar a conclusão: o cenário contra ela, ou as premissas que é preciso negar.',
    exemplo: 'Se o servidor cair, o site sai do ar. O site saiu do ar. Então o servidor caiu.' },
  { nome: 'buscar', titulo: 'Buscar', ia: false, descricao: 'Procura nos registros públicos do Cosmos (F0 a F8), pelo nome, assunto ou hash.', exemplo: 'F2' },
]

/** "/contrariar texto" → o comando e o resto; sem barra, o comando escolhido sozinho. */
export function lerPedido(texto: string, escolhido: Comando | null): { comando: Comando; texto: string; automatico: boolean } {
  const m = /^\/(\p{L}+)\s*([\s\S]*)$/u.exec(texto.trim())
  const nome = m && COMANDOS.find((c) => c.nome === m[1].toLowerCase())
  if (nome) return { comando: nome.nome, texto: m[2].trim(), automatico: false }
  if (escolhido) return { comando: escolhido, texto: texto.trim(), automatico: false }
  return { comando: detectar(texto), texto: texto.trim(), automatico: true }
}

const frases = (texto: string) => texto.replace(/\r\n?/g, '\n').split(/\n+|(?<=[.!?;])\s+(?=\p{Lu}|["“(])/u).map((s) => s.trim()).filter((s) => s.length > 1)
/** Texto longo ou com parágrafos: revisar; duas frases ou mais: verificar; uma frase curta: buscar. */
export function detectar(texto: string): Comando {
  const t = texto.trim()
  if (t.length > 600 || t.split(/\n\s*\n/).filter((p) => p.trim()).length >= 2) return 'revisar'
  return frases(t).length >= 2 ? 'verificar' : 'buscar'
}
/** Um argumento curto: as frases menos a última são as premissas; a última é a conclusão. Null com menos de duas. */
export function separarArgumento(texto: string): { premissas: string[]; conclusao: string } | null {
  const fs = frases(texto)
  if (fs.length < 2 || fs.length > 11) return null
  return { premissas: fs.slice(0, -1).map((f) => f.slice(0, 500)), conclusao: fs.at(-1)!.slice(0, 500) }
}

export type ResultadoIA =
  | { tipo: 'argumento'; comando: 'verificar' | 'contrariar'; texto: { premissas: string[]; conclusao: string }; proposta: Proposta; classe: Classe | null; motivo?: string; cenario?: string[]; essenciais?: number[]; reparo?: string }
  | { tipo: 'relatorio'; comando: 'revisar' | 'desmistificar'; relatorio: RelatorioRevisor }

export interface ClienteIA {
  formalizar(texto: { premissas: string[]; conclusao: string }, signal?: AbortSignal): Promise<{ conteudo: string; reparo?: string }>
  conferir(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, signal?: AbortSignal): Promise<{ classeZ3: Classe | null; motivo: string; cenario?: string[] }>
  revisar(texto: string, signal?: AbortSignal): Promise<unknown>
  estadoRevisao(signal?: AbortSignal): Promise<{ estado: string; fase?: string; feito?: number; total?: number; relatorio?: RelatorioRevisor; erro?: string }>
}

/** Executa um comando de IA. `ler` lê a proposta do modelo (lerProposta), `progresso` mostra a fase. */
export async function executar(cliente: ClienteIA, comando: Exclude<Comando, 'buscar'>, texto: string, ler: (conteudo: string) => Proposta,
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
  const r = await cliente.formalizar(t)
  const proposta = ler(r.conteudo)
  progresso('O Z3 está conferindo…')
  const c = await cliente.conferir({ vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao, classe: null })
  const base = { tipo: 'argumento' as const, comando, texto: t, proposta, classe: c.classeZ3, ...(c.motivo ? { motivo: c.motivo } : {}), ...(c.cenario ? { cenario: c.cenario } : {}), ...(r.reparo ? { reparo: r.reparo } : {}) }
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

/** O que vai para o cofre: um resumo em texto (o cofre guarda conversas de até 12 mil caracteres). */
export function resumoEmTexto(r: ResultadoIA): string {
  if (r.tipo === 'relatorio') {
    const md = relatorioEmMarkdown(r.relatorio)
    return md.length <= 6000 ? md : `${md.slice(0, 5900)}\n\n(resumo cortado; baixe o relatório completo na hora da revisão)`
  }
  const l = [r.classe ? `${TITULO_DA_CLASSE[r.classe]}.` : `Não decidido: ${r.motivo ?? 'a tradução não se leu'}.`, '', 'Premissas:', ...r.texto.premissas.map((p) => `- ${p}`), `Conclusão: ${r.texto.conclusao}`]
  if (r.cenario) l.push('', 'Cenário em que as premissas valem e a conclusão não:', ...r.cenario.map((c) => `- ${c}`))
  if (r.essenciais) l.push('', 'Para contrariar, é preciso negar uma destas premissas:', ...r.essenciais.map((i) => `- ${r.texto.premissas[i]}`))
  l.push('', 'Fórmulas (m2):', ...r.proposta.premissas.map((p) => `- ${p}`), `- conclusão: ${r.proposta.conclusao}`)
  return l.join('\n').slice(0, 6000)
}
export { tituloDoVeredito }
