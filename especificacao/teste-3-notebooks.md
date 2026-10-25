# Roteiro — o teste dos três notebooks (Fase 3 e testes de rede G01–G06)

A Fase 3 fica pronta quando três computadores de verdade trocam as cadeias por arquivo e cada um acusa qualquer
alteração. Este roteiro diz o que fazer em cada um e o que tem de acontecer. A simulação dele, num aparelho só, está em
`testes/rede-g01-g06.test.ts`; ela mostra que o software responde como o roteiro espera, mas não substitui o teste.

## Preparação (em cada computador: A, B e C)

1. Rodar o Cosmos localmente (`npm ci` e `npm run dev`) e abrir **Labs → Minha cadeia** pelo `localhost`.
2. **Criar a chave**, com uma senha de pelo menos 12 caracteres. Guardar o arquivo `cosmos-chave-….json` baixado.
3. Assinar pelo menos um registro (por exemplo, `P(a)` consistente com `∀x (P(x) ⟹ Q(x))`).
4. **Exportar a cadeia** (`cosmos-cadeia-….json`) e levar o arquivo aos outros dois (pendrive, e-mail, o que for).

Anotar, em cada computador, o começo da chave pública (aparece em "Sua chave").

## Os seis testes

Todos em **Conferir uma cadeia recebida**, no computador que recebe.

| Teste | O que fazer | O que tem de acontecer |
| --- | --- | --- |
| G06 · Três notebooks | B e C recebem a cadeia de A; A e C, a de B; A e B, a de C | Cada um: "aceita" e "Cadeia nova para este aparelho" |
| G01 · Fórmula alterada | Abrir a cadeia de A num editor de texto, trocar uma letra dentro de um registro (por exemplo `proposta` → `Proposta`), salvar com outro nome e entregar a B | B: **recusada (C8, elo 0)**: a assinatura não vale |
| G02 · Pedido duplicado | Entregar a B a mesma cadeia de A de novo | B: "Igual à versão que este aparelho já tinha" |
| G04 · Nó desligado | Com C sem receber nada, A assina mais dois registros e exporta; depois entregar a C | C: "Extensão da versão conhecida": nada do que C tinha se perdeu |
| G05 · Bifurcação | Entregar a C a cadeia antiga de A (a do começo, mais curta) | C: **encurtada**: some o que A já tinha publicado. Se A restaurar a chave noutro navegador e assinar outra coisa como primeiro registro, B e C acusam **bifurcada** e guardam as duas versões |
| G03 · Conclusão falsa | A publica na pasta `cadeias/` do repositório um registro "segue" que não segue (com a revelação) | O verificador público lista o registro como "não se sustenta" |

## Registrar o resultado

Para cada teste, anotar o computador, a mensagem que apareceu e o horário. Fotos da tela bastam. Com os seis
resultados esperados, a Fase 3 pode ser dada como pronta e o resumo das três cadeias pode ser carimbado no Bitcoin.

## O que este roteiro não cobre

- **Moeda de teste.** O plano põe uma moeda de teste nos três notebooks antes de qualquer público, sem venda, sem
  promessa de lucro e sem custódia. As regras dela (quanto existe, quem recebe, quando destrava) são decisão do dono
  do projeto e ainda não foram tomadas; nada aqui emite moeda. As regras recomendadas estão em
  `especificacao/moeda-teste.md`.
- **Identidade.** Uma chave não prova quem é a pessoa por trás dela (Fase 6).
