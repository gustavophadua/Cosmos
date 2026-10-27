#!/usr/bin/env python3
"""Confere, de forma independente, os registros abertos pela CI a partir das cadeias publicadas em cadeias/.

Uso: python3 scripts/conferir-cadeias.py --carcara CAMINHO --saida PASTA_DO_GERADOR

Para cada registro aberto em PASTA/<cadeia>/registros.json (gerado por testes/cadeias-publicadas.test.ts):
  1. a conferência de registros-v1 de especificacao/provas-t1/registros.py (leitura e tradução independentes,
     modelos pela conferência independente, provas pelo Carcara), com as regras RARE auditadas;
  2. o leitor de registros do GPT (independente/registros_independente.py), que também tem de aceitar.
Os registros que o gerador deixou pendentes ou que não se sustentam são listados como tal, sem contar como aceitos.
Sai com código 1 se um registro aberto for recusado por qualquer uma das duas conferências.
"""
import argparse, json, os, shutil, sys

ESPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'especificacao', 'provas-t1')
sys.path.insert(0, ESPEC)
import conferir  # noqa: E402
import registros  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--carcara', required=True)
    ap.add_argument('--saida', required=True)
    args = ap.parse_args()
    if sys.flags.optimize:
        sys.exit('não roda com python -O: a conferência independente usa assert')

    def anotar(nivel, titulo, texto):
        if os.environ.get('GITHUB_ACTIONS'):
            print(f'::{nivel} title={titulo}::' + texto.replace('%', '%25').replace('\r', '').replace('\n', '%0A'), flush=True)

    def provar(prova, problema):
        v, modo, motivo, motivo_rup = conferir.conferir(args.carcara, prova, problema, conferir.REGRAS_CONFIADAS)
        nome = os.path.basename(prova)
        if v == 'valid':
            anotar('notice', f'Carcara {nome}', f'valid ({modo})')
        else:
            anotar('error', f'Carcara {nome}', f'{v}: pivôs: {motivo[:400]} | RUP: {motivo_rup[:400]}')
        return None if v == 'tempo esgotado' else v == 'valid'

    # o recibo registra os bytes do executável que rodou de fato (o cache é identificado só pelo nome do commit)
    executavel = conferir.sha256(shutil.which(args.carcara) or args.carcara) if os.path.exists(shutil.which(args.carcara) or args.carcara) else 'indisponível'
    falhas, linhas, contagem = [], [], {'aceito': 0, 'pendente': 0, 'nao-se-sustenta': 0}
    for pasta in sorted(os.listdir(args.saida)):
        arquivo = os.path.join(args.saida, pasta, 'registros.json')
        if not os.path.isfile(arquivo):
            continue
        raiz = os.path.join(args.saida, pasta)
        for item in json.load(open(arquivo, encoding='utf-8'))['resultados']:
            rotulo = f'{pasta} · elo {item["indice"]}'
            if item['estado'] == 'pendente':
                contagem['pendente'] += 1
                linhas.append(f'| {rotulo} | pendente | — | — | {item.get("detalhe", "")} |')
                continue
            # aberto: confere o registro; não se sustenta: confere o contra-registro (a afirmação contrária com certificado)
            r = item['registro'] if item['estado'] == 'aberto' else item['contra']
            motivo, detalhe, pendencias = registros.conferir_registro(r, provar, raiz)
            gpt = registros.no_leitor_do_gpt({'registro': r}, provar, raiz)
            ok_ver = motivo is None and not pendencias
            ok_gpt = gpt[0] == 'aceito'
            if ok_ver and ok_gpt:
                contagem['aceito' if item['estado'] == 'aberto' else 'nao-se-sustenta'] += 1
            else:
                falhas.append(f'{rotulo} ({item["estado"]}): verificador {motivo or "aceito"} {detalhe} {pendencias}; leitor do GPT {gpt}')
                anotar('error', f'Registro {rotulo}', falhas[-1][:900])
            cert = ', '.join(r['certificado'].keys())
            como = r['afirmacao'] if item['estado'] == 'aberto' else f'não se sustenta; contra-registro {r["afirmacao"]}'
            if 'vazio' in r['certificado']:
                # base inconsistente: tudo "segue" dela; o selo não pode ser o de uma consequência de premissas com modelo
                como = f'{r["afirmacao"]} SÓ PORQUE AS PREMISSAS SÃO INCONSISTENTES (vazio): não informa nada'
            linhas.append(f'| {rotulo} | {como} ({r["tipo"]}) | {cert} | {"aceito" if ok_ver else f"{motivo} {pendencias}"} · GPT: {gpt[0]} | {r["formula"]} |')
    texto = '\n'.join(['## Verificador público · cadeias publicadas (registros abertos)', '',
                       '| Registro | Afirmação | Certificado | Conferência independente | Fórmula / detalhe |', '| --- | --- | --- | --- | --- |', *linhas, '',
                       f"Carcara: SHA-256 do executável `{executavel}`; regras RARE `{conferir.sha256(conferir.REGRAS_CONFIADAS)}`.", '',
                       f"Aceitos pelas duas conferências: {contagem['aceito']}; pendentes no gerador: {contagem.get('pendente', 0)}; "
                       f"que não se sustentam, com o contra-registro aceito pelas duas: {contagem['nao-se-sustenta']}.",
                       'O certificado confere a afirmação sobre a fórmula e a teoria (segue, contradiz, não segue, consistente); '
                       'não diz que as premissas são verdadeiras no mundo.', '', *[f'- FALHA: {f}' for f in falhas], ''])
    print(texto)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8').write(texto + '\n')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
