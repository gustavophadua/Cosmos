import { describe, expect, it } from 'vitest'
import { escolherPainel } from '../src/interfaces/BaixarApp'

const base = { plataforma: '', toques: 0, instalado: false, temPedido: false }
describe('baixar o app: o painel pelo aparelho', () => {
  it('computador: Windows baixa o pacote; outro sistema também vê o pacote, com o guia', () => {
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0' })).toBe('windows')
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0', plataforma: 'Linux x86_64' })).toBe('outro-computador')
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1', plataforma: 'MacIntel' })).toBe('outro-computador')
  })
  it('telefone: Android com o pedido do navegador instala num toque; sem ele, pelo menu; iPhone e iPad pelo Compartilhar', () => {
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/140.0 Mobile'
    expect(escolherPainel({ ...base, ua: android, toques: 5, temPedido: true })).toBe('android-prompt')
    expect(escolherPainel({ ...base, ua: android, toques: 5 })).toBe('android-menu')
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', toques: 5 })).toBe('iphone')
    // o iPad recente se apresenta como Mac, mas tem toque
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', plataforma: 'MacIntel', toques: 5 })).toBe('iphone')
  })
  it('já instalado: não oferece de novo', () => {
    expect(escolherPainel({ ...base, ua: 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile', instalado: true, temPedido: true })).toBe('instalado')
  })
})
