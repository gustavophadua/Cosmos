"""Junta o adaptador LoRA ao modelo base (em fp16) para converter em GGUF (passo F4 do plano de fechamento).

Uso, no mesmo notebook do treino:
  python mesclar.py --adaptador adaptador/final --saida mesclado [--modelo Qwen/Qwen3-4B --revisao <commit>]

Use a MESMA revisão do treino (está em adaptador/cosmos-treino.json). Roda na CPU: o modelo em fp16 ocupa ~8 GB de RAM.
"""
import argparse, json, os

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

p = argparse.ArgumentParser()
p.add_argument('--adaptador', required=True)
p.add_argument('--saida', required=True)
p.add_argument('--modelo', default='Qwen/Qwen3-4B')
p.add_argument('--revisao', default=None, help='por padrão, a do cosmos-treino.json ao lado do adaptador')
a = p.parse_args()

revisao = a.revisao
registro = os.path.join(os.path.dirname(os.path.normpath(a.adaptador)), 'cosmos-treino.json')
if revisao is None and os.path.exists(registro):
    with open(registro, encoding='utf-8') as f:
        revisao = json.load(f)['revisao_base']
revisao = revisao if revisao and len(revisao) == 40 else 'main'
print('revisão do modelo base:', revisao)

base = AutoModelForCausalLM.from_pretrained(a.modelo, revision=revisao, torch_dtype=torch.float16, device_map='cpu')
mesclado = PeftModel.from_pretrained(base, a.adaptador).merge_and_unload()
mesclado.save_pretrained(a.saida, safe_serialization=True)
AutoTokenizer.from_pretrained(a.modelo, revision=revisao).save_pretrained(a.saida)
print('modelo mesclado em', a.saida)
