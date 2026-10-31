"""Executado pelo operador no HAR local. Exporta somente origens/métodos/status, sem URL completa ou credenciais."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit


def resumir(dados):
    if not isinstance(dados, dict) or not isinstance(dados.get("log"), dict):
        raise ValueError("HAR inválido")
    entradas = dados["log"].get("entries")
    if not isinstance(entradas, list):
        raise ValueError("HAR sem lista de entradas")
    origens = {}
    externos = 0
    nao_rede = 0
    invalidas = 0
    for e in entradas:
        try:
            pedido = e["request"]
            u = urlsplit(pedido["url"])
            if u.scheme not in ("http", "https", "ws", "wss"):
                nao_rede += 1
                continue
            host = u.hostname
            if not host:
                raise ValueError()
            porta = u.port or (443 if u.scheme in ("https", "wss") else 80)
            # Sem userinfo, caminho, query, fragmento, corpo, cookies ou headers.
            destino = (u.scheme, host, porta)
            item = origens.setdefault(destino, {"protocolo": u.scheme, "host": host, "porta": porta, "pedidos": 0, "status": {}})
            status = e.get("response", {}).get("status")
            if not isinstance(status, int) or isinstance(status, bool) or not 0 <= status <= 599:
                raise ValueError()
            item["pedidos"] += 1
            item["status"][str(status)] = item["status"].get(str(status), 0) + 1
            if host not in ("127.0.0.1", "localhost", "::1"):
                externos += 1
        except (KeyError, TypeError, ValueError, AttributeError):
            invalidas += 1
    return {"formato": "cosmos-m12-har-resumo-v1", "entradas": len(entradas), "entradasInvalidas": invalidas,
            "naoRede": nao_rede, "tentativasExternas": externos,
            "origens": [origens[k] for k in sorted(origens)],
            "resultado": "sem-destino-externo-no-HAR" if externos == 0 and invalidas == 0 and entradas else "requer-revisao",
            "limite": "Não comprova sozinho três perguntas, Preserve log ou captura completa. Conferência manual necessária."}


def main():
    if len(sys.argv) != 3:
        raise ValueError("Uso: python -I -X utf8 -B scripts/m12-resumir-har.py entrada.har resumo.json")
    fonte, destino = map(Path, sys.argv[1:])
    if fonte.stat().st_size > 100 * 1024 * 1024:
        raise ValueError("HAR excede 100 MiB")
    dados = json.loads(fonte.read_text(encoding="utf-8-sig"))
    saida = resumir(dados)
    with destino.open("x", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(saida, ensure_ascii=False, indent=2) + "\n")
    print("Resumo sanitizado gravado. Não compartilhe o HAR bruto.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, TypeError):
        print("HAR não processado; confira formato, tamanho e saída nova. Nenhum conteúdo exibido.", file=sys.stderr)
        sys.exit(1)
