#!/usr/bin/env python3
"""O segundo conferidor: os 28 problemas de especificacao/provas-t1 por outra prova, em outro formato, noutro checador.

Uso: python3 scripts/conferir-cpc.py --cvc5 CAMINHO --ethos CAMINHO --assinatura PASTA_proofs/eo/cpc

Para cada problema com prova Alethe, o cvc5 1.4.2 gera uma prova no formato CPC (Cooperating Proof Calculus), e o Ethos
0.2.5, o checador que o cvc5 1.4.2 indica (contrib/get-ethos-checker), a confere contra a assinatura Eunoia do CPC
publicada com o cvc5 1.4.2 (fixada pelo hash da árvore). O Ethos é outra base de código que a do Carcara, lê outro
formato e confere outras regras; o que os dois têm em comum é o cvc5, que gera as duas provas.

- `--require-proof-of-false`: a prova tem de terminar em falso; `--reference` (ou a referência que o cvc5 imprime): cada
  suposição da prova tem de ser uma asserção do problema publicado, com o SHA-256 do registro (lido uma vez, CP04).
- Só `correct` conta. `incomplete` quer dizer que a prova usou um passo sem justificativa formal (a regra `trust`,
  marcada `:sorry`): é falha.
- Dois estragos por prova aceita: sem o último passo, e com um problema sem as asserções. Os dois têm de ser recusados.

Sai com código 1 se um problema não der unsat, se uma prova for recusada ou incompleta, ou se um estrago for aceito.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PASTA = os.path.join(RAIZ, 'especificacao', 'provas-t1')
# a árvore proofs/eo/cpc do cvc5 1.4.2: SHA-256 das linhas "caminho sha256", em ordem, uma por arquivo (51 arquivos)
ASSINATURA_SHA256 = '8bc50234078b94144eb759058b007ed00839da5ef0f572a69c9c5dba5fd89102'
# como na geração das provas Alethe (especificacao/provas-t1/README.md): sem --enum-inst o cvc5 não decide estes quatro
ENUM_INST = {'Z16', 'Z20', 'Z21', 'Z24'}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def hash_da_arvore(pasta):
    linhas = []
    base = os.path.dirname(os.path.abspath(pasta))
    for d, _, fs in os.walk(pasta):
        for f in fs:
            p = os.path.join(d, f)
            with open(p, 'rb') as a:
                linhas.append(os.path.relpath(p, base).replace(os.sep, '/') + ' ' + sha(a.read()))
    return sha(('\n'.join(sorted(linhas)) + '\n').encode())


def rodar(cmd, cwd):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return None, '', 'tempo esgotado'
    return r.returncode, r.stdout, r.stderr


def anotar(nivel, titulo, texto):
    if os.environ.get('GITHUB_ACTIONS'):
        print(f'::{nivel} title={titulo}::' + texto.replace('%', '%25').replace('\r', '').replace('\n', '%0A'), flush=True)


def veredito_do_ethos(codigo, saida, erro):
    """'correct' ou 'incomplete' só sozinhos (uma linha de veredito) e com código 0; qualquer outra coisa é recusa."""
    vereditos = [l.strip() for l in saida.splitlines() if l.strip() in ('correct', 'incomplete')]
    if codigo == 0 and len(vereditos) == 1:
        return vereditos[0], ''
    return 'recusada', ' '.join((erro or saida).split())[:300]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cvc5', required=True)
    ap.add_argument('--ethos', required=True)
    ap.add_argument('--assinatura', required=True)
    args = ap.parse_args()
    falhas, linhas, incompletas = [], ['| Problema | cvc5 | Ethos | Estragos recusados |', '| --- | --- | --- | --- |'], []
    assinatura = os.path.abspath(args.assinatura)
    if hash_da_arvore(assinatura) != ASSINATURA_SHA256:
        sys.exit(f'a assinatura CPC em {assinatura} não é a do cvc5 1.4.2 (hash da árvore diferente)')
    with open(os.path.join(PASTA, 'certificados.json'), encoding='utf-8') as f:
        certificados = [c for c in json.load(f)['certificados'] if c.get('prova')]
    cabecalho = f'(include "{assinatura}/Cpc.eo")\n(include "{assinatura}/expert/CpcExpert.eo")\n'
    with tempfile.TemporaryDirectory() as tmp:
        vazio = os.path.join(tmp, 'vazio.smt2')
        with open(vazio, 'w', encoding='utf-8', newline='\n') as f:
            f.write('(set-logic ALL)\n(check-sat)\n')

        def ethos(corpo, nome, problema):
            # a referência vai no arquivo, depois da assinatura (pela linha de comando, ela seria lida antes, sem os
            # símbolos do SMT-LIB): a que o cvc5 imprimiu, trocada pelo problema dado, ou uma nova
            ref = re.findall(r'\(reference "([^"]*)"', corpo)
            if ref:
                corpo = corpo.replace(f'(reference "{ref[0]}"', f'(reference "{problema}"', 1)
            else:
                corpo = f'(reference "{problema}")\n' + corpo
            arquivo = os.path.join(tmp, nome)
            with open(arquivo, 'w', encoding='utf-8', newline='\n') as f:
                f.write(cabecalho + corpo)
            return veredito_do_ethos(*rodar([args.ethos, '--require-proof-of-false', arquivo], tmp))

        for c in certificados:
            cid = c['id']
            with open(os.path.join(PASTA, c['problema']['arquivo']), 'rb') as f:
                dados = f.read()
            if sha(dados) != c['problema']['sha256']:
                falhas.append(f'{cid}: SHA-256 do problema diferente do registro')
                continue
            problema = os.path.join(tmp, f'{cid}.smt2')
            with open(problema, 'xb') as f:
                f.write(dados)
            opcoes = ['--enum-inst'] if cid in ENUM_INST else []
            codigo, saida, erro = rodar([args.cvc5, '--dump-proofs', '--proof-format-mode=cpc', '--proof-print-reference',
                                         '--tlimit=20000', *opcoes, problema], tmp)
            corpo = saida.splitlines()
            if codigo is None or not corpo or corpo[0].strip() != 'unsat':
                falhas.append(f"{cid}: o cvc5 não deu unsat ({' '.join((erro or saida).split())[:200]})")
                linhas.append(f'| {cid} | não deu unsat | — | — |')
                continue
            corpo = corpo[1:]
            if corpo and corpo[0].strip() == '(' and corpo[-1].strip() == ')':
                corpo = corpo[1:-1]
            texto = '\n'.join(corpo) + '\n'
            v, motivo = ethos(texto, f'{cid}.cpc', problema)
            if v == 'recusada':
                falhas.append(f'{cid}: o Ethos recusa a prova CPC ({motivo})')
                linhas.append(f'| {cid} | unsat | **recusada** | — |')
                continue
            if v == 'incomplete':
                incompletas.append(cid)
                falhas.append(f'{cid}: a prova CPC usa um passo sem justificativa formal (incomplete)')
            # os estragos: sem o último passo; com um problema sem as asserções
            passos = [i for i, l in enumerate(corpo) if l.lstrip().startswith('(step')]
            estragos = []
            if passos:
                estragos.append(('sem o último passo', '\n'.join(corpo[:passos[-1]] + corpo[passos[-1] + 1:]) + '\n', problema))
            estragos.append(('problema sem as asserções', texto, vazio))
            recusados = 0
            for i, (descricao, e, p) in enumerate(estragos):
                ve, _ = ethos(e, f'{cid}-estrago{i}.cpc', p)
                if ve == 'correct':
                    falhas.append(f'{cid}: o Ethos aceitou um estrago ({descricao})')
                else:
                    recusados += 1
            linhas.append(f'| {cid} | unsat | {v} | {recusados} de {len(estragos)} |')

    versao = (rodar([args.cvc5, '--version'], RAIZ)[1].splitlines() or ['?'])[0]
    with open(args.ethos, 'rb') as f:
        ethos_sha = sha(f.read())
    corretas = sum('| correct |' in l for l in linhas)
    texto = '\n'.join([
        '## Segundo conferidor: provas CPC pelo Ethos', '',
        f'{corretas} de {len(certificados)} problemas com prova CPC aceita (`correct`) pelo Ethos 0.2.5; '
        f'{len(incompletas)} incompletas (com passo sem justificativa formal){": " + ", ".join(incompletas) if incompletas else ""}.', '',
        f'{versao}; Ethos SHA-256 `{ethos_sha}`; assinatura CPC do cvc5 1.4.2, árvore `{ASSINATURA_SHA256}`.', '',
        *linhas, '', *(f'- FALHA: {x}' for x in falhas), 'Nenhuma falha.' if not falhas else ''])
    print(texto)
    anotar('error' if falhas else 'notice', 'Segundo conferidor', texto.split('\n')[2] + ''.join('\n' + x for x in falhas[:8]))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(texto + '\n')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
