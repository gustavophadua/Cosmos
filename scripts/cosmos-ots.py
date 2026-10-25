"""OpenTimestamps sidecar: biblioteca oficial, vínculo SHA-256 e Bitcoin Core.
Não modifica o pacote v1. Calendário recebido não significa Bitcoin confirmado.
"""
import sys, json, hashlib, base64, os, io, urllib.request, urllib.parse
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'node_modules' / '.cosmos-ots-python'))
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.serialize import BytesDeserializationContext, BytesSerializationContext
from opentimestamps.core.op import OpSHA256, OpAppend
from opentimestamps.calendar import RemoteCalendar
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation

TARGET_PRINCIPAL = ROOT / 'public' / 'cosmos-502426c-resumo.txt'
# outro alvo (por exemplo, a raiz do checkpoint) pelo ambiente; o status público só se grava para o alvo principal
TARGET = Path(os.environ['COSMOS_OTS_ALVO']).resolve() if os.environ.get('COSMOS_OTS_ALVO') else TARGET_PRINCIPAL
PROOF = Path(str(TARGET) + '.ots')

def inspect(proof, target, verify=False):
    if len(proof) > 1024 * 1024 or len(target) > 1024 * 1024:
        raise ValueError('Limite de tamanho OTS excedido')
    detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(proof))
    if detached.file_hash_op.__class__.__name__ != 'OpSHA256' or detached.timestamp.msg != hashlib.sha256(target).digest():
        raise ValueError('vínculo SHA-256 divergente')
    attestations = list(detached.timestamp.all_attestations())
    pending = [str(att.uri) for msg, att in attestations if isinstance(att, PendingAttestation)]
    result = dict(estado='enviado_calendario' if pending else 'pendente', vinculoValido=True,
                  sha256_alvo=hashlib.sha256(target).hexdigest(), calendarios=pending,
                  confirmacaoVerificada=False)
    if verify:
        for msg, att in attestations:
            if not isinstance(att, BitcoinBlockHeaderAttestation):
                continue
            try:
                from bitcoin.core import CBlockHeader
                rpc_url = os.environ.get('COSMOS_BITCOIN_RPC_URL')
                if not rpc_url or urllib.parse.urlparse(rpc_url).hostname not in ('127.0.0.1', 'localhost', '::1'):
                    raise ValueError('Bitcoin Core local não configurado')
                def rpc(method, params=[]):
                    body = json.dumps(dict(jsonrpc='1.0', id='cosmos-readonly', method=method, params=params)).encode()
                    request = urllib.request.Request(rpc_url, data=body, headers={'Content-Type': 'application/json'})
                    user, password = os.environ.get('COSMOS_BITCOIN_RPC_USER', ''), os.environ.get('COSMOS_BITCOIN_RPC_PASSWORD', '')
                    if user or password:
                        request.add_header('Authorization', 'Basic ' + base64.b64encode((user + ':' + password).encode()).decode())
                    with urllib.request.urlopen(request, timeout=5) as response:
                        reply = json.load(response)
                    if reply.get('error'):
                        raise ValueError('Bitcoin Core recusou consulta')
                    return reply['result']
                height = rpc('getblockcount')
                block_hash = rpc('getblockhash', [att.height])
                header = CBlockHeader.deserialize(bytes.fromhex(rpc('getblockheader', [block_hash, False])))
                att.verify_against_blockheader(msg, header)
                confirmations = height - att.height + 1
                if confirmations < 6:
                    result['erro'] = 'Aguardando seis confirmações Bitcoin'
                    continue
                result.update(estado='confirmado_bitcoin', confirmacaoVerificada=True,
                              fonte='bitcoin-core', altura=att.height, bloco=block_hash,
                              confirmacoes=confirmations)
                break
            except Exception:
                result['erro'] = 'Bitcoin Core indisponível ou atestação não verificável'
    return result

# Cabeçalhos públicos: sem nó Bitcoin próprio, o cabeçalho do bloco é buscado em fontes independentes e só vale
# quando pelo menos duas concordam em tudo: o hash do bloco, a prova de trabalho e a raiz Merkle da atestação.
FONTES_PUBLICAS = ('https://mempool.space/api', 'https://blockstream.info/api', 'blockcypher')

def _get(url, timeout=20):
    request = urllib.request.Request(url, headers={'User-Agent': 'cosmos-ots-verificador'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(1024 * 1024).decode().strip()

def _cabecalho_sem_prazo(fonte, height):
    if fonte == 'blockcypher':
        # a BlockCypher dá os campos do cabeçalho (não os 80 bytes): o cabeçalho é remontado a partir deles
        import datetime
        b = json.loads(_get('https://api.blockcypher.com/v1/btc/main/blocks/%d?txstart=0&limit=1' % height))
        tempo = int(datetime.datetime.strptime(b['time'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp())
        raw = (b['ver'].to_bytes(4, 'little') + bytes.fromhex(b['prev_block'])[::-1] + bytes.fromhex(b['mrkl_root'])[::-1]
               + tempo.to_bytes(4, 'little') + b['bits'].to_bytes(4, 'little') + b['nonce'].to_bytes(4, 'little'))
        return b['hash'], raw, int(json.loads(_get('https://api.blockcypher.com/v1/btc/main'))['height'])
    block_hash = _get('%s/block-height/%d' % (fonte, height))
    return block_hash, bytes.fromhex(_get('%s/block/%s/header' % (fonte, block_hash))), int(_get('%s/blocks/tip/height' % fonte))

def _cabecalho(fonte, height, prazo=45):
    # um prazo para a fonte inteira: o timeout do urlopen vale por operação de rede, e uma fonte fora do ar travava minutos
    import threading
    saida = {}
    def rodar():
        try:
            saida['ok'] = _cabecalho_sem_prazo(fonte, height)
        except Exception as exc:
            saida['erro'] = exc
    t = threading.Thread(target=rodar, daemon=True)
    t.start(); t.join(prazo)
    if 'ok' in saida:
        return saida['ok']
    raise saida.get('erro') or TimeoutError('a fonte não respondeu em %d s' % prazo)

def verify_public(proof, target, minimo=2, tentativas=2):
    from bitcoin.core import CBlockHeader
    import datetime, time
    result = inspect(proof, target)
    detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(proof))
    vistas = set()
    for msg, att in detached.timestamp.all_attestations():
        if not isinstance(att, BitcoinBlockHeaderAttestation) or (att.height, msg) in vistas:
            continue
        vistas.add((att.height, msg))
        acordos, fontes = {}, {}
        for fonte in FONTES_PUBLICAS:
            nome = urllib.parse.urlparse(fonte).hostname or fonte
            for tentativa in range(tentativas):
                try:
                    block_hash, raw, tip = _cabecalho(fonte, att.height)
                    header = CBlockHeader.deserialize(raw)
                    if header.GetHash()[::-1].hex() != block_hash:
                        raise ValueError('hash do cabeçalho diverge do bloco informado')
                    exp, mant = header.nBits >> 24, header.nBits & 0xffffff
                    if int.from_bytes(header.GetHash(), 'little') > mant * (1 << (8 * (exp - 3))):
                        raise ValueError('prova de trabalho inválida')
                    att.verify_against_blockheader(msg, header)
                    fontes[nome] = dict(bloco=block_hash, confirmacoes=tip - att.height + 1)
                    acordos.setdefault((block_hash, header.nTime), []).append(nome)
                    break
                except Exception as exc:
                    fontes[nome] = dict(erro=type(exc).__name__)
                    time.sleep(2 * (tentativa + 1))
            # duas fontes concordando bastam: cada cabeçalho já passou pela prova de trabalho e pela raiz Merkle
            if len(acordos) == 1 and len(next(iter(acordos.values()))) >= minimo:
                break
        if not acordos:
            continue
        (block_hash, tempo), quem = max(acordos.items(), key=lambda kv: len(kv[1]))
        confirmacoes = min(fontes[n]['confirmacoes'] for n in quem)
        if len(quem) < minimo or len(acordos) > 1:
            result['erro'] = 'Fontes públicas insuficientes ou divergentes para o bloco %d' % att.height
            continue
        if confirmacoes < 6:
            result['erro'] = 'Aguardando seis confirmações Bitcoin'
            continue
        result.update(estado='confirmado_bitcoin', confirmacaoVerificada=True, fonte='cabecalhos-publicos',
                      fontes=sorted(quem), altura=att.height, bloco=block_hash, confirmacoes=confirmacoes,
                      tempo_bloco_utc=datetime.datetime.fromtimestamp(tempo, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                      sha256_prova=hashlib.sha256(proof).hexdigest(),
                      conferido_em_utc=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                      limite='Cabeçalho conferido em fontes públicas independentes, não num nó Bitcoin próprio. '
                             'Prova que o resumo existia antes do bloco; não prova a verdade das afirmações.')
        result.pop('erro', None)
        break
    return result

CALENDARS = ('https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org')
def save(detached):
    ctx = BytesSerializationContext()
    detached.serialize(ctx)
    PROOF.write_bytes(ctx.getbytes())

def stamp(value):
    detached = DetachedTimestampFile.from_fd(OpSHA256(), io.BytesIO(value))
    nonce = detached.timestamp.ops.add(OpAppend(os.urandom(16))).ops.add(OpSHA256())
    received = 0
    for url in CALENDARS:
        try:
            nonce.merge(RemoteCalendar(url).submit(nonce.msg, timeout=12))
            received += 1
        except Exception as exc:
            print('Calendário indisponível: ' + url + ' (' + type(exc).__name__ + ')', file=sys.stderr)
    if not received:
        raise ValueError('Nenhum calendário respondeu; nenhuma prova emitida')
    save(detached)

def upgrade():
    detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(PROOF.read_bytes()))
    for msg, att in list(detached.timestamp.all_attestations()):
        if isinstance(att, PendingAttestation) and str(att.uri) in CALENDARS:
            # Mescla a resposta no nó correspondente ao compromisso, não na raiz.
            def visit(node):
                if node.msg == msg:
                    node.merge(RemoteCalendar(str(att.uri)).get_timestamp(msg, timeout=12))
                    return
                for child in list(node.ops.values()):
                    visit(child)
            try:
                visit(detached.timestamp)
            except Exception as exc:
                print('Upgrade pendente: ' + type(exc).__name__, file=sys.stderr)
    save(detached)

if __name__ == '__main__':
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else 'inspect'
        if mode == 'stamp':
            data = json.loads((ROOT / 'src/dados/elos-assinados.json').read_text())
            value = (data['resumo_final'] + '\n').encode('ascii')
            if TARGET.exists() and TARGET.read_bytes() != value:
                raise ValueError('Alvo OTS existente divergente; preservado')
            TARGET.write_bytes(value)
            if not PROOF.exists():
                stamp(value)
            result = inspect(PROOF.read_bytes(), value)
        elif mode == 'carimbar':
            # carimba um alvo que já existe, se ele ainda não tem prova; nunca troca uma prova existente
            if not PROOF.exists():
                stamp(TARGET.read_bytes())
            result = inspect(PROOF.read_bytes(), TARGET.read_bytes())
        elif mode == 'estado':
            # o estado da prova; com atestação Bitcoin, a conferência pelos cabeçalhos públicos
            proof, target = PROOF.read_bytes(), TARGET.read_bytes()
            detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(proof))
            tem_bitcoin = any(isinstance(att, BitcoinBlockHeaderAttestation) for _, att in detached.timestamp.all_attestations())
            result = verify_public(proof, target) if tem_bitcoin else inspect(proof, target)
        elif mode == 'verify-publico':
            result = verify_public(PROOF.read_bytes(), TARGET.read_bytes())
            if not result.get('confirmacaoVerificada'):
                print(json.dumps(result, ensure_ascii=True))
                sys.exit(1)
        elif mode in ('upgrade', 'verify'):
            if mode == 'upgrade':
                upgrade()
            result = inspect(PROOF.read_bytes(), TARGET.read_bytes(), verify=True)
        elif mode == 'inspect':
            raw = sys.stdin.buffer.read(3 * 1024 * 1024 + 1)
            if len(raw) > 3 * 1024 * 1024:
                raise ValueError('Limite de entrada excedido')
            request = json.loads(raw)
            result = inspect(base64.b64decode(request['prova'], validate=True), base64.b64decode(request['alvo'], validate=True))
        else:
            raise ValueError('Operação desconhecida')
        print(json.dumps(result, ensure_ascii=True))
        if mode not in ('inspect', 'estado', 'carimbar') and TARGET == TARGET_PRINCIPAL:
            (ROOT / 'public/cosmos-ots-status.json').write_text(json.dumps(result, indent=2) + '\n')
    except Exception as exc:
        print(json.dumps({'erro': str(exc)}, ensure_ascii=True))
        sys.exit(1)
