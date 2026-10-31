# M6 - medição da guarda de repetição

Medição única em 31/10/2026: qwen3:4b 359d7dd4, cego-v2, temperatura/semente 0, contexto 4096. Não houve mudança da guarda nem do prompt.

| Grupo | Itens | Conclusão vazia | Falha/resultado não classificável como vazio | Não vazia |
|---|---|---|---|---|
| Paráfrase legítima | 10 | 7 | 1 | 2 |
| Risco de cópia indevida | 10 | 1 | 1 | 8 |

São 7/10 legítimos com conclusão vazia observada; a falha adicional é separada e não foi imputada como vazia. Não concluir que as oito conclusões não vazias do segundo grupo estão corretas: esta missão mede a guarda, não classe ou fidelidade pelo Z3. Os casos de risco não presumem que o modelo necessariamente copiaria.

Tempo do harness: 2.324.444 ms; duração Vitest 2325.58s. Resultado real: Tests 2 passed (2), exit 0. Hash de respostas: 2720a034fe9ce8a93a9c13beeb5379212d1eb7273ef0ee2b1923b12f4c22b1d2. Conjunto público: avaliacao/guarda-parafrase-v1.jsonl. Recibos locais fora do Git: tmp/missoes/m6-guarda/.

## Proposta, não implementada

A repetição deve abrir confirmação da interpretação: exibir a premissa e conclusão e permitir ao usuário declarar que quis reafirmar a mesma proposição. Uma regra de paráfrase automática precisaria de avaliação separada de fidelidade; equivalência formal sozinha não prova fidelidade ao texto. Até essa avaliação, manter a guarda conservadora e dar aviso específico, sem converter ausência em classe lógica. Não ajustar usando o conjunto de teste M1.
