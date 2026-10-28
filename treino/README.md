# Treino da I-AI (fases E e F do plano de fechamento)

O treino só começa depois da linha de base (fase C) e das melhorias sem treino (fase D), e só se a meta não tiver
sido batida. Tudo aqui é público e reproduzível; o conjunto fechado nunca entra.

## 1. Dados (no PC, na pasta do Cosmos)

```
python -I -X utf8 -B scripts/gerar-frases.py treino privado/treino/treino.jsonl
```

Cada fatia de 25 itens é conferida pelo Z3 num processo próprio (3000 itens = 120 fatias, cerca de 20 minutos); os
recusados vão para `recusados.jsonl` e ficam fora do treino:

```
$env:FRASES_ARQUIVO='privado/treino/treino.jsonl'; $env:FRASES_RECUSADOS='privado/treino/recusados.jsonl'
foreach ($i in 0..119) { $env:FRASES_FATIA="$($i*25)-$($i*25+25)"; node node_modules/vitest/vitest.mjs run testes/frases-geradas.test.ts }
```

Depois:

```
python -I -X utf8 -B scripts/anti-vazamento.py privado/avaliacao-fechada-v1/conjunto.jsonl privado/treino/treino.jsonl
```

Tem de dar 0 em tudo. Em seguida, a exportação com o mesmo pedido do piloto, para o treino e para a validação:

```
$env:TREINO_ARQUIVO='privado/treino/treino.jsonl'; $env:TREINO_SAIDA='privado/treino/treino-chat.jsonl'; $env:TREINO_RECUSADOS='privado/treino/recusados.jsonl'; node node_modules/vitest/vitest.mjs run testes/exportar-treino.test.ts
$env:TREINO_ARQUIVO='avaliacao/validacao-v1.jsonl'; $env:TREINO_SAIDA='privado/treino/validacao-chat.jsonl'; Remove-Item Env:TREINO_RECUSADOS; node node_modules/vitest/vitest.mjs run testes/exportar-treino.test.ts
```

Antes de treinar: a leitura de amostra pelo dono (passo E4) e o carimbo do SHA-256 de `treino-chat.jsonl` no
Bitcoin (passo E5).

## 2. Treino (Kaggle ou Colab, GPU T4)

1. Notebook novo, acelerador **GPU T4**, internet ligada.
2. Suba `treino-chat.jsonl`, `validacao-chat.jsonl`, `sft-qlora.py` e `mesclar.py`.
3. Numa célula:
   ```
   !pip install -q peft bitsandbytes accelerate
   !python sft-qlora.py --treino treino-chat.jsonl --validacao validacao-chat.jsonl --saida adaptador --amostra 100 --epocas 1
   ```
   Este é o ensaio de ponta a ponta com 100 exemplos. Se terminar sem erro, rode sem `--amostra` e com `--epocas 3`.
4. Mande para o Claude o que o roteiro imprime no fim e o `adaptador/cosmos-treino.json` (perda por época, melhor
   checkpoint, hashes, revisão do modelo base).

O roteiro calcula a perda só na resposta, desliga o "modo pensando", mede a validação a cada época e para cedo se ela
piorar. A perda não é a nota: a nota é a do arquivo final pelo Z3.

## 3. Arquivo final (GGUF) e Ollama

No mesmo notebook:

```
!python mesclar.py --adaptador adaptador/final --saida mesclado
!git clone --depth 1 https://github.com/ggml-org/llama.cpp && pip install -q -r llama.cpp/requirements.txt
!git -C llama.cpp rev-parse HEAD
!python llama.cpp/convert_hf_to_gguf.py mesclado --outtype f16 --outfile cosmos-f16.gguf
!cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=OFF && cmake --build llama.cpp/build --target llama-quantize -j
!llama.cpp/build/bin/llama-quantize cosmos-f16.gguf cosmos-iai-q4_k_m.gguf Q4_K_M
!sha256sum cosmos-iai-q4_k_m.gguf
```

Baixe `cosmos-iai-q4_k_m.gguf` (cerca de 2,5 GB) para `privado/treino/`. No PC, o `Modelfile` usa o mesmo modelo de
conversa do Qwen3 que o Ollama já tem:

```
ollama show qwen3:4b --modelfile > privado/treino/Modelfile
```

No arquivo, troque a linha `FROM …` por `FROM ./cosmos-iai-q4_k_m.gguf` e rode:

```
cd privado/treino; ollama create cosmos-iai:v1 -f Modelfile
```

A nota que vale é a deste modelo, pelo piloto com `PILOTO_MODELO=cosmos-iai:v1`: primeiro na validação, e só depois,
uma vez, nos 120 (passo F5).
