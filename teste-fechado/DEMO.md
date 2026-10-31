# Demo pública do Cosmos — 31/10/2026

Três execuções reais do núcleo local, sem conta privada. Modelo qwen3:4b `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, Ollama 0.40.12, cego-v2, temperatura0, semente0, contexto4096, vocabulário proposto pelo modelo. GPU integrada, não usada pelo modelo.

Primeiro foram feitas as três traduções reais. Depois o modelo foi descarregado, e `executar`, `lerProposta`, `conferirProposta` (Z3), `cenarioDoSalto` e `resumoEmTexto` processaram exatamente as traduções registradas, sem outra inferência. Esse arranjo em duas etapas evita coexistência de modelo e Z3 nesta máquina. Não é screenshot da Conversa autenticada, nem o teste de rede M12; a ponte de autenticação não foi contornada. Nenhuma resposta abaixo foi substituída por expectativa do teste.

## D-001 — segue

Entrada pública:

> Todo cliente tem suporte. A loja é cliente. Então a loja tem suporte.

Resposta real de resumoEmTexto:

```text
Provado: a conclusão decorre das premissas.

Premissas:
- Todo cliente tem suporte.
- A loja é cliente.
Conclusão: Então a loja tem suporte.

Fórmulas (m2):
- ∀x (Cliente(x) ⟹ TemSuporte(x))
- Cliente(loja)
- conclusão: TemSuporte(loja)
```

## D-002 — nao-segue

Entrada pública:

> Todo cliente tem suporte. A loja tem suporte. Então a loja é cliente.

Resposta real de resumoEmTexto:

```text
Salto: a conclusão não decorre das premissas.

Premissas:
- Todo cliente tem suporte.
- A loja tem suporte.
Conclusão: Então a loja é cliente.

Cenário em que as premissas valem e a conclusão não:
- Loja: tem suporte; não: é cliente

Fórmulas (m2):
- ∀x (Cliente(x) ⟹ TemSuporte(x))
- TemSuporte(loja)
- conclusão: Cliente(loja)
```

## D-003 — ambiguo

Entrada pública:

> Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova.

Resposta real de resumoEmTexto:

```text
Salto como está escrito; provado só se valer para todos.

"Clientes do plano anual normalmente renovam." diz "normalmente", e a lógica não tem "a maioria": para conferir, li como "Clientes do plano anual renovam." (vale para todos).
Com "normalmente", a conclusão não decorre: "normalmente" admite exceções, e o caso da conclusão pode ser uma delas. Ela só está provada se a frase valer para todos, e aí essa premissa é uma generalização que precisa de fonte.

Premissas:
- Clientes do plano anual renovam.
- A padaria é cliente do plano anual.
Conclusão: Então a padaria renova.

Fórmulas (m2):
- ∀x (PlanoAnual(x) ⟹ Renovam(x))
- PlanoAnual(padaria)
- conclusão: Renovam(padaria)
```

## Como ler o resultado

- D-001: decorre das premissas formalizadas, sem comprovar que essas premissas são fatos do mundo.
- D-002: o cenário real encontrado tem suporte e não é cliente; ter suporte não basta para concluir que é cliente. A classe vem do Z3; o cenário vem do motor finito do produto, conforme M10.
- D-003: o Z3 confirma a versão universal forte, mas a resposta avisa explicitamente que “normalmente” permite exceções. Não apresentar esse caso como prova incondicional da frase original.

Não foi executado um chat comum para comparação. Portanto não há fala inventada de outro modelo nem alegação de vitória comparativa. Também não há certificado independente por resposta nesta demonstração.

## Evidência local

Harness `testes/missao14-demo.test.ts`, fases opt-in `MISSAO14_FASE=traduzir` e `conferir`, recusa repetir pasta ou respostas existentes. Tradução: Vitest 2 passed/1 skipped, 388,04s, saída0. Conferência: 2 passed/1 skipped, 6,41s, saída0. Os skips são a fase não selecionada, não exemplos omitidos.

Dados fora do Git em `tmp/missoes/m14-demo/`: metadados, traduções e respostas exatas.

Respostas SHA-256: `17ca82d33d8a39e1e4b580c9dd02ec1e9d45ac479a2a8023ddb723c47fc9abf4`. Traduções SHA-256: `104a45c1f73c9ed82ac87575480c605a078e50e832072082f667a3e00ff0ce26`. Tradutor preservado: `e297fa24e6929f7a050f498e7238b16597a0ae0796ce8e1a033de65a04b866f8`.
