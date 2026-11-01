"""Pontua a camada de fatos contra o esperado escrito antes de rodar (avaliacao/realidade-frases-v1.jsonl).

Uso: python -I -X utf8 -B scripts/pontuar-realidade.py <conjunto.jsonl> <resultado.jsonl> <saida.json>

Cada frase do argumento e a conclusão diante do relato viram um julgamento:
- exato: igual ao esperado;
- CHUTE: o Cosmos deu certeza (fato, contraria, segue, contradiz) onde a realidade não decide ou decide outra coisa;
- falta: o Cosmos não deu certeza onde a realidade decide (limite de tradução ou da base, não mentira);
- outro: os dois sem certeza, mas diferentes (relato no lugar de visão, por exemplo).
A frase sem resultado (tradução que não se leu, Z3 que não concluiu ou passou do prazo) conta como sem certeza.
"""
import json
import sys

CERTEZA = {'fato', 'contraria', 'segue', 'contradiz'}


def ler(caminho):
    with open(caminho, encoding='utf-8') as f:
        return [json.loads(l) for l in f if l.strip()]


def main(conjunto, resultado, saida):
    itens = ler(conjunto)
    obtidos = {r['id']: r for r in ler(resultado)}
    conta = {'itens': len(itens), 'com_resultado': 0, 'julgamentos': 0, 'exatos': 0, 'chutes': 0, 'faltas': 0, 'outros': 0, 'por_item': []}
    for item in itens:
        r = obtidos.get(item['id'], {})
        real = r.get('realidade') if isinstance(r.get('realidade'), dict) else {}
        frases = [f['situacao'] for f in real.get('frases', [])] if real.get('frases') else []
        if frases:
            conta['com_resultado'] += 1
        esperados = item['esperado']['frases'] + [item['esperado']['conclusaoComRelato']]
        recebidos = (frases if len(frases) == len(item['esperado']['frases']) else [None] * len(item['esperado']['frases'])) + [real.get('conclusaoComRelato')]
        marcas = []
        for e, o in zip(esperados, recebidos):
            conta['julgamentos'] += 1
            if o == e:
                conta['exatos'] += 1; marcas.append('exato')
            elif o in CERTEZA:
                conta['chutes'] += 1; marcas.append('CHUTE')
            elif e in CERTEZA:
                conta['faltas'] += 1; marcas.append('falta')
            else:
                conta['outros'] += 1; marcas.append('outro')
        conta['por_item'].append({'id': item['id'], 'frase': item['frase'], 'esperados': esperados, 'obtidos': recebidos, 'marcas': marcas,
                                  'erro': r.get('erro') or (real.get('erro') if real else None) or ('sem resultado' if not r else None)})
    with open(saida, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(conta, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in conta.items() if k != 'por_item'}, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:4])
