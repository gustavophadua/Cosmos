/** @jsxImportSource react */
// As peças da IA dentro da Conversa (assistente.ts): o menu de comandos do "+" e do "/", e o cartão de cada resposta,
// com registrar na cadeia e baixar o relatório.
import { useState } from 'react'
import { COMANDOS, leituraComVariavel, notasDaLeitura, provadoSoNaFormaForte, simboloDaLeitura, TITULO_DA_CLASSE, TITULO_FORMA_FORTE, type Comando, type ResultadoIA } from './assistente'
import type { Termo } from '../motor/avaliacao'
import { CartoesDoRelatorio } from './RevisorPlano'
import { relatorioEmMarkdown } from '../motor/revisor-relatorio'
import { lerDeVolta } from '../motor/formalizacao'
import type { Afirmacao } from '../motor/registro'
import type { ParaRegistro } from './FormalizacaoAssistida'
import './conversa-ia.css'

let paraCadeia: ParaRegistro | null = null
/** A passagem da Conversa para Minha cadeia (no Avançado): quem abre a cadeia toma o registro uma vez. */
export const tomarParaCadeia = () => { const r = paraCadeia; paraCadeia = null; return r }
const AFIRMACAO: Record<string, Afirmacao> = { segue: 'segue', contradiz: 'contradiz', independente: 'nao-segue' }

const baixar = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/markdown' })), a = document.createElement('a')
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function MenuDeComandos({ filtro, ia, aoEscolher }: { filtro: string; ia: boolean; aoEscolher: (c: Comando) => void }) {
  const itens = COMANDOS.filter((c) => c.nome.startsWith(filtro.toLowerCase()))
  if (!itens.length) return null
  return <div className="iai-comandos" role="listbox" aria-label="Comandos">
    {itens.map((c) => <button type="button" role="option" aria-selected={false} key={c.nome} onClick={() => aoEscolher(c.nome)} disabled={c.ia && !ia}>
      <strong>/{c.nome}</strong><span>{c.titulo}</span><small>{c.ia && !ia ? 'precisa do Cosmos instalado no computador' : c.descricao}</small>
    </button>)}
  </div>
}

/** O que o Cosmos entendeu de cada fórmula, lido de volta em português sem modelo: o erro de tradução aparece aqui. */
const entendi = (formula: string | undefined, vocabulario: Termo[]) => { if (!formula) return null; try { return lerDeVolta(formula, vocabulario) } catch { return null } }
const Entendi = ({ texto }: { texto: string | null }) => texto ? <small className="iai-entendi"> entendi: {texto}</small> : null

type TipoNovo = 'um' | 'dois' | 'nome'
/**
 * Como o Cosmos leu cada termo, e a correção: a pessoa muda a leitura ou acrescenta um termo ("x invalida a existência
 * de y"), e a verificação é refeita com esse vocabulário fixo. Contorna o modelo pequeno nas frases abstratas ("parte do
 * todo" lido como "x é todo").
 */
function TermosDaLeitura({ vocabulario, aoRefazer, aberto }: { vocabulario: Termo[]; aoRefazer?: (v: Termo[]) => void; aberto?: boolean }) {
  const [editando, setEditando] = useState(false)
  const [leituras, setLeituras] = useState(() => vocabulario.map((t) => t.leitura))
  const [novos, setNovos] = useState<{ tipo: TipoNovo; leitura: string }[]>([])
  const pronto = (): Termo[] => {
    const usados: string[] = []
    const termo = (simbolo: string, tipo: Termo['tipo'], aridade: number, leitura: string) => { usados.push(simbolo); return { simbolo, tipo, aridade, leitura } as Termo }
    const corrigidos = vocabulario.map((t, i) => {
      const leitura = leituraComVariavel(leituras[i], t.aridade).slice(0, 80)
      // leitura mudada, símbolo novo: o modelo lê o nome do símbolo junto com a leitura
      return leitura === t.leitura ? termo(t.simbolo, t.tipo, t.aridade, leitura) : termo(simboloDaLeitura(leitura, t.tipo, [...usados, ...vocabulario.map((x) => x.simbolo).filter((s) => s !== t.simbolo)]), t.tipo, t.aridade, leitura)
    })
    const extras = novos.filter((n) => n.leitura.trim()).map((n) => {
      const aridade = n.tipo === 'um' ? 1 : n.tipo === 'dois' ? 2 : 0, tipo = n.tipo === 'nome' ? 'constante' as const : 'predicado' as const
      const leitura = (n.tipo === 'dois' && !/\by\b/.test(n.leitura) ? `${leituraComVariavel(n.leitura, 2)} y` : leituraComVariavel(n.leitura, aridade)).slice(0, 80)
      return termo(simboloDaLeitura(leitura, tipo, usados), tipo, aridade, leitura)
    })
    return [...corrigidos, ...extras].slice(0, 40)
  }
  if (!editando) return <details className="iai-termos" open={aberto}><summary>Como o Cosmos leu os termos</summary>
    {aberto && <small>Confira antes de aceitar uma ligação: se um termo foi lido errado, as fórmulas e a ligação também saem erradas.</small>}
    <ul>{vocabulario.map((t) => <li key={t.simbolo}><code>{t.simbolo}</code> {t.leitura}</li>)}</ul>
    {aoRefazer && <button type="button" onClick={() => setEditando(true)}>Corrigir os termos</button>}
  </details>
  return <div className="iai-termos iai-termos-edicao">
    <small>Corrija como o Cosmos deve ler cada termo, ou acrescente o que faltou. A verificação é refeita só com estes termos.</small>
    {vocabulario.map((t, i) => <label key={t.simbolo}><span>{t.tipo === 'constante' ? 'nome' : t.aridade === 2 ? 'relação' : 'propriedade'}</span>
      <input value={leituras[i]} maxLength={80} onChange={(e) => setLeituras((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))} /></label>)}
    {novos.map((n, i) => <label key={`novo${i}`}><select value={n.tipo} onChange={(e) => setNovos((ns) => ns.map((x, j) => (j === i ? { ...x, tipo: e.target.value as TipoNovo } : x)))}>
      <option value="um">propriedade (x é …)</option><option value="dois">relação (x … y)</option><option value="nome">nome (alguém ou algo)</option></select>
      <input value={n.leitura} maxLength={80} placeholder={n.tipo === 'dois' ? 'x invalida a existência de y' : n.tipo === 'nome' ? 'Deus' : 'x é parte do todo'} onChange={(e) => setNovos((ns) => ns.map((x, j) => (j === i ? { ...x, leitura: e.target.value } : x)))} /></label>)}
    <div className="iai-cartao-acoes">
      <button type="button" onClick={() => setNovos((ns) => [...ns, { tipo: 'um', leitura: '' }])}>＋ termo</button>
      <button type="button" onClick={() => { aoRefazer?.(pronto()); setEditando(false) }}>Refazer com estes termos</button>
      <button type="button" onClick={() => setEditando(false)}>Cancelar</button>
    </div>
  </div>
}

export function CartaoIA({ resultado, aoRefazer }: { resultado: ResultadoIA; aoRefazer?: (vocabulario: Termo[]) => void }) {
  if (resultado.tipo === 'relatorio') {
    const { relatorio, comando } = resultado
    const n = (v: string) => relatorio.argumentos.filter((a) => a.veredito === v).length
    return <div className="iai-cartao">
      <p className="iai-cartao-resumo">{relatorio.argumentos.length ? `${relatorio.argumentos.length} conclusão(ões): ${n('provado')} provada(s), ${n('salto')} salto(s), ${n('contradiz')} contradição(ões).` : 'Não achei nenhuma conclusão apoiada em outras afirmações ("portanto", "então", "por isso"…).'}
        {comando === 'desmistificar' ? ' Primeiro, o que o texto afirma sem provar.' : ''}</p>
      <CartoesDoRelatorio relatorio={relatorio} baseAntes={comando === 'desmistificar'} />
      <div className="iai-cartao-acoes"><button type="button" onClick={() => baixar('cosmos-revisao.md', relatorioEmMarkdown(relatorio))}>Baixar relatório</button></div>
    </div>
  }
  const { classe, texto, proposta, cenario, essenciais, comando, motivo, ligacao } = resultado
  const achada = ligacao && 'fonte' in ligacao ? ligacao : null, falhou = ligacao && 'motivo' in ligacao ? ligacao : null
  const titulo = !classe ? `Não decidido: ${motivo || 'a tradução não se leu'}`
    : comando === 'contrariar' ? (classe === 'independente' ? 'Dá para contrariar: a conclusão não decorre das premissas' : classe === 'contradiz' ? 'O próprio texto já contraria a conclusão: as premissas provam o oposto' : 'Só dá para contrariar negando uma premissa')
    : provadoSoNaFormaForte(resultado) ? TITULO_FORMA_FORTE : TITULO_DA_CLASSE[classe]
  return <div className="iai-cartao">
    <ol className="revisor-argumentos"><li data-veredito={provadoSoNaFormaForte(resultado) ? 'salto' : classe === 'segue' ? 'provado' : classe === 'independente' ? 'salto' : classe === 'contradiz' ? 'contradiz' : 'sem-traducao'}>
      <header><strong>{titulo}</strong></header>
      {notasDaLeitura(resultado).map((n, i) => <p key={i} className="iai-nota">{n}</p>)}
      <p className="revisor-conclusao">{texto.conclusao}<Entendi texto={entendi(proposta.conclusao, proposta.vocabulario)} /></p>
      <small>Premissas:</small>
      <ul>{texto.premissas.map((p, i) => <li key={i}>{p}{essenciais?.includes(i) ? <b> · sustenta a conclusão</b> : ''}<Entendi texto={entendi(proposta.premissas[i], proposta.vocabulario)} /></li>)}</ul>
      {cenario && <><small>{comando === 'contrariar' ? 'O contra-exemplo: um cenário em que todas as premissas valem e a conclusão não.' : 'Um cenário em que todas as premissas valem e a conclusão não:'}</small><ul className="revisor-cenario">{cenario.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
      {classe === 'independente' && <TermosDaLeitura vocabulario={proposta.vocabulario} aoRefazer={aoRefazer} aberto />}
      {classe === 'independente' && !achada && <small>{falhou ? `Não achei uma ligação que feche: ${falhou.motivo}.` : 'Para a conclusão valer, falta uma afirmação que ligue as premissas a ela.'}</small>}
      {achada && <div className="iai-ligacao">
        <small>{achada.opcoes.length > 1 ? 'Para a conclusão valer, falta aceitar uma ligação. Qualquer uma destas fecha o argumento (o Z3 conferiu cada uma); qual é a sua?' : 'Para a conclusão valer, falta aceitar:'}</small>
        <ol>{achada.opcoes.map((o, n) => <li key={n}>
          <strong>{o.leitura}</strong>
          {o.essenciais.length > 0 && <small> Os <b>fatos</b> que ela usa: {o.essenciais.map((i) => texto.premissas[i]).join(' ')}</small>}
          {o.essenciais.length < texto.premissas.length && <small> Não fazem falta: {texto.premissas.filter((_, i) => !o.essenciais.includes(i)).join(' ')}</small>}
          <a href="#/lab?secao=cadeia" onClick={() => { paraCadeia = { formula: proposta.conclusao, premissas: [...proposta.premissas, o.ponte], afirmacao: 'segue', dominio: 'geral' } }}>Aceito esta: registrar provado com ela</a>
        </li>)}</ol>
        {achada.outras > 0 && <small>Há mais {achada.outras} ligação(ões) parecida(s) que também fecham.</small>}
        <small>A ligação é a <b>visão</b> por trás do argumento: não é um fato, é o que você escolhe aceitar. Os <b>fatos</b> precisam de fonte, ou são a base que você assume. Com os dois, a conclusão é obrigatória.</small>
      </div>}
      {essenciais && <small>{essenciais.length ? 'Negue uma das premissas marcadas e a conclusão cai; as outras não fazem falta.' : 'Nenhuma premissa sozinha sustenta a conclusão: ela segue de mais de um jeito.'}</small>}
      {classe !== 'independente' && <TermosDaLeitura vocabulario={proposta.vocabulario} aoRefazer={aoRefazer} />}
      <details><summary>Fórmulas (m2)</summary><code>{[...proposta.premissas, `⊢ ${proposta.conclusao}`].join('\n')}</code></details>
    </li></ol>
    {classe && <div className="iai-cartao-acoes">
      <a href="#/lab?secao=cadeia" onClick={() => { paraCadeia = { formula: proposta.conclusao, premissas: proposta.premissas, afirmacao: AFIRMACAO[classe], dominio: 'geral' } }}>Registrar na minha cadeia</a>
    </div>}
  </div>
}
