/** @jsxImportSource react */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icone } from './Janela'
import { modoRemoto } from './modo-remoto'

// "Baixar o app": no computador, o pacote do Cosmos para Windows (o instalador está dentro); no telefone, instalar o
// Cosmos na tela inicial (Android pelo pedido do navegador; iPhone por "Adicionar à Tela de Início", que só a pessoa faz).
export const PACOTE_WINDOWS = 'https://github.com/gustavophadua/Cosmos/archive/refs/heads/main.zip'
export const LEIA_ME = 'https://github.com/gustavophadua/Cosmos#readme'

export type Painel = 'instalado' | 'android-prompt' | 'android-menu' | 'iphone' | 'windows' | 'outro-computador'
/** O que mostrar, pelo aparelho. iPadOS se apresenta como Mac, mas tem toque. */
export function escolherPainel(a: { ua: string; plataforma: string; toques: number; instalado: boolean; temPedido: boolean }): Painel {
  if (a.instalado) return 'instalado'
  const iphone = /iPhone|iPad|iPod/.test(a.ua) || (/Mac/.test(a.plataforma) && a.toques > 1)
  if (iphone) return 'iphone'
  if (/Android/.test(a.ua)) return a.temPedido ? 'android-prompt' : 'android-menu'
  return /Windows/.test(a.ua) ? 'windows' : 'outro-computador'
}

// o pedido de instalação do navegador (Chrome, Edge, Android) chega uma vez, cedo: fica guardado para o botão
interface PedidoInstalacao extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pedido: PedidoInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e as PedidoInstalacao; avisar() })
  window.addEventListener('appinstalled', () => { pedido = null; avisar() })
}
const usePedido = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => pedido)
const instaladoAgora = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export function BaixarApp() {
  const [aberto, setAberto] = useState(false), [aviso, setAviso] = useState('')
  const caixa = useRef<HTMLDivElement>(null), p = usePedido()
  const painel = escolherPainel({ ua: navigator.userAgent, plataforma: navigator.platform ?? '', toques: navigator.maxTouchPoints ?? 0, instalado: instaladoAgora(), temPedido: !!p })
  const telefone = painel === 'iphone' || painel.startsWith('android') || (painel === 'instalado' && navigator.maxTouchPoints > 1)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const instalar = async () => {
    if (!p) return
    await p.prompt()
    const r = await p.userChoice
    pedido = null; avisar()
    setAviso(r.outcome === 'accepted' ? 'Instalado. O Cosmos está na tela inicial.' : 'Instalação cancelada.')
  }
  // fora do modo remoto, a Conversa do telefone não tem a quem perguntar: ela roda no computador da pessoa
  const notaConversa = telefone && !modoRemoto() && <p className="cosmos-baixar-nota">A Conversa roda no seu computador. Para usá-la no telefone, abra o <code>Abrir-Cosmos-Remoto.cmd</code> no computador e instale o app a partir do endereço que ele mostrar.</p>
  return <div className="cosmos-baixar" ref={caixa}>
    <button type="button" className="cosmos-baixar-botao" aria-expanded={aberto} aria-haspopup="dialog" aria-label="Baixar o app" title="Baixar o app" onClick={() => { setAberto(!aberto); setAviso('') }}><Icone nome="download" /><span>Baixar o app</span></button>
    {aberto && <div className="cosmos-baixar-painel" role="dialog" aria-label="Baixar o Cosmos">
      {painel === 'instalado' ? <><h2>O Cosmos já está instalado</h2><p>Você está usando o app. Para atualizar, basta abrir: ele carrega a versão mais nova.</p></>
        : painel === 'android-prompt' ? <><h2>Instalar no telefone</h2><p>O Cosmos vai para a tela inicial e abre como um app, sem a barra do navegador.</p><button type="button" className="cosmos-baixar-acao" onClick={() => void instalar()}>Instalar o app</button>{notaConversa}</>
        : painel === 'android-menu' ? <><h2>Instalar no telefone</h2><ol><li>Toque no menu <strong>⋮</strong> do navegador.</li><li>Escolha <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).</li><li>Confirme. O Cosmos aparece na tela inicial.</li></ol>{notaConversa}</>
        : painel === 'iphone' ? <><h2>Instalar no iPhone</h2><ol><li>Abra esta página no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</li></ol>{notaConversa}</>
        : <><h2>{painel === 'windows' ? 'Cosmos para Windows' : 'Cosmos para computador'}</h2>
          <a className="cosmos-baixar-acao" href={PACOTE_WINDOWS} rel="noopener">Baixar para Windows (.zip)</a>
          <ol><li>Extraia o arquivo .zip.</li><li>Abra o <strong>Instalar-Cosmos.cmd</strong>. Ele instala o Node.js, o Ollama e o modelo, se faltarem (cerca de 2,5 GB), pedindo sua confirmação.</li><li>O atalho <strong>Cosmos</strong> aparece na Área de Trabalho.</li></ol>
          <p className="cosmos-baixar-nota">Para usar também no telefone, abra depois o <code>Abrir-Cosmos-Remoto.cmd</code>.{painel === 'outro-computador' && <> O instalador é para Windows; em Mac ou Linux, veja o <a href={LEIA_ME} target="_blank" rel="noopener">guia</a>.</>}</p>
          {p && <button type="button" className="cosmos-baixar-secundaria" onClick={() => void instalar()}>Ou instalar esta página como app do navegador</button>}</>}
      {aviso && <p className="cosmos-baixar-nota" role="status">{aviso}</p>}
    </div>}
  </div>
}
