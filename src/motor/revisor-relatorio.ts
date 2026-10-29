// A parte do revisor de planos (revisor.ts) que a tela usa: os tipos do relatório e o relatório em Markdown. Fica
// sem dependência do motor, porque o site público não leva o Z3 nem o motor finito.

import type { Termo } from './avaliacao'

/** O maior texto aceito: o extrator roda bloco a bloco, cerca de um minuto cada na Vega 8. */
export const MAX_TEXTO_REVISOR = 20_000

export type Veredito = 'provado' | 'salto' | 'contradiz' | 'incompativel' | 'sem-traducao'
export interface ArgumentoRevisado {
  conclusao: string
  apoios: string[]
  veredito: Veredito
  formulas?: { vocabulario: Termo[]; premissas: string[]; conclusao: string }
  /** no salto: um cenário em que todos os apoios valem e a conclusão não */
  cenario?: string[]
  motivo?: string
  reparo?: string
}
export interface RelatorioRevisor {
  formato: 'cosmos-revisor-v1'
  extrator: string
  prompt: string
  blocos: number
  afirmacoes: { id: number; texto: string; papel: 'base' | 'conclusao' | 'solta' }[]
  argumentos: ArgumentoRevisado[]
  avisos: string[]
}

const TITULO: Record<Veredito, string> = {
  provado: 'Provado: decorre do que o plano afirma',
  salto: 'Salto: não decorre do que o plano afirma',
  contradiz: 'Contradição: o próprio plano prova o contrário',
  incompativel: 'Afirmações incompatíveis entre si',
  'sem-traducao': 'Não foi possível traduzir',
}
export const tituloDoVeredito = (v: Veredito) => TITULO[v]

/** O relatório em Markdown, para baixar e mandar adiante. */
export function relatorioEmMarkdown(r: RelatorioRevisor, quando = new Date()): string {
  const n = (v: Veredito) => r.argumentos.filter((a) => a.veredito === v).length
  const l: string[] = [`# Revisão do plano: fato e visão`, '', `Gerado pelo Cosmos em ${quando.toISOString().slice(0, 16).replace('T', ' ')} UTC (extrator ${r.extrator}, tradução ${r.prompt}). O modelo de linguagem propõe a tradução; quem decide é o Z3. O que se avalia é o argumento, não a pessoa: "provado" quer dizer que a conclusão decorre das afirmações do próprio plano, não que elas sejam verdade.`, '',
    `**${r.argumentos.length} conclusões:** ${n('provado')} provadas, ${n('salto')} saltos, ${n('contradiz')} contradições, ${n('incompativel')} com afirmações incompatíveis, ${n('sem-traducao')} sem tradução.`, '']
  for (const [i, a] of r.argumentos.entries()) {
    l.push(`## ${i + 1}. ${a.conclusao}`, '', `**${TITULO[a.veredito]}.**`, '', 'Apoiada em:', ...a.apoios.map((p) => `- ${p}`), '')
    if (a.cenario) l.push('Um cenário em que tudo isso vale e a conclusão não:', ...a.cenario.map((c) => `- ${c}`), '')
    if (a.veredito === 'salto') l.push('Para a conclusão valer, o plano precisa de mais uma afirmação que ligue os apoios a ela, com fonte.', '')
    if (a.formulas) l.push('Fórmulas (m2):', ...a.formulas.premissas.map((p) => `- ${p}`), `- conclusão: ${a.formulas.conclusao}`, '')
    if (a.motivo) l.push(`Motivo: ${a.motivo}`, '')
  }
  const base = r.afirmacoes.filter((a) => a.papel === 'base')
  if (base.length) l.push('## Afirmações de base (o plano não as prova: precisam de fonte)', '', ...base.map((a) => `- ${a.texto}`), '')
  if (r.avisos.length) l.push('## Avisos', '', ...r.avisos.map((a) => `- ${a}`), '')
  return l.join('\n')
}
