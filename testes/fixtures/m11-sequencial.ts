import { ErroGroq } from '../../src/integracoes/provedores/groq'

/** Falha de transporte/cota encerra a fatia, sem retry e sem repassar erro livre. */
export async function medirM11<T extends { id: string }, R>(itens: T[], o: {
  iniciar: (item: T) => void; traduzir: (item: T) => Promise<R>;
  gravar: (item: T, r: R) => void; interromper: (item: T, codigo: string) => void
}) {
  for (const item of itens) {
    o.iniciar(item)
    let r: R
    try { r = await o.traduzir(item) }
    catch (e) {
      const codigo = e instanceof ErroGroq ? e.codigo : 'indisponivel'
      o.interromper(item, codigo)
      throw new Error(`M11 interrompida: ${codigo}; nao repetir a fatia`)
    }
    // Erro ao persistir também encerra; não repete chamada já concluída.
    o.gravar(item, r)
  }
}

/** Entrada pública da M11; sem ler arquivos ou credenciais aqui. */
export function lerItensPublicosM11(texto: string) {
  const itens = texto.split('\n').filter(l => l.trim()).map(l => {
    const linha = JSON.parse(l)
    if (!linha || typeof linha !== 'object' || Array.isArray(linha)) throw new Error('Linha publica invalida')
    // Mesmo desempacotamento do piloto original; metadados nunca vão ao modelo.
    const item = Object.hasOwn(linha, 'item') ? linha.item : linha
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string'
        || !Array.isArray(item.vocabulario) || !item.texto || !Array.isArray(item.texto.premissas)
        || !item.texto.premissas.every((p: unknown) => typeof p === 'string') || typeof item.texto.conclusao !== 'string') throw new Error('Item publico invalido')
    return item as import('../../src/motor/avaliacao').Item
  })
  if (itens.length !== 100 || new Set(itens.map(i => i.id)).size !== 100 || !itens.every(i => /^G-\d+$/.test(i.id))) throw new Error('Conjunto nao e a metade publica G')
  return itens
}

/** Somente formato local, não confirma validade/autorização da chave no provedor. */
export function temFormatoChaveM11(chave: string | undefined) {
  return typeof chave === 'string' && chave.length >= 8 && chave.length <= 512 && !/[^\x21-\x7e]/.test(chave)
}
