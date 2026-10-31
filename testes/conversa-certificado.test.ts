import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CartaoIA } from '../src/interfaces/ConversaIA'
import type { ResultadoIA } from '../src/interfaces/assistente'

it('certificado ausente fica em detalhes fechados, fora do resumo principal', () => {
  const resultado: ResultadoIA = { tipo: 'argumento', comando: 'verificar', classe: 'segue',
    texto: { premissas: ['A é a.'], conclusao: 'A é a.' },
    proposta: { vocabulario: [{ simbolo: 'A', tipo: 'predicado', aridade: 1, leitura: 'x é a' }, { simbolo: 'c', tipo: 'constante', aridade: 0, leitura: 'C' }], premissas: ['A(c)'], conclusao: 'A(c)', classe: null } }
  const html = renderToStaticMarkup(createElement(CartaoIA, { resultado }))
  const detalhes = [...html.matchAll(/<details([^>]*)>([\s\S]*?)<\/details>/g)]
  const certificado = detalhes.find(d => d[2].includes('Certificado independente:'))
  expect(certificado).toBeDefined()
  expect(certificado![1]).not.toMatch(/\bopen(?:\s|=|$)/)
  expect(html.replace(/<details[^>]*>[\s\S]*?<\/details>/g, '')).not.toContain('Certificado independente:')
})
