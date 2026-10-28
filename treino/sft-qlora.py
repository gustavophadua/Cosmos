"""Ajuste fino supervisionado (SFT) com QLoRA do modelo da I-AI, para rodar num notebook com GPU (Kaggle ou Colab, T4).

Uso (numa célula do notebook, depois de `pip install -q peft bitsandbytes accelerate`):
  python sft-qlora.py --treino treino-chat.jsonl --validacao validacao-chat.jsonl --saida adaptador

Os dois arquivos saem de testes/exportar-treino.test.ts: o mesmo pedido do piloto (formalizacao-v1) e a resposta
certa. O que este roteiro fixa, do plano de fechamento (passo F2):
- modelo base pelo id e pela revisão exata do Hugging Face (o hash do commit vai para cosmos-treino.json);
- QLoRA em 4 bits (nf4), LoRA r=16, alpha=32, dropout 0,05 em todas as projeções; taxa 2e-4 com aquecimento de 3% e
  queda em cosseno; AdamW 8-bit paginado; semente 0;
- perda SÓ na resposta: o pedido e os exemplos entram com rótulo -100, o modelo não aprende a repetir o pedido;
- "modo pensando" desligado: o pedido termina como o do Ollama com think false (bloco <think> vazio);
- uma época por vez, perda na validação a cada época, e para cedo se a validação piorar; fica o melhor checkpoint.
A nota que vale não é a perda: é a do arquivo final (GGUF) no Ollama, medida pelo Z3 (passos F4 e F5).
"""
import argparse, hashlib, json, os, random, sys

import torch
from transformers import (AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, EarlyStoppingCallback, Trainer,
                          TrainingArguments)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

p = argparse.ArgumentParser()
p.add_argument('--treino', required=True)
p.add_argument('--validacao', required=True)
p.add_argument('--saida', required=True)
p.add_argument('--modelo', default='Qwen/Qwen3-4B')
p.add_argument('--revisao', default='main', help='commit do modelo no Hugging Face; o usado fica registrado')
p.add_argument('--epocas', type=int, default=3)
p.add_argument('--max-tokens', type=int, default=2048)
p.add_argument('--amostra', type=int, default=0, help='só os N primeiros exemplos (ensaio de ponta a ponta)')
a = p.parse_args()

random.seed(0)
torch.manual_seed(0)


def sha256(arquivo):
    with open(arquivo, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def ler(arquivo):
    with open(arquivo, encoding='utf-8') as f:
        linhas = [json.loads(l) for l in f if l.strip()]
    return linhas[:a.amostra] if a.amostra else linhas


tok = AutoTokenizer.from_pretrained(a.modelo, revision=a.revisao)
FIM = '<|im_end|>'


def codificar(conversa):
    msgs = conversa['messages']
    assert msgs[-1]['role'] == 'assistant', 'a última mensagem é a resposta certa'
    # o pedido como o modelo o verá na nota: termina em "<|im_start|>assistant" + bloco de pensamento vazio
    pedido = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True, enable_thinking=False)
    ids_p = tok(pedido, add_special_tokens=False).input_ids
    ids_r = tok(msgs[-1]['content'] + FIM, add_special_tokens=False).input_ids
    ids = (ids_p + ids_r)[:a.max_tokens]
    rotulos = ([-100] * len(ids_p) + ids_r)[:a.max_tokens]
    return {'input_ids': ids, 'attention_mask': [1] * len(ids), 'labels': rotulos}


treino = [codificar(c) for c in ler(a.treino)]
validacao = [codificar(c) for c in ler(a.validacao)]
cortados = sum(1 for x in treino + validacao if x['labels'][-1] == -100 or len(x['input_ids']) == a.max_tokens)
if cortados:
    sys.exit(f'{cortados} exemplos passam de {a.max_tokens} tokens; aumente --max-tokens')
print(f'treino: {len(treino)} exemplos; validação: {len(validacao)}; maior: {max(len(x["input_ids"]) for x in treino)} tokens')


def juntar(lote):
    n = max(len(x['input_ids']) for x in lote)
    pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    return {
        'input_ids': torch.tensor([x['input_ids'] + [pad] * (n - len(x['input_ids'])) for x in lote]),
        'attention_mask': torch.tensor([x['attention_mask'] + [0] * (n - len(x['input_ids'])) for x in lote]),
        'labels': torch.tensor([x['labels'] + [-100] * (n - len(x['labels'])) for x in lote]),
    }


# a T4 não tem bf16: tudo em fp16
quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
modelo = AutoModelForCausalLM.from_pretrained(a.modelo, revision=a.revisao, quantization_config=quant, torch_dtype=torch.float16, device_map='auto')
modelo = prepare_model_for_kbit_training(modelo, use_gradient_checkpointing=True)
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, bias='none', task_type='CAUSAL_LM',
                  target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'])
modelo = get_peft_model(modelo, lora)
modelo.print_trainable_parameters()

args = TrainingArguments(
    output_dir=a.saida, num_train_epochs=a.epocas, per_device_train_batch_size=2, gradient_accumulation_steps=8,
    per_device_eval_batch_size=2, learning_rate=2e-4, warmup_ratio=0.03, lr_scheduler_type='cosine',
    optim='paged_adamw_8bit', fp16=True, logging_steps=10, eval_strategy='epoch', save_strategy='epoch',
    load_best_model_at_end=True, metric_for_best_model='eval_loss', greater_is_better=False, save_total_limit=3,
    seed=0, data_seed=0, report_to='none', remove_unused_columns=False, gradient_checkpointing=True,
)
treinador = Trainer(model=modelo, args=args, train_dataset=treino, eval_dataset=validacao, data_collator=juntar,
                    callbacks=[EarlyStoppingCallback(early_stopping_patience=1)])
treinador.train()

final = os.path.join(a.saida, 'final')
treinador.model.save_pretrained(final)
tok.save_pretrained(final)

try:
    from huggingface_hub import model_info
    commit = model_info(a.modelo, revision=a.revisao).sha
except Exception as e:  # sem rede: fica a revisão pedida
    commit = f'desconhecido ({e.__class__.__name__}); revisão pedida {a.revisao}'
import peft, transformers
registro = {
    'formato': 'cosmos-treino-v1', 'modelo_base': a.modelo, 'revisao_base': commit,
    'treino_sha256': sha256(a.treino), 'validacao_sha256': sha256(a.validacao), 'exemplos_treino': len(treino),
    'lora': {'r': 16, 'alpha': 32, 'dropout': 0.05, 'alvos': sorted(lora.target_modules)},
    'otimizacao': {'taxa': 2e-4, 'aquecimento': 0.03, 'agenda': 'cosine', 'lote_efetivo': 16, 'epocas_max': a.epocas, 'semente': 0},
    'melhor_checkpoint': treinador.state.best_model_checkpoint, 'melhor_perda_validacao': treinador.state.best_metric,
    'historico': [h for h in treinador.state.log_history if 'eval_loss' in h],
    'versoes': {'torch': torch.__version__, 'transformers': transformers.__version__, 'peft': peft.__version__},
    'adaptador_sha256': {f: sha256(os.path.join(final, f)) for f in sorted(os.listdir(final)) if f.endswith(('.safetensors', '.json'))},
}
with open(os.path.join(a.saida, 'cosmos-treino.json'), 'w', encoding='utf-8') as f:
    json.dump(registro, f, ensure_ascii=False, indent=2)
print(json.dumps({k: registro[k] for k in ('revisao_base', 'melhor_checkpoint', 'melhor_perda_validacao')}, ensure_ascii=False))
