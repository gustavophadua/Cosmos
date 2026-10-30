/** @jsxImportSource react */
// As peças da IA dentro da Conversa (assistente.ts): o menu de comandos do "+" e do "/", e o cartão de cada resposta,
// com registrar na cadeia e baixar o relatório.
import { COMANDOS, notasDaLeitura, provadoSoNaFormaForte, TITULO_DA_CLASSE, TITULO_FORMA_FORTE, type Comando, type ResultadoIA } from './assistente'
import { CartoesDoRelatorio } from './RevisorPlano'
import { relatorioEmMarkdown } from '../motor/revisor-relatorio'
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

export function CartaoIA({ resultado }: { resultado: ResultadoIA }) {
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
      <p className="revisor-conclusao">{texto.conclusao}</p>
      <small>Premissas:</small>
      <ul>{texto.premissas.map((p, i) => <li key={i}>{p}{essenciais?.includes(i) ? <b> · sustenta a conclusão</b> : ''}</li>)}</ul>
      {cenario && <><small>{comando === 'contrariar' ? 'O contra-exemplo: um cenário em que todas as premissas valem e a conclusão não.' : 'Um cenário em que todas as premissas valem e a conclusão não:'}</small><ul className="revisor-cenario">{cenario.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
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
      <details><summary>Fórmulas (m2)</summary><code>{[...proposta.premissas, `⊢ ${proposta.conclusao}`].join('\n')}</code></details>
    </li></ol>
    {classe && <div className="iai-cartao-acoes">
      <a href="#/lab?secao=cadeia" onClick={() => { paraCadeia = { formula: proposta.conclusao, premissas: proposta.premissas, afirmacao: AFIRMACAO[classe], dominio: 'geral' } }}>Registrar na minha cadeia</a>
    </div>}
  </div>
}
