# M10 — Fidelidade das explicações M1 (31/10/2026)

## Correção de atribuição

O código atual **não extrai os cenários da Conversa do modelo do Z3**. O Z3 decide a classe; `ollama-node.ts` chama `cenarioDoSalto`, em `src/motor/revisor.ts:123`, que usa o motor finito do Caderno, sem Z3, até quatro objetos/200.000 nós/um mundo/prazo de 5s. Por isso esta auditoria identifica a origem corretamente em vez de atribuir ao Z3 um modelo que ele não forneceu.

## Resultado real

As notas M1 cego-v2 contêm **62 independentes**. Para os 62, a mesma busca e os mesmos limites do produto encontraram um cenário. O `Avaliador` de `src/motor/avaliar.ts` conferiu, por programa, cada fórmula das premissas como verdadeira e a conclusão como falsa. A renderização portuguesa desse modelo foi comparada com a devolvida por `cenarioDoSalto`.

**62/62 conferidos (100% dos independentes M1), zero indisponíveis e zero falhas.** As traduções e classes da M1 não foram executadas novamente nem ajustadas. Medição única: 178ms do harness; Vitest 2/2 testes, 1,60s, saída0. A duração não inclui tradução ou Z3.

Há ainda regressão padrão com um modelo adulterado explícito: o avaliador acusa premissa falsa e conclusão verdadeira. Ela confirma que o teste não aceita qualquer modelo por definição.

## Evidências

- Harness: `testes/missao10-cenarios.test.ts`, medição opt-in `MISSAO10_MEDIR=1`, recusa pasta já existente.
- Resultados completos, incluindo modelos, fora do Git: `tmp/missoes/m10-cenarios/resultados.jsonl` e `resumo.json`.
- Notas M1 preservadas: `e711c7e733c65553da16a6cf14fc23b04e40cbfa687799b7d42e572c3993ec26`.
- Respostas M1 preservadas: `41aa3c9e91b398ace6d148dcc57e67c6d4c95ca813094f62e4ed3647da1a2185`.
- Resultados desta auditoria: `aa354ba20e1571915fb800cb27e3ef6b8038d2eb034070afa1b0ff024c124e7c`.

## Limites

O avaliador e o gerador pertencem ao próprio projeto: isso não é certificação por kernel independente, Carcara ou extração/conferência do modelo interno Z3. Confere os modelos estruturados e o vínculo com a renderização do produto, não uma interpretação reversa independente de cada frase portuguesa exibida. Também não confere fidelidade entre argumento humano e tradução; uma tradução errada ainda pode ter contramodelo correto para suas próprias fórmulas. Resultado limitado à M1 cego-v2, não generalizado a todas as entradas ou às outras versões históricas.
