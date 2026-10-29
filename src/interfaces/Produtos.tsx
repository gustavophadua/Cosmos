/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { niveisBookDemo, consultarCatalogoLocal } from './dados'
import { pesquisarPublicos, REGISTROS_PUBLICOS } from '../v3/catalogo'
import { Labs } from './Labs'
import { Integracoes } from './Integracoes'
import { ContaApp, CarteiraLocal, useContaLocal } from './Conta'
import { salvarDadosConta } from '../local/conta'
import { GraficoMercado } from './Graficos'
import type { InterfaceProduto } from './config'
import { Icone } from './Janela'
import { MoedaCosmos } from './Moeda'
import { BarraCosmos, NotaLicenca } from './Navegacao'
import { criarClienteOllama } from './ollama-cliente'
import { lerProposta } from '../motor/formalizacao'
import { COMANDOS, executar, lerPedido, resumoEmTexto, type Comando, type ResultadoIA } from './assistente'
import { CartaoIA, MenuDeComandos } from './ConversaIA'
import './produtos.css'
import './referencia.css'
import './experiencia.css'

type Conversa = { id: number; pergunta: string; resposta: string }
// Sem conta, a sessão vive no módulo: trocar de tela (Labs, Terminal) e voltar não apaga a conversa. Recarregar apaga.
const sessao: { historico: Conversa[]; fio: number[]; escuro: boolean; dono: string | undefined } = { historico: [], fio: [], escuro: false, dono: undefined }
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// os resultados da IA desta sessão, pelo id da conversa: o cofre guarda o resumo em texto, e a tela mostra o cartão
const resultadosIA = new Map<number, ResultadoIA>()

function Turno({ conversa, novo, resultado, progresso }: { conversa: Conversa; novo: boolean; resultado?: ResultadoIA; progresso?: string }) {
  // a busca mostra as fontes do catálogo; os comandos de IA, não
  const busca = !resultado && progresso === undefined && (!conversa.pergunta.startsWith('/') || conversa.pergunta.startsWith('/buscar '))
  return <section className="iai-turno" data-id={conversa.id} data-novo={novo ? '' : undefined}>
    <div className="iai-question">{conversa.pergunta}</div>
    <div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong><span className="iai-message-context">{busca ? 'Catálogo local' : 'IA local · o Z3 decide'}</span></small>
      {progresso !== undefined ? <p className="iai-progresso" role="status">{progresso}</p> : resultado ? <CartaoIA resultado={resultado} /> : <p>{conversa.resposta}</p>}
      {busca && <Fontes pergunta={conversa.pergunta.replace(/^\/buscar /, '')} />}</div></div>
  </section>
}

// as fontes da resposta: cada registro público encontrado, com o hash e o caminho para virar rascunho no Labs
function Fontes({ pergunta }: { pergunta: string }) {
  const fontes = pesquisarPublicos(pergunta.trim().slice(0, 2000)).slice(0, 9)
  if (!fontes.length) return <a className="iai-source-card" href="#/cadeia"><span><Icone nome="file" /></span><span><strong>Catálogo local</strong><small>{REGISTROS_PUBLICOS.length} registros públicos</small></span><span aria-hidden="true">›</span></a>
  return <div className="iai-fontes" aria-label="Fontes encontradas no catálogo">
    {fontes.map(f => <div className="iai-fonte" key={f.id}>
      <span className="iai-fonte-id">{f.id}</span>
      <div className="iai-fonte-dados"><strong>{f.titulo}</strong><small>{f.dominio} · estado declarado: {f.estado}</small><code title={f.hash}>sha256:{f.hash.slice(0, 16)}…</code></div>
      <div className="iai-fonte-acoes"><a href={`#/lab?secao=rascunhos&fonte=${f.id}`}>Levar ao Labs</a><a href="#/cadeia">Ver na cadeia</a></div>
    </div>)}
    <p className="iai-fonte-limite">Hash e autoria não comprovam a verdade do conteúdo. No Labs, a verificação confere o hash e a assinatura do selo.</p>
  </div>
}

function IAI() {
  const conta = useContaLocal(), dono = conta.perfil?.perfil.pubkey
  const [historicoTemporario, setHistoricoTemporario] = useState<Conversa[]>(sessao.historico), [salvando, setSalvando] = useState(false), [erro, setErro] = useState('')
  const historico = conta.dados?.conversas ?? historicoTemporario
  // o fio: as conversas à vista, em ordem; vazio mostra o guia
  const [fio, setFio] = useState<number[]>(sessao.fio), [novo, setNovo] = useState<number | null>(null)
  const [dark, setDark] = useState(sessao.escuro), [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  // a IA: o serviço local com o Ollama (no site público não há); o comando escolhido no "+" ou com "/"
  const [ia, setIa] = useState<{ cliente: ReturnType<typeof criarClienteOllama>; modelo: string } | null>(null)
  const [comando, setComando] = useState<Comando | null>(null), [menu, setMenu] = useState(false)
  const [andamento, setAndamento] = useState<{ id: number; pergunta: string; progresso: string } | null>(null), [, atualizar] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null), rolagem = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cliente: ReturnType<typeof criarClienteOllama>
    try { cliente = criarClienteOllama(location.origin) } catch { return }
    void cliente.carregar().then((o) => { if (o.estado === 'pronto') setIa({ cliente, modelo: o.modelo }) }, () => undefined)
  }, [])
  useEffect(() => {
    // outra conta (ou sair dela) começa uma conversa limpa
    if (sessao.dono === dono) return
    sessao.dono = dono; resultadosIA.clear(); setFio([]); setQuery(''); setHistoricoTemporario([]); setErro('')
  }, [dono])
  useEffect(() => { sessao.historico = historicoTemporario; sessao.fio = fio; sessao.escuro = dark }, [historicoTemporario, fio, dark])
  const novaConversa = () => { setFio([]); setNovo(null); setQuery(''); setComando(null); setSidebar(false); input.current?.focus() }
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); novaConversa() }
      if (e.key === '/') { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])
  // a caixa de texto cresce com o texto até 160 px; depois rola por dentro
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [query])
  // a pergunta nova sobe para o topo da área de leitura; só a área rola, nunca a página
  useEffect(() => {
    const area = rolagem.current, alvo = novo === null ? null : area?.querySelector<HTMLElement>(`[data-id="${novo}"]`)
    if (!area) return
    if (!alvo) { area.scrollTo({ top: fio.length ? area.scrollHeight : 0 }); return }
    const topo = alvo.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 16
    area.scrollTo({ top: topo, behavior: reduzMovimento() ? 'auto' : 'smooth' })
  }, [novo, fio])
  const turnos = fio.map(id => historico.find(h => h.id === id) ?? (andamento?.id === id ? { id, pergunta: andamento.pergunta, resposta: '' } : undefined)).filter((c): c is Conversa => !!c)
  // "/coma" no começo do texto abre o menu filtrado; escolher tira o "/…" do texto e põe o comando ao lado
  const barra = /^\/(\p{L}*)$/u.exec(query.split(/\s/)[0] ?? '') && !query.includes(' ') ? query.slice(1) : null
  const escolher = (c: Comando) => { setComando(c); setMenu(false); setQuery(q => q.replace(/^\/\p{L}*\s*/u, '')); input.current?.focus() }
  const guardar = async (conversa: Conversa) => {
    if (conta.perfil) await salvarDadosConta(d => ({ ...d, conversas: [conversa, ...d.conversas].slice(0, 50) }))
    else setHistoricoTemporario(h => [conversa, ...h])
  }
  const enviar = async (texto = query) => {
    if (!texto.trim() || salvando) return
    const pedido = lerPedido(texto.normalize('NFC'), comando), id = historico.reduce((m, h) => Math.max(m, h.id), andamento?.id ?? 0) + 1
    if (!pedido.texto) { setComando(pedido.comando); setQuery(''); return }
    const pergunta = `${pedido.automatico ? '' : `/${pedido.comando} `}${pedido.texto}`.slice(0, 2000)
    setSalvando(true); setErro(''); setQuery(''); setComando(null); setMenu(false)
    try {
      if (pedido.comando === 'buscar' || !ia) {
        const resposta = pedido.comando === 'buscar' ? consultarCatalogoLocal(pedido.texto) : 'A IA roda no Cosmos instalado no seu computador (Instalar-Cosmos.cmd, no repositório), com o modelo local e o Z3: o texto não sai do aparelho. Neste endereço ela não está ligada. Aqui funciona o /buscar, nos registros públicos.'
        await guardar({ id, pergunta, resposta: resposta.normalize('NFC') })
        setFio(f => [...f, id]); setNovo(id)
        return
      }
      setAndamento({ id, pergunta, progresso: 'Começando…' }); setFio(f => [...f, id]); setNovo(id)
      let resposta: string
      try {
        const r = await executar(ia.cliente, pedido.comando, pedido.texto, (c) => lerProposta(c, null), (progresso) => setAndamento(a => a && { ...a, progresso }))
        resultadosIA.set(id, r); resposta = resumoEmTexto(r)
      } catch (e) {
        const m = (e as Error).message
        resposta = m === 'limite' ? 'O modelo está ocupado com outra tarefa. Tente de novo em instantes.' : m === 'sem-servico' || m === 'indisponivel' ? 'O serviço local não respondeu. Confira se o Cosmos e o Ollama estão abertos.' : m
      }
      await guardar({ id, pergunta, resposta: resposta.normalize('NFC') })
      atualizar(n => n + 1)
    } catch { setErro('Não foi possível guardar a conversa. Confira a conta e o espaço do cofre (até 50 conversas).') }
    finally { setAndamento(null); setSalvando(false) }
  }
  const lerArquivo = (f: File | undefined) => {
    if (!f) return
    if (f.size > 80_000) { setErro('O arquivo é grande demais: até 20 mil caracteres de texto. De um PDF ou Word, copie e cole o texto.'); return }
    void f.text().then((t) => { setQuery(t.slice(0, 20_000)); setComando('revisar'); input.current?.focus() })
  }
  const exemplo = (c: Comando) => { setComando(c); setQuery(COMANDOS.find(x => x.nome === c)!.exemplo); input.current?.focus() }
  const descricao = comando && COMANDOS.find(c => c.nome === comando)
  return <div className={`product-root iai-app reference-app ${dark ? 'iai-dark' : ''}`}>
    <BarraCosmos atual="i-ai" />
    <div className="iai-body">
      <aside className={`iai-sidebar ${sidebar ? 'is-open' : ''}`}>
        <Button className="iai-new" onClick={novaConversa}><span>＋</span> Nova conversa</Button>
        <nav className="iai-primary-nav" aria-label="Navegação da conversa">
          <button className="active" onClick={() => { setSidebar(false); input.current?.focus() }}><Icone nome="chat" />Conversas</button>
          <a href="#/lab?secao=cadeia"><Icone nome="link" />Minha cadeia</a>
          <a href="#/lab"><Icone nome="tools" />Avançado</a>
          <a href="#/integracoes"><Icone nome="settings" />Configurações</a>
        </nav>
        <div className="iai-history"><p>{historico.length ? 'Histórico' : 'Comece por aqui'}</p>{historico.map(h => <button key={h.id} className={fio.includes(h.id) ? 'active' : ''} onClick={() => { setFio([h.id]); setNovo(h.id); setSidebar(false) }}>{h.pergunta}</button>)}
          {!historico.length && COMANDOS.map(c => <button key={c.nome} onClick={() => { exemplo(c.nome); setSidebar(false) }}>/{c.nome} · {c.titulo}</button>)}
        </div>
        <div className="iai-sidebar-footer"><button onClick={() => setDark(!dark)} aria-label="Alternar tema Cosmos">{dark ? 'Tema claro' : 'Tema escuro'}</button><p className="iai-history-note">{conta.perfil ? 'Conversas guardadas no cofre, cifradas no aparelho' : 'Sem conta: a conversa some ao recarregar. Entre para guardar no cofre.'}</p></div>
      </aside>
      <main className="iai-main"><header className="iai-mobile-header"><button className="iai-mobile-menu" aria-label="Abrir histórico" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}>☰</button><span>Conversa</span><button aria-label="Nova conversa" onClick={novaConversa}>＋</button></header>
        <div className="iai-content has-conversation" ref={rolagem}><article className="iai-conversation" aria-label={turnos.length ? 'Conversa com o Cosmos' : 'Guia da Conversa'} aria-live="polite">
          {turnos.length ? turnos.map(c => <Turno key={c.id} conversa={c} novo={c.id === novo} resultado={resultadosIA.get(c.id)} progresso={andamento?.id === c.id ? andamento.progresso : undefined} />)
            : <section className="iai-turno"><div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong><span className="iai-message-context">{ia ? `IA local · ${ia.modelo}` : 'Guia'}</span></small>
              <p>Escreva um argumento ou cole um plano. O Cosmos traduz para lógica e o Z3 diz o que decorre dos fatos (provado) e o que é salto. O que se avalia é o argumento, não a pessoa. Toque em <b>+</b> ou digite <b>/</b> para escolher o que fazer:</p>
              <div className="iai-guia-comandos">{COMANDOS.map(c => <button key={c.nome} onClick={() => exemplo(c.nome)} disabled={c.ia && !ia}><strong>/{c.nome}</strong> · {c.titulo}<small>{c.descricao}</small></button>)}</div>
              {!ia && <p className="iai-fonte-limite">Neste endereço a IA não está ligada: ela roda no Cosmos instalado no seu computador (Instalar-Cosmos.cmd), e o texto não sai dele. Aqui funciona o /buscar.</p>}
            </div></div></section>}
        </article></div>
        <div className="iai-composer-area">
          {(menu || barra !== null) && <MenuDeComandos filtro={barra ?? ''} ia={!!ia} aoEscolher={escolher} />}
          <form className="iai-composer" onSubmit={e => { e.preventDefault(); void enviar() }}>
            <textarea ref={input} rows={1} aria-label="Escreva para o Cosmos" placeholder={descricao ? descricao.descricao : 'Escreva um argumento, cole um plano ou digite / para os comandos'} value={query} maxLength={20_000} enterKeyHint="send" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (barra !== null) { const c = COMANDOS.find(x => x.nome.startsWith(barra.toLowerCase())); if (c && (!c.ia || ia)) escolher(c.nome); return } void enviar() } }} />
            <div className="iai-composer-barra">
              <button type="button" className="iai-mais" aria-label="Comandos" aria-expanded={menu} onClick={() => setMenu(m => !m)}>+</button>
              <label className="iai-anexo" title="Abrir um arquivo de texto (.txt ou .md) para revisar"><Icone nome="paperclip" /><input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={!ia || salvando} onChange={e => { lerArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
              {comando && <span className="iai-chip">/{comando}<button type="button" aria-label="Tirar o comando" onClick={() => setComando(null)}>×</button></span>}
              <span className="iai-espaco" />
              <Button size="icon" aria-label="Enviar" disabled={!query.trim() || salvando} type="submit"><Icone nome="send" /></Button>
            </div>
          </form>
          <p>{ia ? `IA local (${ia.modelo}) neste computador · o Z3 decide · o texto não sai daqui` : 'IA não ligada neste endereço · /buscar funciona'}</p><NotaLicenca />{erro && <p role="alert">{erro}</p>}</div>
      </main>
    </div>
  </div>
}

function TerminalComercial() {
  const [intervalo, setIntervalo] = useState('1D'), [lado, setLado] = useState<'BUY' | 'SELL'>('BUY'), [valor, setValor] = useState('100'), [ordens, setOrdens] = useState<string[]>([]), [notice, setNotice] = useState('')
  const [tick, setTick] = useState(0), [rodando, setRodando] = useState(false), [aba, setAba] = useState('Overview')
  useEffect(() => { if (!rodando) return; const timer = setInterval(() => setTick(t => t + 1), 4000); return () => clearInterval(timer) }, [rodando])
  const enviar = () => { const q = Number(valor); if (!Number.isFinite(q) || q <= 0 || q > 1000000) { setNotice('Quantidade de demonstração inválida.'); return } setOrdens(o => [`${lado} · ${q.toFixed(2)} COSM · $19.312 · DEMO`, ...o].slice(0, 5)); setNotice('Ordem registrada somente na demonstração desta aba. Nenhum saldo ou ativo foi transferido.') }
  return <div className="product-root exchange-app reference-app" data-view={aba} data-side={lado}><BarraCosmos atual="terminal" /><header className="exchange-top"><a className="exchange-wordmark" href="#/terminal"><MoedaCosmos tamanho={42} /><div>Cosmos<small>Terminal · <b>COSM</b></small></div></a><nav>{['Overview', 'Markets', 'Axiom contracts', 'Portfolio'].map(t => <button key={t} aria-pressed={aba === t} className={aba === t ? 'selected' : ''} onClick={() => setAba(t)}>{t}</button>)}</nav><div className="exchange-connection"><span className="exchange-live-dot" /> LOCAL <small>SIMULAÇÃO LOCAL</small></div></header>
    <div className="exchange-ticker">{[['COSMOS / USD', '19.312', '+12.84%'], ['AXIOM CONTRACTS', '03', 'EXAMPLES'], ['VOL / 24H', '1.24M', '+0.62%'], ['BURN RATE', '5.00%', 'ILLUSTRATIVE'], ['MARKET SESSION', 'LOCAL', 'NO BROADCAST']].map(([n, v, c]) => <div key={n}><span>{n}</span><strong>{v}</strong><small>{c}</small></div>)}<span className="exchange-demo">DEMONSTRAÇÃO · SEM VALOR FINANCEIRO</span></div>
    <main className="exchange-main"><div className="exchange-title"><div><p>AMBIENTE DE DEMONSTRAÇÃO</p><h1>{{Overview: 'Visão geral', Markets: 'Mercados', 'Axiom contracts': 'Contratos de axiomas', Portfolio: 'Portfólio'}[aba]}</h1><p className="exchange-view-description">{{Overview: 'Carteira, referências de mercado e contratos em um resumo local.', Markets: 'Explore preços e o livro de ofertas de demonstração. Nenhum feed externo.', 'Axiom contracts': 'Consulte ofertas de exemplo e abra a simulação de contratos.', Portfolio: 'Saldo do ledger local, recebimento e transferências assinadas de teste.'}[aba]}</p></div><div className="exchange-date">COSMOS [COSM]<small>SEM CONEXÃO EXTERNA</small></div></div>
      <div className="exchange-layout" hidden={aba === 'Portfolio'}><aside className="exchange-left"><section className="exchange-wallet"><div className="exchange-panel-label">Carteira local</div><div className="exchange-wallet-top"><MoedaCosmos tamanho={56} girar inclinar /><div><span>PORTFOLIO DE DEMONSTRAÇÃO</span><h2>12,847<span>.3921</span></h2><p>COSMOS <b>[COSM]</b></p></div></div><div className="wallet-usd">≈ $248,136.92 <span>USD</span><span className="chip-demo" title="Valor de demonstração, sem cotação real">DEMO</span><b>↗ +12.84% <small>24H</small></b></div><div className="wallet-sub"><div><span>AVAILABLE · EXAMPLE</span><strong>9,347.3921 <small>COSM</small></strong></div><div><span>STAKED · EXAMPLE</span><strong>3,500.0000 <small>COSM</small></strong></div></div><div className="wallet-actions"><Button disabled title="Recebimento indisponível na demonstração">Receber</Button><Button disabled variant="outline" title="Envio indisponível na demonstração">Enviar</Button><Button disabled variant="outline" title="Staking indisponível na demonstração">Stake</Button></div><p className="wallet-disabled-note">Operações indisponíveis na demonstração.</p><a className="wallet-local-link" href="#/conta">Conta e carteira local ↗</a></section>
        <section className="exchange-panel market-data"><header><h2>Dados de mercado</h2><span>ILLUSTRATIVE</span></header>{[['Market Cap', '$4.92B'], ['24H Volume', '$312.4M'], ['Circulating Supply', '234.6M COSM'], ['Staking APR', '14.2%']].map(([n, v]) => <div key={n}><span>{n}</span><strong>{v}</strong></div>)}<div className="market-supply-bar"><span /></div><p>Reference market scenario · not a live valuation</p></section>
        <section className="exchange-panel exchange-insight"><span>CONTRATOS DE AXIOMAS</span><h3>Ofertas com evidências</h3><div>φ ⊢ ψ</div><a href="#/lab">Abrir Labs ↗</a></section></aside>
      <section className="exchange-center"><section className="exchange-panel price-chart"><header><div className="price-pair"><MoedaCosmos tamanho={24} inclinar /><h2>COSMOS/USD <small>COSM</small></h2><span>SPOT · DEMO</span></div><span>Dados de referência</span></header><div className="exchange-price"><strong>19.312<span>USD</span></strong><span className="chip-demo" title="Preço simulado, sem feed de mercado">DEMO</span><b>+2.197 (+12.84%)</b><div><span>24H HIGH <strong>19.480</strong></span><span>24H LOW <strong>16.980</strong></span><span>VOL <strong>1.24M</strong></span></div></div><div className="chart-toolbar"><div>{['1H', '1D', '1W'].map(t => <button aria-pressed={intervalo === t} key={t} onClick={() => setIntervalo(t)}>{t}</button>)}<span>│</span><span className="chart-type">Candles</span></div><span>Preços simulados</span></div><GraficoMercado intervalo={intervalo} /></section>
        <section className="exchange-panel axiom-contracts"><header><h2>Axiom contracts <span>03</span></h2><a href="#/hub">Abrir ofertas ↗</a></header><div className="contracts-table"><div className="contracts-head"><span>AXIOM / CONTRACT</span><span>REWARD · TEST</span><span>WINDOW</span><span /></div>{[['φ ⊢ ψ', 'Propositional implication', '80', '14 days'], ['∀x P(x) ⊢ P(a)', 'Universal instantiation', '50', '7 days'], ['√2 × √2 = 2', 'Exact arithmetic', '120', '21 days']].map(([f, n, r, t]) => <div className="contract-row" key={f}><span><strong>{f}</strong><small>{n}</small></span><span>{r} <small>units</small></span><span>{t}</span><a href="#/hub">Inspecionar ↗</a></div>)}</div></section>
        <section className="exchange-panel local-orders"><header><h2>Ordens desta sessão</h2><span>DEMO ONLY</span></header>{ordens.length ? ordens.map((o, i) => <p key={`${i}-${o}`}>{o}</p>) : <p>Nenhuma ordem simulada. Registre uma ordem na área de simulação.</p>}</section></section>
      <aside className="exchange-right"><section className="exchange-panel order-book"><header><h2>Livro de ordens <small>COSMOS/USD</small></h2></header><div className="book-columns"><span>PRICE (USD)</span><span>SIZE (COSM)</span><span>TOTAL</span></div><div className="book-asks">{niveisBookDemo('ask').map(r => <div className="book-row" key={r.ask}><i style={{ width: `${r.depth}%` }} /><span>{r.ask}</span><span>{r.size}</span><span>{r.total}</span></div>)}</div><div className="book-mid"><strong>19.312 <span>↑</span></strong><span>≈ $19.31 · DEMO</span></div><div className="book-bids">{niveisBookDemo('bid').map(r => <div className="book-row" key={r.bid}><i style={{ width: `${r.depth}%` }} /><span>{r.bid}</span><span>{r.size}</span><span>{r.total}</span></div>)}</div></section>
        <section className="exchange-panel recent-trades"><header><h2>Negociações simuladas</h2><button aria-label={rodando ? 'Pausar feed simulado' : 'Retomar feed simulado'} onClick={() => setRodando(!rodando)}>{rodando ? 'Pausar' : 'Iniciar'} simulação</button></header><div className="book-columns"><span>PRICE (USD)</span><span>SIZE</span><span>TICK LOCAL</span></div>{Array.from({ length: 5 }, (_, i) => <div className={`trade-row ${((tick + i) % 3) ? 'buy' : 'sell'}`} key={i}><span>{(19.312 + ((tick + i) % 7 - 3) * .002).toFixed(3)} <small>{(tick + i) % 3 ? 'BUY' : 'SELL'}</small></span><span>{(42.3 + (tick + i) * 17.27 % 900).toFixed(2)}</span><span>#{String(Math.max(0, tick + 5 - i)).padStart(4, '0')}</span></div>)}</section>
        <section className="exchange-panel order-entry"><h2>Simular uma ordem</h2><p className="order-entry-help">Defina o lado e a quantidade. A ordem fica apenas nesta aba.</p><div className="order-side">{(['BUY', 'SELL'] as const).map(t => <button className={lado === t ? 'active' : ''} key={t} onClick={() => setLado(t)}>{t === 'BUY' ? 'Comprar' : 'Vender'}</button>)}</div><label className="order-reference-price">Preço (USD)<Input aria-label="Preço de referência simulado" readOnly value="19.312" /></label><label>Quantidade (COSMOS)<Input aria-label="Quantidade simulada" type="number" min="0.01" max="1000000" value={valor} onChange={e => setValor(e.target.value)} /></label><p>Preço de referência <b>$19.312</b></p><Button aria-label={lado === 'BUY' ? 'Simular compra de COSMOS' : 'Simular venda de COSMOS'} onClick={enviar}>{lado === 'BUY' ? 'Comprar' : 'Vender'} COSMOS</Button></section></aside></div>
      {aba === 'Portfolio' && <div className="local-portfolio"><CarteiraLocal /></div>}
      {notice && <div className="exchange-toast" role="status"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')}>×</button></div>}
    </main><footer className="exchange-footer"><span><i /> NETWORK COSMOS / LOCAL</span><span className="terminal-footer-metrics"><span>VOL 24H <strong>1.24M +0.62%</strong></span><span>BURN RATE <strong>5.00%</strong></span><span>MARKET SESSION <strong>LOCAL · NO BROADCAST</strong></span><span>BLOCK — · GAS — · LATENCY —</span></span><span>NO PUBLIC NETWORK · COSM ≠ ATOM</span><span>ALL MARKET VALUES ARE DEMONSTRATION DATA</span><NotaLicenca /></footer>
  </div>
}

export function ProdutosApp({ rota }: { rota: InterfaceProduto | 'integracoes' }) {
  useEffect(() => { const anterior = document.title; window.scrollTo(0, 0); document.title = rota === 'integracoes' ? 'Cosmos — Integrações' : rota === 'conta' ? 'Cosmos — Conta local' : rota === 'i-ai' ? 'Cosmos — Conversa' : rota === 'lab' ? 'Cosmos — Labs' : 'Cosmos — Terminal'; return () => { document.title = anterior } }, [rota])
  return rota === 'integracoes' ? <Integracoes navigation={null} /> : rota === 'conta' ? <ContaApp navigation={null} /> : rota === 'i-ai' ? <IAI /> : rota === 'lab' ? <Labs navigation={null} /> : <TerminalComercial />
}
