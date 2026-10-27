#!/usr/bin/env python3
"""CP04 da resposta do GPT ao contraponto: a prova muda depois do hash, ou é trocada por outro arquivo.

Uso: python3 scripts/testar-cp04.py   (com o SymPy no ambiente, para o leitor do GPT)

Numa cópia de especificacao/registros-v1, com o registro R01 (aberto com refutação), troca a prova e o problema em cada
momento da conferência e confere o que acontece:
  1. depois do hash, durante a prova: o Carcara recebe os bytes do hash, numa cópia fora do conjunto; a troca não muda
     nada (impossibilidade demonstrada da troca);
  2. antes do hash: recusa R8;
  3. o mesmo no caminho do leitor do GPT, e uma troca entre a leitura dele e a nossa: recusa R8.
O Carcara é trocado por um espião que só registra o que recebeu. Sai com código 1 se algum caso divergir.
"""
import hashlib, json, os, shutil, sys, tempfile

ESPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'especificacao')
sys.path.insert(0, os.path.join(ESPEC, 'provas-t1'))
import registros  # noqa: E402

LIXO_PROVA = b'(step t1 (cl) :rule hole)\n'
LIXO_PROBLEMA = b'(set-logic ALL)\n(assert false)\n(check-sat)\n'


def main():
    with open(os.path.join(ESPEC, 'registros-v1', 'exemplos.json'), encoding='utf-8') as f:
        r = next(e['registro'] for e in json.load(f)['exemplos'] if e['id'] == 'R01')
    ref = r['certificado']['refutacao']
    falhas, linhas = [], []

    def caso(nome, ok, detalhe=''):
        linhas.append(f"{'ok ' if ok else 'FALHA'} {nome}{': ' + detalhe if detalhe and not ok else ''}")
        if not ok:
            falhas.append(nome)

    with tempfile.TemporaryDirectory() as base:
        pasta = os.path.join(base, 'conjunto')

        def nova_copia():
            shutil.rmtree(pasta, ignore_errors=True)
            shutil.copytree(os.path.join(ESPEC, 'registros-v1'), pasta)
        original = {k: os.path.join(pasta, *ref[k]['arquivo'].split('/')) for k in ('prova', 'problema')}

        def trocar():
            with open(original['prova'], 'wb') as f:
                f.write(LIXO_PROVA)
            with open(original['problema'], 'wb') as f:
                f.write(LIXO_PROBLEMA)

        def espiao(vistos, trocar_antes_de_ler=True):
            def provar(prova, problema):
                if trocar_antes_de_ler:
                    trocar()
                for caminho, k in ((prova, 'prova'), (problema, 'problema')):
                    with open(caminho, 'rb') as f:
                        vistos.append((k, hashlib.sha256(f.read()).hexdigest(), os.path.realpath(caminho)))
                return True
            return provar

        def viu_o_declarado(vistos):
            dentro = os.path.realpath(pasta)
            return len(vistos) == 2 and all(h == ref[k]['sha256'] and os.path.commonpath([dentro, c]) != dentro
                                            for k, h, c in vistos)

        # 1. troca depois do hash, no meio da prova
        nova_copia()
        vistos = []
        motivo, detalhe, pend = registros.conferir_registro(r, espiao(vistos), pasta)
        with open(original['prova'], 'rb') as f:
            trocado = f.read() == LIXO_PROVA
        caso('troca depois do hash: o Carcara recebe os bytes do hash, fora do conjunto',
             motivo is None and not pend and trocado and viu_o_declarado(vistos), f'{motivo} {detalhe} {pend} {vistos}')

        # 2. troca antes do hash
        nova_copia()
        trocar()
        vistos = []
        motivo, detalhe, _ = registros.conferir_registro(r, espiao(vistos, False), pasta)
        caso('troca antes do hash: recusa R8, e o Carcara não é chamado', motivo == 'R8' and not vistos, f'{motivo} {detalhe}')

        # 3. o caminho do leitor do GPT
        registros._independente()
        import registros_independente as ri
        nova_copia()
        vistos = []
        v = registros.no_leitor_do_gpt({'registro': r}, espiao(vistos), pasta)
        caso('leitor do GPT, troca durante a prova: aceito com os bytes do hash',
             v[0] == 'aceito' and viu_o_declarado(vistos), f'{v} {vistos}')

        nova_copia()
        trocar()
        v = registros.no_leitor_do_gpt({'registro': r}, espiao([], False), pasta)
        caso('leitor do GPT, troca antes do hash: recusado (R8)', v[:2] == ('recusado', 'R8'), str(v))

        # a troca entre o hash do leitor do GPT e a nossa leitura: a nossa leitura confere o hash de novo
        nova_copia()
        check_one = ri.check_one
        ri.check_one = lambda reg: (check_one(reg), trocar())[0]
        try:
            vistos = []
            v = registros.no_leitor_do_gpt({'registro': r}, espiao(vistos, False), pasta)
        finally:
            ri.check_one = check_one
        caso('leitor do GPT, troca depois do hash dele: recusado (R8), sem chamar o Carcara',
             v[:2] == ('recusado', 'R8') and not vistos, str(v))

    print('\n'.join(linhas))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(f"\n**CP04 · troca do arquivo depois do hash:** {len(linhas) - len(falhas)} de {len(linhas)} casos como esperado\n"
                    + ''.join(f'- {l}\n' for l in linhas))
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
