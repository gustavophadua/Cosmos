/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Labs } from './Labs'
import { Integracoes } from './Integracoes'
import { ContaApp, useContaLocal } from './Conta'
import { salvarDadosConta } from '../local/conta'
import type { InterfaceProduto } from './config'
import { Icone } from './Janela'
import { MoedaCosmos } from './Moeda'
import { MoedaTeste } from './MoedaTeste'
import { BarraCosmos, NotaLicenca } from './Navegacao'
import { criarClienteOllama } from './ollama-cliente'
import { lerProposta } from '../motor/formalizacao'
import { COMANDOS, executar, lerPedido, respostaAfirmacao, resumoEmTexto, type Comando, type ResultadoIA } from './assistente'
import { CartaoIA, MenuDeComandos } from './ConversaIA'
import './produtos.css'
import './referencia.css'
import './experiencia.css'

type Conversa = { id: number; pergunta: string; resposta: string }
// Sem conta, a sessão vive no módulo: trocar de tela e voltar não apaga a conversa. Recarregar apaga.
const sessao: { historico: Conversa[]; fio: number[]; fios: number[][]; escuro: boolean; dono: string | undefined } = { historico: [], fio: [], fios: [], escuro: false, dono: undefined }
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// os resultados da IA desta sessão, pelo id da mensagem: o cofre guarda o resumo em texto, e a tela mostra o cartão
const resultadosIA = new Map<number, ResultadoIA>()
// as conversas (fios) da conta: só os números das mensagens, sem conteúdo, neste navegador; o conteúdo fica no cofre
const chaveFios = (dono: string) => `cosmos:conversa:fios:${dono.slice(0, 16)}`
const lerFios = (dono: string): number[][] => { try { const v = JSON.parse(localStorage.getItem(chaveFios(dono)) ?? '[]'); return Array.isArray(v) ? v.filter((f): f is number[] => Array.isArray(f) && f.every(Number.isSafeInteger)).slice(0, 50) : [] } catch { return [] } }
const gravarFios = (dono: string, fios: number[][]) => { try { localStorage.setItem(chaveFios(dono), JSON.stringify(fios.slice(0, 50))) } catch { /* sem armazenamento: as conversas viram uma por mensagem ao recarregar */ } }

function Turno({ conversa, novo, resultado, progresso }: { conversa: Conversa; novo: boolean; resultado?: ResultadoIA; progresso?: string }) {
  return <section className="iai-turno" data-id={conversa.id} data-novo={novo ? '' : undefined}>
    <div className="iai-question">{conversa.pergunta}</div>
    <div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong></small>
      {progresso !== undefined ? <p className="iai-progresso" role="status">{progresso}</p> : resultado ? <CartaoIA resultado={resultado} /> : <p>{conversa.resposta}</p>}</div></div>
  </section>
}

type EstadoIA = { estado: 'conectando' } | { estado: 'fora'; local: boolean } | { estado: 'ligada'; cliente: ReturnType<typeof criarClienteOllama>; modelo: string }
const ENDERECO_LOCAL = 'http://127.0.0.1:4175/cosmos/#/i-ai'

function IAI() {
  const conta = useContaLocal(), dono = conta.perfil?.perfil.pubkey
  const [historicoTemporario, setHistoricoTemporario] = useState<Conversa[]>(sessao.historico), [salvando, setSalvando] = useState(false), [erro, setErro] = useState('')
  const historico = conta.dados?.conversas ?? historicoTemporario
  // o fio: as mensagens da conversa aberta, em ordem; os fios: todas as conversas (a primeira é a mais recente)
  const [fio, setFio] = useState<number[]>(sessao.fio), [fios, setFios] = useState<number[][]>(() => dono ? lerFios(dono) : sessao.fios), [novo, setNovo] = useState<number | null>(null)
  const [dark, setDark] = useState(sessao.escuro), [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  // a IA: o serviço local com o Ollama; enquanto não responde, tenta de novo a cada 8 s (o serviço pode estar subindo)
  const [ia, setIa] = useState<EstadoIA>({ estado: 'conectando' })
  const [comando, setComando] = useState<Comando | null>(null), [menu, setMenu] = useState(false)
  const [andamento, setAndamento] = useState<{ id: number; pergunta: string; progresso: string } | null>(null), [, atualizar] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null), rolagem = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cliente: ReturnType<typeof criarClienteOllama>
    try { cliente = criarClienteOllama(location.origin) } catch { setIa({ estado: 'fora', local: false }); return }
    let parado = false, timer: ReturnType<typeof setTimeout> | undefined
    const tentar = () => void cliente.carregar().then((o) => {
      if (parado) return
      if (o.estado === 'pronto') setIa({ estado: 'ligada', cliente, modelo: o.modelo })
      else { setIa({ estado: 'fora', local: true }); timer = setTimeout(tentar, 8000) }
    }, () => { if (!parado) { setIa({ estado: 'fora', local: true }); timer = setTimeout(tentar, 8000) } })
    tentar()
    return () => { parado = true; clearTimeout(timer) }
  }, [])
  useEffect(() => {
    // outra conta (ou sair dela) começa uma conversa limpa
    if (sessao.dono === dono) return
    sessao.dono = dono; resultadosIA.clear(); setFio([]); setFios(dono ? lerFios(dono) : []); setQuery(''); setHistoricoTemporario([]); setErro('')
  }, [dono])
  useEffect(() => { sessao.historico = historicoTemporario; sessao.fio = fio; sessao.escuro = dark; if (!dono) sessao.fios = fios; else gravarFios(dono, fios) }, [historicoTemporario, fio, fios, dark, dono])
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
  // as conversas na lateral: os fios conhecidos e, para mensagens antigas sem fio, uma conversa cada
  const noFio = new Set(fios.flat())
  const conversas = [...fios.filter(f => f.some(id => historico.some(h => h.id === id))), ...historico.filter(h => !noFio.has(h.id)).map(h => [h.id])]
  const tituloDe = (f: number[]) => historico.find(h => h.id === f[0])?.pergunta ?? 'Conversa'
  // "/coma" no começo do texto abre o menu filtrado; escolher tira o "/…" do texto e põe o comando ao lado
  const barra = /^\/\p{L}*$/u.test(query) ? query.slice(1) : null
  const escolher = (c: Comando) => { setComando(c); setMenu(false); setQuery(q => q.replace(/^\/\p{L}*\s*/u, '')); input.current?.focus() }
  const guardar = async (conversa: Conversa) => {
    if (conta.perfil) await salvarDadosConta(d => ({ ...d, conversas: [conversa, ...d.conversas].slice(0, 50) }))
    else setHistoricoTemporario(h => [conversa, ...h])
  }
  const abrirMensagem = (id: number) => {
    const doFio = fio.length && fios.some(f => f.includes(fio[0]))
    const novoFio = [...fio, id]
    setFio(novoFio); setNovo(id)
    setFios(fs => doFio ? fs.map(f => (f.includes(fio[0]) ? novoFio : f)) : [novoFio, ...fs])
  }
  const enviar = async (texto = query) => {
    if (!texto.trim() || salvando) return
    const pedido = lerPedido(texto.normalize('NFC'), comando), id = historico.reduce((m, h) => Math.max(m, h.id), andamento?.id ?? 0) + 1
    if (!pedido.texto) { if (pedido.comando !== 'afirmacao') setComando(pedido.comando); setQuery(''); return }
    const pergunta = `${pedido.automatico ? '' : `/${pedido.comando} `}${pedido.texto}`.slice(0, 2000)
    setSalvando(true); setErro(''); setQuery(''); setComando(null); setMenu(false)
    try {
      if (pedido.comando === 'afirmacao' || ia.estado !== 'ligada') {
        const resposta = pedido.comando === 'afirmacao' ? respostaAfirmacao(pedido.texto)
          : ia.estado === 'conectando' ? 'A IA ainda está conectando. Tente de novo em alguns segundos.'
          : ia.estado === 'fora' && ia.local ? 'O serviço local não respondeu. Abra o Ollama e o atalho "Cosmos" (ou rode Abrir-Cosmos-IA.cmd); esta página tenta de novo sozinha a cada poucos segundos.'
          : `Neste endereço a IA não roda: ela fica no seu computador, com o modelo local e o Z3, e o texto não sai dele. Instale com o Instalar-Cosmos.cmd e abra ${ENDERECO_LOCAL}.`
        await guardar({ id, pergunta, resposta: resposta.normalize('NFC') })
        abrirMensagem(id)
        return
      }
      setAndamento({ id, pergunta, progresso: 'Começando…' }); abrirMensagem(id)
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
    } catch { setErro('Não foi possível guardar a conversa. Confira a conta e o espaço do cofre (até 50 mensagens).') }
    finally { setAndamento(null); setSalvando(false) }
  }
  const lerArquivo = (f: File | undefined) => {
    if (!f) return
    if (f.size > 80_000) { setErro('O arquivo é grande demais: até 20 mil caracteres de texto. De um PDF ou Word, copie e cole o texto.'); return }
    void f.text().then((t) => { setQuery(t.slice(0, 20_000)); setComando('revisar'); input.current?.focus() })
  }
  const exemplo = (c: Comando) => { setComando(c); setQuery(COMANDOS.find(x => x.nome === c)!.exemplo); input.current?.focus() }
  const descricao = comando && COMANDOS.find(c => c.nome === comando)
  const ligada = ia.estado === 'ligada'
  return <div className={`product-root iai-app reference-app iai-v2 ${dark ? 'iai-dark' : ''}`}>
    <BarraCosmos atual="i-ai" />
    <div className="iai-body">
      <aside className={`iai-sidebar ${sidebar ? 'is-open' : ''}`}>
        <Button className="iai-new" onClick={novaConversa}><span>＋</span> Nova conversa</Button>
        <div className="iai-history"><p>{conversas.length ? 'Conversas' : 'Nenhuma conversa ainda'}</p>
          {conversas.map(f => <button key={f[0]} className={fio[0] === f[0] ? 'active' : ''} onClick={() => { setFio(f); setNovo(f.at(-1)!); setSidebar(false) }}>{tituloDe(f)}</button>)}
        </div>
        <div className="iai-sidebar-footer"><p className="iai-history-note">{conta.perfil ? 'Guardadas no cofre, cifradas neste aparelho.' : 'Sem conta, as conversas somem ao recarregar. Entre para guardar no cofre.'}</p><button onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? 'Tema claro' : 'Tema escuro'}</button></div>
      </aside>
      <main className="iai-main"><header className="iai-mobile-header"><button className="iai-mobile-menu" aria-label="Abrir conversas" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}>☰</button><span>Conversa</span><button aria-label="Nova conversa" onClick={novaConversa}>＋</button></header>
        <div className={`iai-content ${turnos.length ? 'has-conversation' : ''}`} ref={rolagem}>
          {turnos.length ? <article className="iai-conversation" aria-label="Conversa com o Cosmos" aria-live="polite">
            {turnos.map(c => <Turno key={c.id} conversa={c} novo={c.id === novo} resultado={resultadosIA.get(c.id)} progresso={andamento?.id === c.id ? andamento.progresso : undefined} />)}
          </article> : <section className="iai-welcome">
            <h1>O que você quer verificar?</h1>
            <p>Escreva um raciocínio ou cole um plano. O Cosmos traduz para lógica e o Z3 separa o que decorre dos fatos do que é salto.</p>
            <div className="iai-suggestions">{COMANDOS.map(c => <button key={c.nome} onClick={() => exemplo(c.nome)}><span aria-hidden="true">/</span><strong>{c.titulo}</strong><small>{c.descricao}</small></button>)}</div>
          </section>}
        </div>
        <div className="iai-composer-area">
          {(menu || barra !== null) && <MenuDeComandos filtro={barra ?? ''} ia={ligada} aoEscolher={escolher} />}
          <form className="iai-composer" onSubmit={e => { e.preventDefault(); void enviar() }}>
            <textarea ref={input} rows={1} aria-label="Escreva para o Cosmos" autoComplete="off" placeholder={descricao ? descricao.descricao : 'Escreva um raciocínio ou cole um plano (/ para os comandos)'} value={query} maxLength={20_000} enterKeyHint="send" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (barra !== null) { const c = COMANDOS.find(x => x.nome.startsWith(barra.toLowerCase())); if (c) escolher(c.nome); return } void enviar() } }} />
            <div className="iai-composer-barra">
              <button type="button" className="iai-mais" aria-label="Comandos" aria-expanded={menu} onClick={() => setMenu(m => !m)}>+</button>
              <label className="iai-anexo" title="Abrir um arquivo de texto (.txt ou .md) para revisar"><Icone nome="paperclip" /><input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={salvando} onChange={e => { lerArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
              {comando && <span className="iai-chip">/{comando}<button type="button" aria-label="Tirar o comando" onClick={() => setComando(null)}>×</button></span>}
              <span className="iai-espaco" />
              <Button size="icon" aria-label="Enviar" disabled={!query.trim() || salvando} type="submit"><Icone nome="send" /></Button>
            </div>
          </form>
          <p className="iai-estado" data-estado={ia.estado}>{ia.estado === 'ligada' ? `IA local ligada (${ia.modelo}) · o Z3 decide · o texto não sai deste computador`
            : ia.estado === 'conectando' ? 'Conectando à IA local…'
            : ia.local ? 'IA local desligada: abra o Ollama e o atalho "Cosmos". Tentando de novo…'
            : <>A IA roda no Cosmos instalado no seu computador: <a href={ENDERECO_LOCAL}>abrir o Cosmos local</a></>}</p>
          {erro && <p role="alert">{erro}</p>}</div>
      </main>
    </div>
  </div>
}

/**
 * O Terminal: a rede de teste cosmos-teste-1 de verdade (saldos, transferências assinadas, livros recebidos e a conta
 * da rede), sem preço nem mercado inventados. A moeda Cosmos está em fase de lançamento e ainda não existe; as regras da
 * rede de teste (especificacao/moeda-teste.md) pedem que a tela diga que as unidades de teste não viram moeda real.
 */
function TerminalComercial() {
  return <div className="product-root labs-app reference-app terminal-rede"><BarraCosmos atual="terminal" />
    <main className="labs-main">
      <header className="labs-topbar"><div>Cosmos <span>/</span> Avançado <span>/</span> <strong>Terminal</strong></div><span className="labs-local"><i /> Rede de teste cosmos-teste-1</span></header>
      <section className="labs-page-heading"><div><p className="labs-eyebrow">TERMINAL · REDE DE TESTE</p><h1>Terminal</h1><p>Saldos, transferências assinadas e livros da rede de teste cosmos-teste-1, conferidos neste aparelho. Nada aqui é simulado.</p></div><MoedaCosmos tamanho={56} /></section>
      <div className="labs-result has-conflict" role="note"><strong>A moeda Cosmos está em fase de lançamento.</strong><p>Ela ainda não existe: não tem preço, não está à venda e não se compra nem se troca em lugar nenhum. O que funciona aqui é a rede de teste cosmos-teste-1, com unidades de teste sem valor, só entre os participantes convidados. As unidades de teste não viram moeda Cosmos e não dão direito a nada no futuro.</p></div>
      <MoedaTeste />
      <NotaLicenca />
    </main>
  </div>
}

export function ProdutosApp({ rota }: { rota: InterfaceProduto | 'integracoes' }) {
  useEffect(() => { const anterior = document.title; window.scrollTo(0, 0); document.title = rota === 'integracoes' ? 'Cosmos — Integrações' : rota === 'conta' ? 'Cosmos — Conta local' : rota === 'i-ai' ? 'Cosmos — Conversa' : rota === 'lab' ? 'Cosmos — Labs' : 'Cosmos — Terminal'; return () => { document.title = anterior } }, [rota])
  return rota === 'integracoes' ? <Integracoes navigation={null} /> : rota === 'conta' ? <ContaApp navigation={null} /> : rota === 'i-ai' ? <IAI /> : rota === 'lab' ? <Labs navigation={null} /> : <TerminalComercial />
}
