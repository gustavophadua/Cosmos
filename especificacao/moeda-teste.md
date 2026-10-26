# Moeda de teste — regras recomendadas e decididas

Este documento reúne o que é recomendado para a moeda de teste do Cosmos, a partir do plano do estudo I-AI, do que a
rede local de teste já faz (`src/v4/localnet.ts`) e de fontes públicas sobre testnets e sobre a regulação no Brasil.
**Não é parecer jurídico.** O dono do projeto aceitou as recomendações em 25/10/2026 (seção Decisão); nada aqui emite moeda por si só.

## O que já existe

- Rede local simulada (`cosmos-localnet-simulada-v4`), só no `localhost`, com a unidade `UNIDADE-TESTE-SEM-VALOR`.
- Emissão só no gênese de uma simulação nova: 1.000.000 unidades por padrão (no máximo 1 bilhão), sem nova emissão
  depois; queima de 5% (500 pontos-base) nas operações; carteira de teste secp256k1 e livro-razão assinado.
- O plano do estudo: moeda de teste nos três notebooks antes de qualquer público, **sem venda, sem promessa de lucro,
  sem custódia, moedas presas por 30 dias**; emissão com um teto igual por pessoa, mais o pagamento de quem pede um
  certificado; no pior caso, k pessoas em conluio emitem k vezes o teto.

## Regras recomendadas

1. **Nome que não engana.** A unidade de teste não se chama COSM nem COSMOS: continua `UNIDADE-TESTE-SEM-VALOR` (na
   tela, "unidade de teste"). Toda tela que mostra saldo diz "sem valor".
2. **Sem valor e sem troca.** As unidades não se vendem, não se compram e não se trocam por dinheiro, por outra moeda
   ou por qualquer bem. Não representam participação, direito, dívida nem promessa. É o padrão das testnets públicas
   (Avalanche, Cardano, os faucets da Paxos e da First Digital), que dizem isso nos termos.
3. **Sem promessa de futuro.** Saldos de teste **não** viram moeda real, não dão direito a "airdrop" e não contam para
   nada depois. Isso tem de estar escrito antes do primeiro uso. É o ponto mais importante: no Parecer de Orientação
   40 da CVM, a expectativa de benefício econômico é um dos critérios de um contrato de investimento coletivo (valor
   mobiliário).
4. **Sem captação de público.** Só participantes convidados: primeiro os três notebooks (o próprio dono), depois um
   grupo pequeno e conhecido. Nada de oferta aberta; captar recursos junto ao público é outro critério do mesmo
   parecer.
5. **Sem custódia.** Cada pessoa tem a própria chave; o projeto não guarda saldo nem chave de ninguém. Custódia e
   intermediação de ativos virtuais são serviços que, desde as Resoluções BCB 519, 520 e 521 (em vigor desde 2 de
   fevereiro de 2026), exigem autorização do Banco Central.
6. **Emissão ligada ao que o Cosmos mede.** A mecânica a testar é a do estudo:
   - gênese pequeno e fixo (ou zero), sem nova emissão fora das regras;
   - unidades só por **registro aceito pelo verificador público** (certificado conferido de forma independente),
     nunca por registro fechado ou pendente;
   - um **teto igual por chave e por período** (proposta: 100 unidades por chave por semana), para limitar o conluio;
   - quem pede um certificado paga em unidades de teste; queima de 5% em cada pagamento;
   - unidades recebidas ficam **presas por 30 dias** antes de poder ser transferidas.
7. **Prazo e reinício.** A rede de teste tem versão e prazo (proposta: 90 dias) e pode ser zerada a qualquer momento;
   os participantes sabem disso antes.
8. **Tudo conferível.** Cada emissão, transferência e queima vai assinada no livro-razão, e o verificador público confere
   o total (gênese + emitido − queimado = soma dos saldos).
9. **Identidade em aberto.** "Uma pessoa, uma conta" ainda não está resolvido (Fase 6). Enquanto isso, o teto por chave só
   vale entre participantes conhecidos.
10. **Antes de qualquer moeda real**, um parecer jurídico (CVM, Banco Central e tributário). Emitir para o público com
    expectativa de valor, ou oferecer troca ou custódia, muda a natureza do projeto.

## Decisão (25/10/2026)

O dono do projeto ficou com as regras recomendadas acima e com estes valores para a primeira rede de teste
(`cosmos-teste-1`). Elas valem para os três notebooks; mudar qualquer uma é uma versão nova da rede de teste.

| Ponto | Valor decidido |
| --- | --- |
| Unidade | `UNIDADE-TESTE-SEM-VALOR` ("unidade de teste"), sem valor, sem venda, sem troca |
| Gênese | 100 unidades de teste por participante, para testar pagamentos desde o início |
| Recompensa por registro aceito pelo verificador público | 10 unidades |
| Teto por chave | 100 unidades por semana |
| Pagamento por pedido de certificado | em unidades de teste, com queima de 5% |
| Trava | 30 dias antes de transferir o que foi recebido |
| Prazo da rede de teste | 90 dias; depois é zerada, sem migrar saldo |
| Participantes | os três notebooks (o próprio dono); depois, convidados nominais |
| Promessa | nenhuma: saldo de teste não vira moeda real nem dá direito a nada |

## Implementação da cosmos-teste-1 (26/10/2026)

A simulação da v4 continua como estava; a rede decidida acima é outra peça, ligada à cadeia pessoal.

- **Gênese:** `redes/cosmos-teste-1/genese.json`, com os valores da tabela e as chaves dos três notebooks do teste da
  Fase 3 (A `c39ce485…`, B `d84233c1…`, C `36fe5abf…`). Início em 26/10/2026; o último dia é 23/01/2027 (90 dias). O
  identificador da rede é o SHA-256 do texto da gênese (`textoDaGenese` em `src/motor/moedaTeste.ts`), que vai em toda
  operação: uma operação de outra rede não vale nesta.
- **Unidades:** inteiros em centésimos de unidade de teste (100 unidades = 10000). A queima é 5% arredondado para baixo.
- **Livro:** cada participante tem um livro com a estrutura da cadeia-v1 (elos com índice, anterior, texto e
  assinatura; a mesma conferência C1–C8), assinado pela mesma chave Ed25519 da cadeia pessoal, mas com o formato
  `livro-cosmos-teste-1` na primeira linha do texto assinado: uma assinatura de livro não vale numa cadeia-v1, nem o
  contrário. Cada elo é uma operação `operacao-teste-v1`: transferir uma quantia para outro participante, numa data,
  como pagamento comum ou como pagamento por certificado (com o SHA-256 do registro pedido).
- **Gasto duplo:** duas histórias diferentes do mesmo livro são uma bifurcação, que o aparelho que recebe acusa e
  guarda como prova; a rede lê um livro por chave.
- **Estado:** `estadoDaRede` refaz a conta a partir da gênese, dos livros e de `redes/cosmos-teste-1/recompensas.json`.
  As operações são conferidas em ordem de data; cada uma só gasta o saldo livre naquele dia (a gênese, mais o recebido
  há pelo menos 30 dias, menos o que já saiu). A primeira operação que não vale recusa o resto daquele livro, e quem
  receberia dela não recebe nada. A conta tem de fechar: emitido − queimado = soma dos saldos.
- **Recompensas:** 10 unidades por registro, presas 30 dias, até 100 por chave por semana (contada do início), sem
  repetir o mesmo registro. A CI só aceita uma recompensa se o registro está publicado em `cadeias/`, é da chave da
  recompensa e foi aberto com certificado pelo verificador público (`testes/cadeias-publicadas.test.ts`). A primeira é
  do registro 0 da cadeia `teste-3-notebooks-a` (A).
- **No app:** Labs → Moeda de teste. Transferir só pelo `localhost`, com a chave de Minha cadeia; a operação é conferida
  contra o estado da rede antes de ser guardada. Receber o livro de outro aparelho funciona em qualquer lugar.
- **Limites conhecidos:** as datas das operações são declaradas por quem assina (não há relógio confiável; quem recebe
  recusa data no futuro, e a CI confere com a data dela). Uma chave não prova quem é a pessoa (Fase 6). A rede não tem
  consenso: cada aparelho vê os livros que recebeu, e a versão publicada em `redes/cosmos-teste-1/livros/` é a que o
  verificador público confere.

Os cenários M01–M10 de `testes/moeda-teste.test.ts` cobrem cada regra; o roteiro dos três notebooks está em
`especificacao/teste-moeda-3-notebooks.md`.

## Fontes

- CVM, Parecer de Orientação 40 (11/10/2022), comentado por [Lefosse](https://lefosse.com/noticias/alerta/cvm-divulga-parecer-de-orientacao-sobre-o-mercado-de-valores-mobiliarios-e-criptoativos/), [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/mercado-de-capitais-ij/orientacoes-da-cvm-para-o-mercado-de-criptoativos) e [Mattos Filho](https://www.mattosfilho.com.br/unico/cvm-parecer-criptoativos/).
- Banco Central, Resoluções 519, 520 e 521 (10/11/2025), comentadas por [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/bancario-seguros-e-financeiro-ij/bcb-regulamenta-o-mercado-de-ativos-virtuais-no-brasil) e [Demarest](https://demarest.com.br/wp-content/uploads/2025/11/Demarest_BC_regulamenta_a_prestacao_de_servicos_de_ativos_virtuais.pdf); Lei 14.478/2022.
- Termos de testnets: [Avalanche](https://support.avax.network/en/articles/6639882-core-web-how-do-i-use-the-test-faucet), [Cardano](https://docs.cardano.org/cardano-testnet/tools/faucet), [Paxos](https://faucet.paxos.com/legal), [First Digital](https://www.firstdigitallabs.com/legal/fdusd-faucet-disclaimer).
