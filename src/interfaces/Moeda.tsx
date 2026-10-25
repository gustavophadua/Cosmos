/** @jsxImportSource react */
import { useRef, type CSSProperties, type PointerEvent } from 'react'
import moeda from '../ui/icons/cosmos-moeda-oficial.png'

const FATIAS = 9

/**
 * A moeda oficial em 3D, só com CSS: a mesma imagem nas duas faces, uma borda dourada em fatias e um brilho que passa.
 * `girar` dá uma volta de tempos em tempos; `inclinar` segue o cursor. Com movimento reduzido, a moeda fica parada.
 */
export function MoedaCosmos({ tamanho = 36, girar = false, inclinar = false, className = '' }: { tamanho?: number; girar?: boolean; inclinar?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seguir = inclinar ? (e: PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    ref.current?.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 36}deg`)
    ref.current?.style.setProperty('--rx', `${(.5 - (e.clientY - r.top) / r.height) * 36}deg`)
  } : undefined
  const soltar = inclinar ? () => { ref.current?.style.removeProperty('--rx'); ref.current?.style.removeProperty('--ry') } : undefined
  return <span className={`moeda-3d ${className}`} role="img" aria-label="Moeda oficial COSMOS COSM" data-gira={girar ? '' : undefined}
    style={{ '--t': `${tamanho}px` } as CSSProperties} onPointerMove={seguir} onPointerLeave={soltar}>
    <span className="moeda-inclina" ref={ref}><span className="moeda-corpo">
      {Array.from({ length: FATIAS }, (_, k) => <i key={k} className="moeda-borda" style={{ '--k': k / (FATIAS - 1) } as CSSProperties} />)}
      <img className="moeda-face" src={moeda} alt="" draggable={false} decoding="async" />
      <img className="moeda-face moeda-verso" src={moeda} alt="" draggable={false} decoding="async" />
      <span className="moeda-brilho" />
    </span></span>
  </span>
}
