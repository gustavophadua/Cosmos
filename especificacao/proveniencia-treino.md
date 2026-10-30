# Proveniência do corpus de treino

Conferência de 30/10/2026. Origem: `scripts/gerar-frases.py`; exportador: `testes/exportar-treino.test.ts`.

## Contagens e unidade

O pacote `cosmos-treino/para-o-kaggle` contém 7.800 **conversas** de treino, correspondentes a 3.900 argumentos, e 300 conversas de validação, correspondentes a 150 argumentos. Cada argumento produz duas conversas: premissas sem conclusão e conclusão com vocabulário. Não são 7.800 argumentos diferentes.

A conferência dos ids encontrou 6.000 conversas T- e 1.800 W- no treino; 300 V- na validação. Não foram encontrados outros prefixos nesses arquivos. Foram lidos apenas os ids para essa contagem; não foi refeita a derivação byte a byte do pacote.

## Geração

O gerador usa moldes de frases e fórmulas, vocabulário próprio e `random.Random` com semente derivada de SHA-256 do modo. Modos disponíveis: `validacao`, `treino`, `revisao`, `treino2`, `revisao2`, `visao`. T- identifica treino/treino2; V-, validação; W-, visão de mundo; R-, revisão/revisao2. Os modos efetivamente usados para cada lote T- precisam de seus recibos de geração: o prefixo sozinho não distingue treino de treino2.

O gabarito é construído junto das frases pelos moldes: premissas formais, conclusão e classe esperada. O teste `testes/frases-geradas.test.ts` confere essa classe com o Z3 em fatias, podendo registrar recusados. O exportador exclui os ids do arquivo de recusados indicado. A simples presença de uma classe no JSON não comprova que o lote inteiro foi conferido nesta execução.

## Exportação e exclusões

O exportador aceita somente ids que correspondem a `^[VTW]-\d+$`; recusa o arquivo se houver outro prefixo. Assim F- (fechado), R- (revisão) e G- (frases de avaliação de outro modelo) ficam fora. O exportador usa o gabarito, pedidos do próprio projeto e exemplos públicos; não chama modelo externo.

No caminho de geração e exportação examinado, **nenhum exemplo contém saída de modelo de terceiros**. Essa afirmação descreve o mecanismo examinado; não representa uma reconstrução independente de todos os bytes dos arquivos exportados. Moldes novos podem ter sido inspirados em famílias de erros de avaliação, como o comentário de `treino2` declara; isso é diferente de inserir respostas externas no corpus.

## Licenças e base

Os dados próprios são declarados CC BY 4.0, com atribuição ao projeto Cosmos. O código do projeto é AGPL-3.0 ou posterior. A base prevista é `Qwen/Qwen3-4B`, Apache 2.0; revisão imutável ainda a fixar antes do treino. O digest Ollama usado na avaliação não substitui o commit do modelo base no treinamento.

Pendências de rastreabilidade: recibos dos modos e parâmetros que produziram cada lote; hashes dos arquivos; registro de recusados e comprovação de conferência completa do gabarito. Não foi acessado o conjunto fechado.
