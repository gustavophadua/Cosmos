/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { historicoDemo, PASSO_CANDLE_MS, type Candle } from './dados'

// a área do gráfico: os preços ficam numa coluna à direita, o tempo embaixo e o volume logo acima do tempo
const M = { esq: 6, dir: 66, topo: 12, tempo: 24, volume: 44 }
const VISIVEIS = 64, MENOS = 16, MAIS = 200
const COR = { alta: '#8aaeff', baixa: '#d1d9e6', grade: '#ffffff0d', texto: '#a6afbd', fundo: '#101318', mira: '#c9d1df' }
const dois = (n: number) => String(n).padStart(2, '0')
function hora(t: number, intervalo: string) {
  const d = new Date(t)
  return intervalo === '1W' ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}h` : `${dois(d.getHours())}:${dois(d.getMinutes())}`
}
const prender = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Candles de demonstração, sem feed de mercado. Navegação de verdade: arrastar (mouse ou dedo) volta no tempo, pinça ou
 * Ctrl + roda aproxima, o teclado também funciona, e a linha em cruz mostra o candle sob o cursor ou o toque.
 */
export function GraficoMercado({ intervalo }: { intervalo: string }) {
  const dados = useMemo(() => historicoDemo(intervalo), [intervalo])
  const passo = PASSO_CANDLE_MS[intervalo] ?? PASSO_CANDLE_MS['1D']
  // o horário do último candle: o passo atual, arredondado para baixo
  const ultimoT = useMemo(() => Math.floor(Date.now() / passo) * passo, [passo])
  const tempo = (i: number) => ultimoT - (dados.length - 1 - i) * passo
  const ref = useRef<HTMLCanvasElement>(null)
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 })
  // a janela visível: `fim` é o índice depois do último candle à mostra
  const [janela, setJanela] = useState({ fim: dados.length, quantidade: VISIVEIS })
  const [mira, setMira] = useState<{ i: number; y: number } | null>(null)
  useEffect(() => { setJanela({ fim: dados.length, quantidade: VISIVEIS }); setMira(null) }, [dados])
  const mover = (fim: number, quantidade = janela.quantidade) => {
    const q = prender(Math.round(quantidade), MENOS, Math.min(MAIS, dados.length))
    setJanela({ quantidade: q, fim: prender(Math.round(fim), q, dados.length) })
  }
  const inicio = janela.fim - janela.quantidade
  const visiveis = dados.slice(inicio, janela.fim)
  const largura = Math.max(1, tamanho.w - M.esq - M.dir), passoX = largura / janela.quantidade
  const baseVolume = tamanho.h - M.tempo, basePreco = baseVolume - M.volume - 6
  const min = Math.min(...visiveis.map(c => c.low)), max = Math.max(...visiveis.map(c => c.high)), folga = (max - min) * .08 || .1
  const lo = min - folga, hi = max + folga
  const yDe = (v: number) => M.topo + (hi - v) / (hi - lo) * (basePreco - M.topo)
  const precoDe = (y: number) => hi - (y - M.topo) / (basePreco - M.topo) * (hi - lo)
  const xDe = (k: number) => M.esq + (k + .5) * passoX

  useEffect(() => {
    const canvas = ref.current!
    const medir = () => { const r = canvas.getBoundingClientRect(); setTamanho(t => (t.w === r.width && t.h === r.height ? t : { w: r.width, h: r.height })) }
    const o = new ResizeObserver(medir); o.observe(canvas); medir()
    let ativo = true
    void document.fonts.load('12px "JetBrains Mono"').then(() => { if (ativo) setTamanho(t => ({ ...t })) }).catch(() => { /* fica a fonte monoespaçada do sistema */ })
    return () => { ativo = false; o.disconnect() }
  }, [])

  useEffect(() => {
    const canvas = ref.current!, { w, h } = tamanho
    if (!w || !h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    const c = canvas.getContext('2d')!
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = '11px "JetBrains Mono", monospace'; c.textBaseline = 'middle'
    const ultimo = dados[dados.length - 1], yUltimo = yDe(ultimo.close)
    // na faixa do volume, a mira fica só com a linha vertical
    const yMira = mira && mira.y >= M.topo && mira.y <= basePreco ? mira.y : null
    // a grade e os preços, sem escrever um rótulo embaixo da etiqueta do preço atual ou da mira
    for (let k = 0; k <= 5; k++) {
      const y = M.topo + k * (basePreco - M.topo) / 5
      c.strokeStyle = COR.grade; c.lineWidth = 1; c.beginPath(); c.moveTo(M.esq, Math.round(y) + .5); c.lineTo(w - M.dir, Math.round(y) + .5); c.stroke()
      const livre = Math.abs(y - yUltimo) > 13 && (yMira === null || Math.abs(y - yMira) > 13)
      if (livre) { c.fillStyle = COR.texto; c.fillText(precoDe(y).toFixed(3), w - M.dir + 8, y) }
    }
    // o tempo: um rótulo a cada ~90 px, nos candles de horário "redondo"
    const cada = Math.max(1, Math.ceil(90 / passoX))
    c.textAlign = 'center'
    for (let k = 0; k < visiveis.length; k++) {
      if ((inicio + k) % cada) continue
      const x = Math.round(xDe(k)) + .5
      c.strokeStyle = COR.grade; c.beginPath(); c.moveTo(x, M.topo); c.lineTo(x, baseVolume); c.stroke()
      const sobMira = mira !== null && Math.abs(x - xDe(mira.i - inicio)) < 52
      if (x > M.esq + 24 && x < w - M.dir - 24 && !sobMira) { c.fillStyle = COR.texto; c.fillText(hora(tempo(inicio + k), intervalo), x, h - M.tempo / 2) }
    }
    c.textAlign = 'left'
    // os candles e o volume
    const maxVol = Math.max(...visiveis.map(v => v.volume))
    visiveis.forEach((v, k) => {
      const alta = v.close >= v.open, x = xDe(k), corpo = Math.max(1, passoX * .62), centro = Math.round(x) + .5
      c.strokeStyle = alta ? COR.alta : COR.baixa; c.fillStyle = c.strokeStyle; c.lineWidth = 1
      c.beginPath(); c.moveTo(centro, Math.round(yDe(v.high))); c.lineTo(centro, Math.round(yDe(v.low))); c.stroke()
      const topo = Math.round(Math.min(yDe(v.open), yDe(v.close)))
      c.fillRect(Math.round(x - corpo / 2), topo, Math.max(1, Math.round(corpo)), Math.max(1, Math.round(Math.abs(yDe(v.open) - yDe(v.close)))))
      const hv = v.volume / maxVol * M.volume
      c.fillStyle = alta ? '#8aaeff38' : '#a6afbd26'; c.fillRect(Math.round(x - corpo / 2), baseVolume - hv, Math.max(1, Math.round(corpo)), hv)
    })
    // o preço atual: linha tracejada e etiqueta, quando ele cabe na escala visível
    if (yUltimo >= M.topo && yUltimo <= basePreco) {
      c.setLineDash([4, 4]); c.strokeStyle = '#8aaeffb3'; c.beginPath(); c.moveTo(M.esq, Math.round(yUltimo) + .5); c.lineTo(w - M.dir, Math.round(yUltimo) + .5); c.stroke(); c.setLineDash([])
      c.fillStyle = COR.alta; c.fillRect(w - M.dir + 2, yUltimo - 10, M.dir - 4, 20); c.fillStyle = '#111318'; c.fillText(ultimo.close.toFixed(3), w - M.dir + 8, yUltimo)
    }
    // a mira: as duas linhas, o preço sob o cursor e o horário do candle
    if (mira) {
      const k = mira.i - inicio, x = Math.round(xDe(k)) + .5
      c.setLineDash([3, 3]); c.strokeStyle = '#c9d1df80'
      c.beginPath(); c.moveTo(x, M.topo); c.lineTo(x, baseVolume); c.stroke()
      if (yMira !== null) { c.beginPath(); c.moveTo(M.esq, Math.round(yMira) + .5); c.lineTo(w - M.dir, Math.round(yMira) + .5); c.stroke() }
      c.setLineDash([])
      if (yMira !== null) { c.fillStyle = '#2a313c'; c.fillRect(w - M.dir + 2, yMira - 10, M.dir - 4, 20); c.fillStyle = '#f1f3f7'; c.fillText(precoDe(yMira).toFixed(3), w - M.dir + 8, yMira) }
      const rotulo = hora(tempo(mira.i), intervalo), lw = c.measureText(rotulo).width + 14, lx = prender(x - lw / 2, M.esq, w - M.dir - lw)
      c.fillStyle = '#2a313c'; c.fillRect(lx, h - M.tempo + 2, lw, M.tempo - 4); c.fillStyle = '#f1f3f7'; c.textAlign = 'center'; c.fillText(rotulo, lx + lw / 2, h - M.tempo / 2); c.textAlign = 'left'
    }
  })

  // os gestos: um ponteiro arrasta; dois fazem pinça
  const toques = useRef(new Map<number, number>())
  const arrasto = useRef<{ x: number; fim: number; moveu: boolean } | null>(null)
  const pinca = useRef<{ dist: number; quantidade: number } | null>(null)
  const candleEm = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const k = prender(Math.floor((clientX - r.left - M.esq) / passoX), 0, visiveis.length - 1)
    return { i: inicio + k, y: clientY - r.top }
  }
  useEffect(() => {
    // roda: Ctrl (ou a pinça do touchpad) aproxima; o movimento lateral passa o tempo; a roda comum rola a página
    const canvas = ref.current!
    const roda = (e: WheelEvent) => {
      if (e.ctrlKey) { e.preventDefault(); mover(janela.fim, janela.quantidade * (e.deltaY > 0 ? 1.12 : 1 / 1.12)) }
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); mover(janela.fim + Math.sign(e.deltaX || e.deltaY) * Math.max(1, janela.quantidade / 20)) }
    }
    canvas.addEventListener('wheel', roda, { passive: false })
    return () => canvas.removeEventListener('wheel', roda)
  })
  const ativo = mira ? dados[mira.i] : visiveis[visiveis.length - 1]
  const anterior = mira ? dados[mira.i - 1] : visiveis[visiveis.length - 2]
  const variacao = anterior ? (ativo.close - anterior.close) / anterior.close * 100 : 0
  const noFim = janela.fim === dados.length
  const toque = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, [])
  const legenda = (c: Candle) => `O ${c.open.toFixed(3)}  H ${c.high.toFixed(3)}  L ${c.low.toFixed(3)}  C ${c.close.toFixed(3)}`

  return <div className="market-canvas-wrap">
    <div className="chart-legend" aria-hidden="true"><span>{hora(tempo(mira ? mira.i : janela.fim - 1), intervalo)}</span><span>{legenda(ativo)}</span><b data-alta={variacao >= 0}>{variacao >= 0 ? '+' : ''}{variacao.toFixed(2)}%</b><small>VOL {ativo.volume}</small></div>
    <canvas ref={ref} tabIndex={0} role="img" data-arrastando={arrasto.current?.moveu ? '' : undefined}
      aria-label={`Candles COSMOS/USD de demonstração, ${intervalo}. Use as setas para voltar no tempo e + ou − para aproximar.`}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId); toques.current.set(e.pointerId, e.clientX)
        if (toques.current.size === 2) { const [a, b] = [...toques.current.values()]; pinca.current = { dist: Math.abs(a - b) || 1, quantidade: janela.quantidade }; arrasto.current = null }
        else arrasto.current = { x: e.clientX, fim: janela.fim, moveu: false }
      }}
      onPointerMove={e => {
        if (toques.current.has(e.pointerId)) toques.current.set(e.pointerId, e.clientX)
        if (pinca.current && toques.current.size === 2) { const [a, b] = [...toques.current.values()]; mover(janela.fim, pinca.current.quantidade * pinca.current.dist / Math.max(1, Math.abs(a - b))); return }
        const a = arrasto.current
        if (a && (e.buttons || e.pointerType !== 'mouse')) {
          const dx = e.clientX - a.x
          if (Math.abs(dx) > 4) a.moveu = true
          if (a.moveu) { mover(a.fim - dx / passoX); setMira(null); return }
        }
        if (e.pointerType === 'mouse' && !e.buttons) setMira(candleEm(e.clientX, e.clientY))
      }}
      onPointerUp={e => {
        toques.current.delete(e.pointerId); if (toques.current.size < 2) pinca.current = null
        // um toque sem arrastar lê o candle; outro toque no mesmo lugar esconde a mira
        if (arrasto.current && !arrasto.current.moveu) { const alvo = candleEm(e.clientX, e.clientY); setMira(m => (m && m.i === alvo.i && e.pointerType !== 'mouse' ? null : alvo)) }
        arrasto.current = null
      }}
      onPointerCancel={e => { toques.current.delete(e.pointerId); arrasto.current = null; pinca.current = null }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setMira(null) }}
      onKeyDown={e => {
        const passoTeclado = e.shiftKey ? 10 : 1
        const acoes: Record<string, () => void> = {
          ArrowLeft: () => mover(janela.fim - passoTeclado), ArrowRight: () => mover(janela.fim + passoTeclado),
          '+': () => mover(janela.fim, janela.quantidade / 1.25), '=': () => mover(janela.fim, janela.quantidade / 1.25), '-': () => mover(janela.fim, janela.quantidade * 1.25),
          Home: () => mover(janela.quantidade), End: () => mover(dados.length), Escape: () => setMira(null),
        }
        if (acoes[e.key]) { e.preventDefault(); acoes[e.key]() }
      }} />
    <div className="chart-controls">
      <p className="chart-readout" aria-live="polite">{mira ? `Candle de ${hora(tempo(mira.i), intervalo)} · ${legenda(ativo)} · demonstração` : `${hora(tempo(inicio), intervalo)} – ${hora(tempo(janela.fim - 1), intervalo)} · arraste para voltar no tempo · ${toque ? 'pinça' : 'Ctrl + roda'} para aproximar`}</p>
      <div role="group" aria-label="Navegar no gráfico">
        <button type="button" aria-label="Voltar no tempo" disabled={inicio === 0} onClick={() => mover(janela.fim - janela.quantidade / 2)}>‹</button>
        <button type="button" aria-label="Avançar no tempo" disabled={noFim} onClick={() => mover(janela.fim + janela.quantidade / 2)}>›</button>
        <button type="button" aria-label="Afastar" disabled={janela.quantidade >= Math.min(MAIS, dados.length)} onClick={() => mover(janela.fim, janela.quantidade * 1.25)}>−</button>
        <button type="button" aria-label="Aproximar" disabled={janela.quantidade <= MENOS} onClick={() => mover(janela.fim, janela.quantidade / 1.25)}>+</button>
        <button type="button" className="chart-now" disabled={noFim && janela.quantidade === VISIVEIS} onClick={() => { mover(dados.length, VISIVEIS); setMira(null) }}>Agora</button>
      </div>
    </div>
  </div>
}

export function GraficoConvergencia() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const draw = () => {
      const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1
      canvas.width = r.width * d; canvas.height = r.height * d
      const c = canvas.getContext('2d')!; c.scale(d, d); const w = r.width, h = r.height
      c.strokeStyle = '#ffffff12'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 10 + i * (h - 26) / 3); c.lineTo(w, 10 + i * (h - 26) / 3); c.stroke() }
      c.beginPath(); for (let i = 0; i < 90; i++) { const x = i / 89 * w, y = h - 16 - (Math.exp(-i / 19) * .85 + .06 + Math.sin(i * 1.7) * .017) * (h - 20); if (!i) c.moveTo(x, y); else c.lineTo(x, y) }
      c.strokeStyle = '#8aaeff'; c.lineWidth = 2; c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = '#8aaeff0d'; c.fill()
    }
    const o = new ResizeObserver(draw); o.observe(canvas); draw(); return () => o.disconnect()
  }, [])
  return <canvas ref={ref} className="loss-canvas" aria-label="Curva de loss ilustrativa, não uma execução do motor" />
}
