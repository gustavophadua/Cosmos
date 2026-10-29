/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { criarClienteOllama, type EstadoRevisao } from './ollama-cliente'
import { MAX_TEXTO_REVISOR, relatorioEmMarkdown, tituloDoVeredito, type RelatorioRevisor, type Veredito } from '../motor/revisor'

const FASE: Record<string, string> = { extraindo: 'Separando afirmações e conclusões', traduzindo: 'Traduzindo cada argumento para m2', conferindo: 'O Z3 está conferindo' }
const ORDEM: Veredito[] = ['salto', 'contradiz', 'incompativel', 'provado', 'sem-traducao']
const EXEMPLO = `Nossos clientes são pequenas empresas, e toda pequena empresa precisa controlar o caixa. Por isso, nossos clientes vão comprar o módulo de caixa.

Só pode usar o módulo quem tem o plano anual. A padaria do bairro tem o plano anual. Então a padaria pode usar o módulo.

Toda venda pelo site gera nota fiscal. O pedido 12 foi vendido pelo site. Logo, o pedido 12 gerou nota fiscal.`

const baixar = (nome: string, conteudo: string, tipo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo })), a = document.createElement('a')
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * O revisor de planos ("fato e visão", src/motor/revisor.ts): o texto de um plano vai para o Ollama local, que separa
 * afirmações e conclusões e traduz cada argumento; o Z3 diz se cada conclusão decorre do que o próprio plano afirma.
 * Roda no serviço local, em segundo plano; a tela só acompanha. O texto não sai do computador.
 */
export function RevisorPlano() {
  const local = useMemo(() => { try { return criarClienteOllama(location.origin) } catch { return null } }, [])
  const [pronto, setPronto] = useState<'conferindo' | 'sim' | 'nao'>('conferindo'), [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<EstadoRevisao | null>(null), [erro, setErro] = useState('')
  const vigia = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const acompanhar = () => {
    clearTimeout(vigia.current)
    if (!local) return
    void local.estadoRevisao().then((e) => {
      setEstado(e)
      if (e.estado === 'rodando') vigia.current = setTimeout(acompanhar, 2000)
    }, () => { vigia.current = setTimeout(acompanhar, 5000) })
  }
  useEffect(() => {
    if (!local) { setPronto('nao'); return }
    void local.carregar().then((o) => { setPronto(o.estado === 'pronto' ? 'sim' : 'nao'); if (o.estado === 'pronto') acompanhar() }, () => setPronto('nao'))
    return () => clearTimeout(vigia.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  const comecar = async () => {
    if (!local) return
    setErro('')
    try { setEstado(await local.revisar(texto)); vigia.current = setTimeout(acompanhar, 1500) } catch (e) {
      setErro((e as Error).message === 'limite' ? 'O serviço está ocupado com outra formalização ou revisão. Espere terminar.' : 'Não foi possível começar a revisão. Confira se o serviço local está aberto.')
    }
  }
  const lerArquivo = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_TEXTO_REVISOR * 4) { setErro(`O arquivo é grande demais: o limite é de ${MAX_TEXTO_REVISOR.toLocaleString('pt-BR')} caracteres.`); return }
    void f.text().then((t) => { setTexto(t.slice(0, MAX_TEXTO_REVISOR)); setErro(t.length > MAX_TEXTO_REVISOR ? `Só os primeiros ${MAX_TEXTO_REVISOR.toLocaleString('pt-BR')} caracteres entram.` : '') })
  }

  if (pronto !== 'sim') return <div className="cadeia-pessoal">
    <div className="labs-result" role="note"><strong>O revisor usa o serviço local com o Ollama.</strong>
      <p>Com o Ollama aberto e o modelo baixado (<code>ollama pull qwen3:4b</code>), abra o <code>Abrir-Cosmos-IA.cmd</code> (ou rode <code>node scripts/integracoes-p0.mjs --ollama</code> na pasta do Cosmos) e volte aqui, em Labs → Revisar plano.</p>
      <p>{pronto === 'conferindo' ? 'Conferindo o serviço…' : 'O serviço local com o Ollama não respondeu neste endereço.'}</p></div>
  </div>

  const rodando = estado?.estado === 'rodando'
  const relatorio: RelatorioRevisor | undefined = estado?.estado === 'pronto' ? estado.relatorio : undefined
  const conta = (v: Veredito) => relatorio?.argumentos.filter((a) => a.veredito === v).length ?? 0
  const argumentos = relatorio ? [...relatorio.argumentos.entries()].sort((a, b) => ORDEM.indexOf(a[1].veredito) - ORDEM.indexOf(b[1].veredito)) : []

  return <div className="cadeia-pessoal formalizacao revisor">
    <div className="labs-result" role="note"><strong>O que se avalia é o argumento, não a pessoa.</strong>
      <p>O plano vai para o Ollama local e não sai deste computador. O modelo separa as afirmações e as conclusões e traduz cada argumento; quem decide é o Z3. <b>Provado</b> quer dizer que a conclusão decorre do que o próprio plano afirma. <b>Salto</b> quer dizer que não decorre: o plano a apresenta como consequência, mas ela é visão, e vem com um cenário em que tudo o que o plano afirma vale e ela falha. Se as afirmações de base são verdade, o revisor não diz: elas saem listadas como o que precisa de fonte.</p></div>

    <section className="labs-surface">
      <h3>O plano</h3>
      <p>Cole o texto ou abra um arquivo de texto (.txt ou .md). De um PDF ou Word, copie e cole o texto. Cada trecho de cerca de 1.500 caracteres leva perto de um minuto, e cada conclusão mais um.</p>
      <form className="cadeia-form" onSubmit={(e) => { e.preventDefault(); void comecar() }}>
        <label className="cadeia-largo">Texto <small>{texto.length.toLocaleString('pt-BR')} de {MAX_TEXTO_REVISOR.toLocaleString('pt-BR')} caracteres</small>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} maxLength={MAX_TEXTO_REVISOR} disabled={rodando} placeholder={EXEMPLO} /></label>
        <label>Arquivo<input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={rodando} onChange={(e) => lerArquivo(e.target.files?.[0])} /></label>
        <div className="cadeia-acoes">
          <Button type="submit" disabled={rodando || !texto.trim()}>{rodando ? 'Revisando…' : 'Revisar o plano'}</Button>
          <Button type="button" variant="outline" disabled={rodando} onClick={() => setTexto(EXEMPLO)}>Usar o exemplo</Button>
        </div>
      </form>
    </section>

    {erro && <p className="labs-result has-conflict" role="alert">{erro}</p>}

    {rodando && <p className="labs-result" role="status"><strong>{FASE[estado.fase ?? ''] ?? 'Revisando'}{estado.total ? `: ${estado.feito! + 1} de ${estado.total}` : '…'}</strong> · {Math.round((estado.ms ?? 0) / 1000)} s</p>}
    {estado?.estado === 'erro' && <p className="labs-result has-conflict" role="alert">A revisão parou: {estado.erro}</p>}

    {relatorio && <section className="labs-surface">
      <h3>Resultado</h3>
      <p className="cadeia-previa" role="status">{relatorio.argumentos.length} conclusão(ões): {conta('provado')} provada(s), {conta('salto')} salto(s), {conta('contradiz')} contradição(ões), {conta('incompativel')} com afirmações incompatíveis, {conta('sem-traducao')} sem tradução. {relatorio.afirmacoes.length} afirmações em {relatorio.blocos} trecho(s); extrator {relatorio.extrator}, tradução {relatorio.prompt}.</p>
      {!relatorio.argumentos.length && <p>O extrator não achou nenhuma conclusão apoiada em outras afirmações. O revisor só avalia o que o texto apresenta como consequência ("portanto", "então", "por isso"…).</p>}
      <ol className="revisor-argumentos">{argumentos.map(([i, a]) => <li key={i} data-veredito={a.veredito}>
        <header><strong>{tituloDoVeredito(a.veredito)}</strong></header>
        <p className="revisor-conclusao">{a.conclusao}</p>
        <small>Apoiada em:</small>
        <ul>{a.apoios.map((p, j) => <li key={j}>{p}</li>)}</ul>
        {a.cenario && <><small>Um cenário em que tudo isso vale e a conclusão não:</small><ul className="revisor-cenario">{a.cenario.map((c, j) => <li key={j}>{c}</li>)}</ul></>}
        {a.veredito === 'salto' && <small>Para valer, o plano precisa de mais uma afirmação que ligue os apoios à conclusão, com fonte.</small>}
        {a.formulas && <details><summary>Fórmulas (m2)</summary><code>{[...a.formulas.premissas, `⊢ ${a.formulas.conclusao}`].join('\n')}</code></details>}
        {a.motivo && <small className="has-conflict">{a.motivo}</small>}
      </li>)}</ol>
      {relatorio.afirmacoes.some((a) => a.papel === 'base') && <>
        <h3>Afirmações de base</h3>
        <p>O plano não as prova: são o ponto de partida dele e precisam de fonte (dado, contrato, pesquisa).</p>
        <ul>{relatorio.afirmacoes.filter((a) => a.papel === 'base').map((a) => <li key={a.id}>{a.texto}</li>)}</ul>
      </>}
      {relatorio.avisos.length > 0 && <p className="has-conflict">{relatorio.avisos.join(' · ')}</p>}
      <div className="cadeia-acoes">
        <Button onClick={() => baixar('cosmos-revisao-do-plano.md', relatorioEmMarkdown(relatorio), 'text/markdown')}>Baixar o relatório (.md)</Button>
        <Button variant="outline" onClick={() => baixar('cosmos-revisao-do-plano.json', JSON.stringify(relatorio, null, 2), 'application/json')}>Baixar os dados (.json)</Button>
      </div>
    </section>}
  </div>
}
