# M9 — Variação e tempo (31/10/2026)

## Protocolo e resultado

Dez primeiros itens exclusivamente de `tmp/frases-gpt/revisao.jsonl`: G-001, G-002, G-006, G-008, G-013, G-015, G-016, G-017, G-018, G-020. Cinco execuções por item, **50/50 pares únicos**, sem usar a metade de teste. qwen3:4b `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, Ollama 0.40.12, cego-v2, temperatura 0, semente 0, contexto4096 e vocabulário fixado pelo conjunto, como no piloto. GPU integrada, não usada pelo modelo.

**0/10 itens mudaram** a resposta JSON final; **0/10 mudaram** o par de fórmulas premissas/conclusão; **0/50 sem leitura**. Observação limitada a estas cinco repetições por item e configuração, não garantia de determinismo em outras máquinas/versões. Contagem de tokens e tempos não fazem parte da igualdade textual. Nenhum prompt foi ajustado a partir dos resultados.

## Tempos reais

| Etapa | Amostras | Mediana (s) | Maior (s) |
|---|---:|---:|---:|
| premissasMs | 50 | 42.9380 | 129.9710 |
| conclusaoMs | 50 | 34.5796 | 71.2739 |
| z3Ms | 50 | 0.4518 | 0.7392 |
| ponteMs | 35 | 0.4228 | 0.6153 |

Premissas/conclusão incluem as chamadas e eventuais reparos em cada etapa, medidas com relógio monotônico. O primeiro carregamento do modelo pode estar incluído. Tradução completa: 4065.479s de harness (Vitest 4066,74s). Não são tempos de GPU nem benchmark isolado.

Depois de descarregar Ollama (`ollama ps` vazio), cada uma das 50 respostas foi conferida por **um processo Z3 separado**: 15 segue e 35 independente, zero sem classe. O tempo Z3 mede `classificar`, sem inicialização WASM/processo. A ponte mede `buscarPonte` somente nos 35 independentes, busca formal sem modelo extra; nos 15 restantes é null/não aplicável, não zero. Inclui a busca e validações reais de ponte; não representa latência de uma ponte neural. Tempos foram coletados em etapas separadas, não medem a latência total da interface.

## Evidências e repetibilidade

- `testes/missao9-variacao.test.ts`: opt-in `MISSAO9_MEDIR=1`, recusa pasta existente; saída incremental.
- `testes/missao9-conferencia.test.ts`: opt-in `MISSAO9_CONFERIR=0..49`, um par por processo, recusa par já gravado.
- Resultados locais fora do Git: `tmp/missoes/m9-variacao/respostas.jsonl`, `conferencias.jsonl` e `resumo-final.json`.
- Respostas SHA-256: `3f3eeeb6fc0268137f99a6335e8cf58d175d3601ed6c59a87171bd76de9df856`.
- Conferências SHA-256: `8a3420d3247d9219dc3e497cbf4eb16475754efcfefd06c2cd8dbcbe477d9d4b`.
- Conjunto revisão SHA-256: `ea4477758eda67351675f4d3be3cc5fbf5d62dc883bc8d2251af7311c2189fa0`.
- Tradutor preservado: `e297fa24e6929f7a050f498e7238b16597a0ae0796ce8e1a033de65a04b866f8`.
- Ponte preservada: `e274d58d305caa26884010dfa5dd496b2c2ae554464f83b06aec1a7eabc37d7d`.

Não foram repetidas traduções após observar resultados. Regressão padrão pula as medições opt-in. Zero variação não demonstra fidelidade das traduções; a seleção é revisão, sem inferência de desempenho na metade limpa.
