# Inventário de licenças

Conferência local de 30/10/2026, complementada em 31/10/2026, sem instalação. Inventário declarativo, não parecer jurídico. As entradas npm abaixo vêm dos metadados de `package-lock.json`; licença declarada não equivale a auditoria de cada arquivo distribuído. Pacotes opcionais de outras plataformas constam porque estão no lockfile.

## Peças principais

| Peça | Versão/referência | Licença e origem |
|---|---|---|
| Cosmos | package.json 0.1.0; base 63d31ff | AGPL-3.0-or-later, LICENSE e package.json |
| Dados próprios | corpus documentado em proveniencia-treino.md | CC BY 4.0 declarada pelo projeto; atribuição e origem por lote |
| Qwen3-4B | revisão do treino ainda a fixar; Ollama qwen3:4b 359d7dd4bcda é artefato distinto | Apache 2.0 no repositório específico https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE ; conferir revisão e quantização distribuídas |
| gpt-oss-120b via Groq | serviço opcional; pesos não distribuídos aqui | Pesos Apache 2.0 no [upstream oficial](https://github.com/openai/gpt-oss/blob/main/LICENSE); uso do serviço também sujeito ao contrato Groq https://console.groq.com/docs/legal/services-agreement |
| cvc5 | 1.4.2, conforme scripts/conferir-cpc.py | BSD modificada (3 cláusulas) no COPYING da tag cvc5-1.4.2, conferido em 30/10/2026: https://raw.githubusercontent.com/cvc5/cvc5/cvc5-1.4.2/COPYING ; dependências opcionais GPL/LGPL e build concreto exigem exame |
| Carcara | há versão/fork na documentação de provas; revisão por certificado | Apache 2.0 no upstream main, conferido em 30/10/2026: https://raw.githubusercontent.com/ufmg-smite/carcara/main/LICENSE ; confirmar a revisão/fork de cada certificado |
| Ethos | 0.2.5, referência 08e4aa4 conforme especificacao/provas-t1/README.md | BSD-3-Clause no [COPYING upstream main](https://github.com/cvc5/ethos/blob/main/COPYING), consultado 31/10; GMP associado LGPLv3. Não confirmado o COPYING do commit histórico 08e4aa4 nesta consulta. |
| Lean | 4.34.0, documentado em especificacao/provas-t1/README.md | Apache 2.0 no [upstream Lean](https://github.com/leanprover/lean4/blob/master/LICENSE); confirmar avisos da distribuição/revisão exata. Não executado nesta missão. |
| Logos | a4ab2f8, revisão indicada por cvc5 1.4.2, conforme README das provas | Licença não identificada no histórico documentado; execução CI sem redistribuição. Não inferir licença de Lean para o Logos. Esclarecimento com titular pendente antes de distribuir fonte/binário. |

## Dependências npm diretas e transitivas

Uma linha por localização no lockfile; versões duplicadas podem aparecer. `z3-solver` está incluído com sua versão resolvida, além de ser devDependency do projeto. Não houve alteração de dependência.

| Nome | Versão resolvida | Licença declarada | Origem registrada |
|---|---|---|---|
| @babel/code-frame | 7.29.7 | MIT | https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz |
| @babel/compat-data | 7.29.7 | MIT | https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.7.tgz |
| @babel/core | 7.29.7 | MIT | https://registry.npmjs.org/@babel/core/-/core-7.29.7.tgz |
| @babel/generator | 7.29.8 | MIT | https://registry.npmjs.org/@babel/generator/-/generator-7.29.8.tgz |
| @babel/helper-annotate-as-pure | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-annotate-as-pure/-/helper-annotate-as-pure-7.29.7.tgz |
| @babel/helper-compilation-targets | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.29.7.tgz |
| @babel/helper-globals | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.29.7.tgz |
| @babel/helper-module-imports | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.29.7.tgz |
| @babel/helper-module-transforms | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.29.7.tgz |
| @babel/helper-plugin-utils | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.29.7.tgz |
| @babel/helper-string-parser | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.29.7.tgz |
| @babel/helper-validator-identifier | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.29.7.tgz |
| @babel/helper-validator-option | 7.29.7 | MIT | https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.29.7.tgz |
| @babel/helpers | 7.29.10 | MIT | https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.10.tgz |
| @babel/parser | 7.29.9 | MIT | https://registry.npmjs.org/@babel/parser/-/parser-7.29.9.tgz |
| @babel/plugin-syntax-jsx | 7.29.7 | MIT | https://registry.npmjs.org/@babel/plugin-syntax-jsx/-/plugin-syntax-jsx-7.29.7.tgz |
| @babel/plugin-transform-react-jsx | 7.29.7 | MIT | https://registry.npmjs.org/@babel/plugin-transform-react-jsx/-/plugin-transform-react-jsx-7.29.7.tgz |
| @babel/plugin-transform-react-jsx-development | 7.29.7 | MIT | https://registry.npmjs.org/@babel/plugin-transform-react-jsx-development/-/plugin-transform-react-jsx-development-7.29.7.tgz |
| @babel/template | 7.29.7 | MIT | https://registry.npmjs.org/@babel/template/-/template-7.29.7.tgz |
| @babel/traverse | 7.29.10 | MIT | https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.10.tgz |
| @babel/types | 7.29.8 | MIT | https://registry.npmjs.org/@babel/types/-/types-7.29.8.tgz |
| @emnapi/runtime | 1.11.3 | MIT | https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.11.3.tgz |
| @img/colour | 1.1.0 | MIT | https://registry.npmjs.org/@img/colour/-/colour-1.1.0.tgz |
| @img/sharp-darwin-arm64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-darwin-arm64/-/sharp-darwin-arm64-0.35.5.tgz |
| @img/sharp-darwin-x64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-darwin-x64/-/sharp-darwin-x64-0.35.5.tgz |
| @img/sharp-freebsd-wasm32 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-freebsd-wasm32/-/sharp-freebsd-wasm32-0.35.5.tgz |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-darwin-arm64/-/sharp-libvips-darwin-arm64-1.3.4.tgz |
| @img/sharp-libvips-darwin-x64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-darwin-x64/-/sharp-libvips-darwin-x64-1.3.4.tgz |
| @img/sharp-libvips-linux-arm | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-arm/-/sharp-libvips-linux-arm-1.3.4.tgz |
| @img/sharp-libvips-linux-arm64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-arm64/-/sharp-libvips-linux-arm64-1.3.4.tgz |
| @img/sharp-libvips-linux-ppc64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-ppc64/-/sharp-libvips-linux-ppc64-1.3.4.tgz |
| @img/sharp-libvips-linux-riscv64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-riscv64/-/sharp-libvips-linux-riscv64-1.3.4.tgz |
| @img/sharp-libvips-linux-s390x | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-s390x/-/sharp-libvips-linux-s390x-1.3.4.tgz |
| @img/sharp-libvips-linux-x64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linux-x64/-/sharp-libvips-linux-x64-1.3.4.tgz |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-arm64/-/sharp-libvips-linuxmusl-arm64-1.3.4.tgz |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.4 | LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-x64/-/sharp-libvips-linuxmusl-x64-1.3.4.tgz |
| @img/sharp-linux-arm | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-arm/-/sharp-linux-arm-0.35.5.tgz |
| @img/sharp-linux-arm64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-arm64/-/sharp-linux-arm64-0.35.5.tgz |
| @img/sharp-linux-ppc64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-ppc64/-/sharp-linux-ppc64-0.35.5.tgz |
| @img/sharp-linux-riscv64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-riscv64/-/sharp-linux-riscv64-0.35.5.tgz |
| @img/sharp-linux-s390x | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-s390x/-/sharp-linux-s390x-0.35.5.tgz |
| @img/sharp-linux-x64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.35.5.tgz |
| @img/sharp-linuxmusl-arm64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linuxmusl-arm64/-/sharp-linuxmusl-arm64-0.35.5.tgz |
| @img/sharp-linuxmusl-x64 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-linuxmusl-x64/-/sharp-linuxmusl-x64-0.35.5.tgz |
| @img/sharp-wasm32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz |
| @img/sharp-webcontainers-wasm32 | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/@img/sharp-webcontainers-wasm32/-/sharp-webcontainers-wasm32-0.35.5.tgz |
| @img/sharp-win32-arm64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-win32-arm64/-/sharp-win32-arm64-0.35.5.tgz |
| @img/sharp-win32-ia32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-win32-ia32/-/sharp-win32-ia32-0.35.5.tgz |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.35.5.tgz |
| @jridgewell/gen-mapping | 0.3.13 | MIT | https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz |
| @jridgewell/remapping | 2.3.5 | MIT | https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz |
| @jridgewell/resolve-uri | 3.1.2 | MIT | https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz |
| @jridgewell/trace-mapping | 0.3.31 | MIT | https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz |
| @noble/curves | 2.4.0 | MIT | https://registry.npmjs.org/@noble/curves/-/curves-2.4.0.tgz |
| @noble/hashes | 2.4.0 | MIT | https://registry.npmjs.org/@noble/hashes/-/hashes-2.4.0.tgz |
| @oxc-project/types | 0.153.0 | MIT | https://registry.npmjs.org/@oxc-project/types/-/types-0.153.0.tgz |
| @preact/preset-vite | 2.10.6 | MIT | https://registry.npmjs.org/@preact/preset-vite/-/preset-vite-2.10.6.tgz |
| @prefresh/babel-plugin | 0.5.4 | MIT | https://registry.npmjs.org/@prefresh/babel-plugin/-/babel-plugin-0.5.4.tgz |
| @prefresh/core | 1.5.11 | MIT | https://registry.npmjs.org/@prefresh/core/-/core-1.5.11.tgz |
| @prefresh/utils | 1.2.1 | MIT | https://registry.npmjs.org/@prefresh/utils/-/utils-1.2.1.tgz |
| @prefresh/vite | 2.4.12 | MIT | https://registry.npmjs.org/@prefresh/vite/-/vite-2.4.12.tgz |
| @rollup/pluginutils | 4.2.1 | MIT | https://registry.npmjs.org/@rollup/pluginutils/-/pluginutils-4.2.1.tgz |
| picomatch | 2.3.2 | MIT | https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz |
| @radix-ui/react-compose-refs | 1.1.5 | MIT | https://registry.npmjs.org/@radix-ui/react-compose-refs/-/react-compose-refs-1.1.5.tgz |
| @radix-ui/react-slot | 1.5.0 | MIT | https://registry.npmjs.org/@radix-ui/react-slot/-/react-slot-1.5.0.tgz |
| @rolldown/binding-android-arm-eabi | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/-/binding-android-arm-eabi-1.2.13.tgz |
| @rolldown/binding-android-arm64 | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.2.13.tgz |
| @rolldown/binding-darwin-arm64 | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.2.13.tgz |
| @rolldown/binding-darwin-x64 | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.2.13.tgz |
| @rolldown/binding-freebsd-x64 | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.2.13.tgz |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.2.13.tgz |
| @rolldown/binding-linux-arm64-gnu | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.2.13.tgz |
| @rolldown/binding-linux-arm64-musl | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.2.13.tgz |
| @rolldown/binding-linux-ppc64-gnu | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.2.13.tgz |
| @rolldown/binding-linux-s390x-gnu | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.2.13.tgz |
| @rolldown/binding-linux-x64-gnu | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.2.13.tgz |
| @rolldown/binding-linux-x64-musl | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.2.13.tgz |
| @rolldown/binding-openharmony-arm64 | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.2.13.tgz |
| @rolldown/binding-win32-arm64-msvc | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.2.13.tgz |
| @rolldown/binding-win32-x64-msvc | 1.2.13 | MIT | https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.13.tgz |
| @rolldown/pluginutils | 1.0.1 | MIT | https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz |
| @rollup/pluginutils | 5.4.0 | MIT | https://registry.npmjs.org/@rollup/pluginutils/-/pluginutils-5.4.0.tgz |
| @scure/base | 2.4.0 | MIT | https://registry.npmjs.org/@scure/base/-/base-2.4.0.tgz |
| @scure/bip32 | 2.4.0 | MIT | https://registry.npmjs.org/@scure/bip32/-/bip32-2.4.0.tgz |
| @tailwindcss/node | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.3.tgz |
| lightningcss | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss/-/lightningcss-1.32.0.tgz |
| lightningcss-android-arm64 | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.32.0.tgz |
| lightningcss-darwin-arm64 | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.32.0.tgz |
| lightningcss-darwin-x64 | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.32.0.tgz |
| lightningcss-freebsd-x64 | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.32.0.tgz |
| lightningcss-linux-arm-gnueabihf | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.32.0.tgz |
| lightningcss-linux-arm64-gnu | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.32.0.tgz |
| lightningcss-linux-arm64-musl | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.32.0.tgz |
| lightningcss-linux-x64-gnu | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.32.0.tgz |
| lightningcss-linux-x64-musl | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.32.0.tgz |
| lightningcss-win32-arm64-msvc | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.32.0.tgz |
| lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.32.0.tgz |
| @tailwindcss/oxide | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide/-/oxide-4.3.3.tgz |
| @tailwindcss/oxide-android-arm64 | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-android-arm64/-/oxide-android-arm64-4.3.3.tgz |
| @tailwindcss/oxide-darwin-arm64 | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-darwin-arm64/-/oxide-darwin-arm64-4.3.3.tgz |
| @tailwindcss/oxide-darwin-x64 | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-darwin-x64/-/oxide-darwin-x64-4.3.3.tgz |
| @tailwindcss/oxide-freebsd-x64 | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-freebsd-x64/-/oxide-freebsd-x64-4.3.3.tgz |
| @tailwindcss/oxide-linux-arm-gnueabihf | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-linux-arm-gnueabihf/-/oxide-linux-arm-gnueabihf-4.3.3.tgz |
| @tailwindcss/oxide-linux-arm64-gnu | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-linux-arm64-gnu/-/oxide-linux-arm64-gnu-4.3.3.tgz |
| @tailwindcss/oxide-linux-arm64-musl | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-linux-arm64-musl/-/oxide-linux-arm64-musl-4.3.3.tgz |
| @tailwindcss/oxide-linux-x64-gnu | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-linux-x64-gnu/-/oxide-linux-x64-gnu-4.3.3.tgz |
| @tailwindcss/oxide-linux-x64-musl | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-linux-x64-musl/-/oxide-linux-x64-musl-4.3.3.tgz |
| @tailwindcss/oxide-wasm32-wasi | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-wasm32-wasi/-/oxide-wasm32-wasi-4.3.3.tgz |
| @tailwindcss/oxide-win32-arm64-msvc | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-win32-arm64-msvc/-/oxide-win32-arm64-msvc-4.3.3.tgz |
| @tailwindcss/oxide-win32-x64-msvc | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/oxide-win32-x64-msvc/-/oxide-win32-x64-msvc-4.3.3.tgz |
| @tailwindcss/vite | 4.3.3 | MIT | https://registry.npmjs.org/@tailwindcss/vite/-/vite-4.3.3.tgz |
| @types/chai | 5.2.3 | MIT | https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz |
| @types/deep-eql | 4.0.2 | MIT | https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz |
| @types/estree | 1.0.9 | MIT | https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz |
| @types/node | 22.20.5 | MIT | https://registry.npmjs.org/@types/node/-/node-22.20.5.tgz |
| @types/react | 19.3.0 | MIT | https://registry.npmjs.org/@types/react/-/react-19.3.0.tgz |
| @types/react-dom | 19.3.0 | MIT | https://registry.npmjs.org/@types/react-dom/-/react-dom-19.3.0.tgz |
| @typescript/typescript-aix-ppc64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-aix-ppc64/-/typescript-aix-ppc64-7.0.2.tgz |
| @typescript/typescript-darwin-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-darwin-arm64/-/typescript-darwin-arm64-7.0.2.tgz |
| @typescript/typescript-darwin-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-darwin-x64/-/typescript-darwin-x64-7.0.2.tgz |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-freebsd-arm64/-/typescript-freebsd-arm64-7.0.2.tgz |
| @typescript/typescript-freebsd-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-freebsd-x64/-/typescript-freebsd-x64-7.0.2.tgz |
| @typescript/typescript-linux-arm | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-arm/-/typescript-linux-arm-7.0.2.tgz |
| @typescript/typescript-linux-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-arm64/-/typescript-linux-arm64-7.0.2.tgz |
| @typescript/typescript-linux-loong64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-loong64/-/typescript-linux-loong64-7.0.2.tgz |
| @typescript/typescript-linux-mips64el | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-mips64el/-/typescript-linux-mips64el-7.0.2.tgz |
| @typescript/typescript-linux-ppc64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-ppc64/-/typescript-linux-ppc64-7.0.2.tgz |
| @typescript/typescript-linux-riscv64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-riscv64/-/typescript-linux-riscv64-7.0.2.tgz |
| @typescript/typescript-linux-s390x | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-s390x/-/typescript-linux-s390x-7.0.2.tgz |
| @typescript/typescript-linux-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-linux-x64/-/typescript-linux-x64-7.0.2.tgz |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-netbsd-arm64/-/typescript-netbsd-arm64-7.0.2.tgz |
| @typescript/typescript-netbsd-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-netbsd-x64/-/typescript-netbsd-x64-7.0.2.tgz |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-openbsd-arm64/-/typescript-openbsd-arm64-7.0.2.tgz |
| @typescript/typescript-openbsd-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-openbsd-x64/-/typescript-openbsd-x64-7.0.2.tgz |
| @typescript/typescript-sunos-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-sunos-x64/-/typescript-sunos-x64-7.0.2.tgz |
| @typescript/typescript-win32-arm64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-win32-arm64/-/typescript-win32-arm64-7.0.2.tgz |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/@typescript/typescript-win32-x64/-/typescript-win32-x64-7.0.2.tgz |
| @vitest/mocker | 5.0.3 | MIT | https://registry.npmjs.org/@vitest/mocker/-/mocker-5.0.3.tgz |
| estree-walker | 3.0.3 | MIT | https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz |
| magic-string | 1.4.3 | MIT | https://registry.npmjs.org/magic-string/-/magic-string-1.4.3.tgz |
| @vitest/spy | 5.0.3 | MIT | https://registry.npmjs.org/@vitest/spy/-/spy-5.0.3.tgz |
| assertion-error | 2.0.1 | MIT | https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz |
| async-mutex | 0.3.2 | MIT | https://registry.npmjs.org/async-mutex/-/async-mutex-0.3.2.tgz |
| babel-plugin-transform-hook-names | 1.0.2 | MIT | https://registry.npmjs.org/babel-plugin-transform-hook-names/-/babel-plugin-transform-hook-names-1.0.2.tgz |
| baseline-browser-mapping | 2.11.28 | Apache-2.0 | https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.28.tgz |
| boolbase | 1.0.0 | ISC | https://registry.npmjs.org/boolbase/-/boolbase-1.0.0.tgz |
| braces | 3.0.3 | MIT | https://registry.npmjs.org/braces/-/braces-3.0.3.tgz |
| browserslist | 4.29.3 | MIT | https://registry.npmjs.org/browserslist/-/browserslist-4.29.3.tgz |
| caniuse-lite | 1.0.30001815 | CC-BY-4.0 | https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001815.tgz |
| chai | 6.3.0 | MIT | https://registry.npmjs.org/chai/-/chai-6.3.0.tgz |
| class-variance-authority | 0.7.1 | Apache-2.0 | https://registry.npmjs.org/class-variance-authority/-/class-variance-authority-0.7.1.tgz |
| clsx | 2.1.1 | MIT | https://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz |
| convert-source-map | 2.0.0 | MIT | https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz |
| css-select | 5.2.2 | BSD-2-Clause | https://registry.npmjs.org/css-select/-/css-select-5.2.2.tgz |
| css-what | 6.2.2 | BSD-2-Clause | https://registry.npmjs.org/css-what/-/css-what-6.2.2.tgz |
| csstype | 3.2.3 | MIT | https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz |
| debug | 4.4.3 | MIT | https://registry.npmjs.org/debug/-/debug-4.4.3.tgz |
| detect-libc | 2.1.2 | Apache-2.0 | https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz |
| dom-serializer | 2.0.0 | MIT | https://registry.npmjs.org/dom-serializer/-/dom-serializer-2.0.0.tgz |
| domelementtype | 2.3.0 | BSD-2-Clause | https://registry.npmjs.org/domelementtype/-/domelementtype-2.3.0.tgz |
| domhandler | 5.0.3 | BSD-2-Clause | https://registry.npmjs.org/domhandler/-/domhandler-5.0.3.tgz |
| domutils | 3.2.2 | BSD-2-Clause | https://registry.npmjs.org/domutils/-/domutils-3.2.2.tgz |
| electron-to-chromium | 1.5.452 | ISC | https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.452.tgz |
| enhanced-resolve | 5.26.0 | MIT | https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.26.0.tgz |
| entities | 4.5.0 | BSD-2-Clause | https://registry.npmjs.org/entities/-/entities-4.5.0.tgz |
| es-module-lexer | 2.3.2 | MIT | https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.2.tgz |
| escalade | 3.2.0 | MIT | https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz |
| estree-walker | 2.0.2 | MIT | https://registry.npmjs.org/estree-walker/-/estree-walker-2.0.2.tgz |
| expect-type | 1.4.0 | Apache-2.0 | https://registry.npmjs.org/expect-type/-/expect-type-1.4.0.tgz |
| fake-indexeddb | 6.2.5 | Apache-2.0 | https://registry.npmjs.org/fake-indexeddb/-/fake-indexeddb-6.2.5.tgz |
| fdir | 6.5.0 | MIT | https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz |
| fill-range | 7.1.1 | MIT | https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz |
| fsevents | 2.3.3 | MIT | https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz |
| gensync | 1.0.0-beta.2 | MIT | https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz |
| graceful-fs | 4.2.11 | ISC | https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz |
| he | 1.2.0 | MIT | https://registry.npmjs.org/he/-/he-1.2.0.tgz |
| is-number | 7.0.0 | MIT | https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz |
| jiti | 2.7.0 | MIT | https://registry.npmjs.org/jiti/-/jiti-2.7.0.tgz |
| js-tokens | 4.0.0 | MIT | https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz |
| jsesc | 3.1.0 | MIT | https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz |
| json5 | 2.2.3 | MIT | https://registry.npmjs.org/json5/-/json5-2.2.3.tgz |
| kolorist | 1.8.0 | MIT | https://registry.npmjs.org/kolorist/-/kolorist-1.8.0.tgz |
| lightningcss | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz |
| lightningcss-android-arm64 | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.33.0.tgz |
| lightningcss-darwin-arm64 | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.33.0.tgz |
| lightningcss-darwin-x64 | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.33.0.tgz |
| lightningcss-freebsd-x64 | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.33.0.tgz |
| lightningcss-linux-arm-gnueabihf | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.33.0.tgz |
| lightningcss-linux-arm64-gnu | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.33.0.tgz |
| lightningcss-linux-arm64-musl | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.33.0.tgz |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.33.0.tgz |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.33.0.tgz |
| lightningcss-win32-arm64-msvc | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.33.0.tgz |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 | https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.33.0.tgz |
| lru-cache | 5.1.1 | ISC | https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz |
| magic-string | 0.30.21 | MIT | https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz |
| micromatch | 4.0.8 | MIT | https://registry.npmjs.org/micromatch/-/micromatch-4.0.8.tgz |
| picomatch | 2.3.2 | MIT | https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz |
| ms | 2.1.3 | MIT | https://registry.npmjs.org/ms/-/ms-2.1.3.tgz |
| nanoid | 3.3.20 | MIT | https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz |
| node-html-parser | 6.1.13 | MIT | https://registry.npmjs.org/node-html-parser/-/node-html-parser-6.1.13.tgz |
| node-releases | 2.0.58 | MIT | https://registry.npmjs.org/node-releases/-/node-releases-2.0.58.tgz |
| nth-check | 2.1.1 | BSD-2-Clause | https://registry.npmjs.org/nth-check/-/nth-check-2.1.1.tgz |
| obug | 2.2.1 | MIT | https://registry.npmjs.org/obug/-/obug-2.2.1.tgz |
| picocolors | 1.1.1 | ISC | https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz |
| picomatch | 4.0.7 | MIT | https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz |
| postcss | 8.5.29 | MIT | https://registry.npmjs.org/postcss/-/postcss-8.5.29.tgz |
| preact | 11.0.1 | MIT | https://registry.npmjs.org/preact/-/preact-11.0.1.tgz |
| react | 19.3.1 | MIT | https://registry.npmjs.org/react/-/react-19.3.1.tgz |
| react-dom | 19.3.1 | MIT | https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz |
| rolldown | 1.2.13 | MIT | https://registry.npmjs.org/rolldown/-/rolldown-1.2.13.tgz |
| scheduler | 0.28.0 | MIT | https://registry.npmjs.org/scheduler/-/scheduler-0.28.0.tgz |
| semver | 6.3.1 | ISC | https://registry.npmjs.org/semver/-/semver-6.3.1.tgz |
| sharp | 0.35.5 | Apache-2.0 | https://registry.npmjs.org/sharp/-/sharp-0.35.5.tgz |
| semver | 7.8.5 | ISC | https://registry.npmjs.org/semver/-/semver-7.8.5.tgz |
| simple-code-frame | 1.3.0 | MIT | https://registry.npmjs.org/simple-code-frame/-/simple-code-frame-1.3.0.tgz |
| source-map | 0.7.6 | BSD-3-Clause | https://registry.npmjs.org/source-map/-/source-map-0.7.6.tgz |
| source-map-js | 1.2.2 | BSD-3-Clause | https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz |
| stack-trace | 1.0.0 | MIT | https://registry.npmjs.org/stack-trace/-/stack-trace-1.0.0.tgz |
| std-env | 4.3.0 | MIT | https://registry.npmjs.org/std-env/-/std-env-4.3.0.tgz |
| tailwind-merge | 3.7.0 | MIT | https://registry.npmjs.org/tailwind-merge/-/tailwind-merge-3.7.0.tgz |
| tailwindcss | 4.3.3 | MIT | https://registry.npmjs.org/tailwindcss/-/tailwindcss-4.3.3.tgz |
| tapable | 2.3.3 | MIT | https://registry.npmjs.org/tapable/-/tapable-2.3.3.tgz |
| tinybench | 6.2.1 | MIT | https://registry.npmjs.org/tinybench/-/tinybench-6.2.1.tgz |
| tinyexec | 1.3.1 | MIT | https://registry.npmjs.org/tinyexec/-/tinyexec-1.3.1.tgz |
| tinyglobby | 0.2.17 | MIT | https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz |
| to-regex-range | 5.0.1 | MIT | https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz |
| tslib | 2.8.1 | 0BSD | https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz |
| tweetnacl | 1.0.3 | Unlicense | https://registry.npmjs.org/tweetnacl/-/tweetnacl-1.0.3.tgz |
| typescript | 7.0.2 | Apache-2.0 | https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz |
| undici-types | 6.21.0 | MIT | https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz |
| update-browserslist-db | 1.3.4 | MIT | https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.3.4.tgz |
| vite | 8.3.4 | MIT | https://registry.npmjs.org/vite/-/vite-8.3.4.tgz |
| vite-plugin-singlefile | 2.3.3 | MIT | https://registry.npmjs.org/vite-plugin-singlefile/-/vite-plugin-singlefile-2.3.3.tgz |
| vite-prerender-plugin | 0.5.14 | MIT | https://registry.npmjs.org/vite-prerender-plugin/-/vite-prerender-plugin-0.5.14.tgz |
| vitest | 5.0.3 | MIT | https://registry.npmjs.org/vitest/-/vitest-5.0.3.tgz |
| magic-string | 1.4.3 | MIT | https://registry.npmjs.org/magic-string/-/magic-string-1.4.3.tgz |
| why-is-node-running | 3.2.1 | MIT | https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-3.2.1.tgz |
| yallist | 3.1.1 | ISC | https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz |
| z3-solver | 5.2.0 | MIT | https://registry.npmjs.org/z3-solver/-/z3-solver-5.2.0.tgz |
| zimmerframe | 1.1.5 | MIT | https://registry.npmjs.org/zimmerframe/-/zimmerframe-1.1.5.tgz |

## Pontos para revisão

Ausência de licença, expressões compostas, dependências copyleft e condições dos binários externos precisam de conferência documental antes de redistribuição. Licenças permissivas exigem preservar avisos; não se conclui incompatibilidade somente pelo nome. Uma API não herda a licença AGPL por ser chamada pelo programa. Código, pesos, corpus e serviço têm instrumentos distintos.

Este inventário não conclui compatibilidade jurídica de todo o produto. Permanecem pendentes licenças exatas dos artefatos formais e revisão do modelo base. Não foram lidos segredos, arquivos fechados ou conteúdo de usuário.

Fontes externas foram apenas lidas, nunca executadas. A tentativa inicial de LICENSE em cvc5/ethos/main retornou 404. Complemento de 31/10: o arquivo correto COPYING no upstream main declara BSD-3-Clause e descreve GMP sob LGPLv3; o arquivo na revisão abreviada histórica não foi recuperado pelo navegador de pesquisa, logo a confirmação daquele artefato permanece pendente. Apache/BSD no upstream não comprova, sozinho, os avisos de um binário ou fork distribuído.

## Alertas específicos para revisão, sem conclusão jurídica

| Peça/classe | Sinalização | Limite e ação antes de redistribuir |
|---|---|---|
| Logos sem licença identificada | Alta prioridade documental | Disponibilidade do código não equivale a licença de redistribuição; obter permissão/licença. Não distribuir binário só porque o Lean é Apache. |
| LGPL-3.0-or-later e expressões AND com LGPL | Atenção a obrigações de componentes combinados | Conferir vinculação, possibilidade de substituição, avisos e fonte correspondente da distribuição concreta; o nome no lockfile não encerra análise. |
| MPL-2.0 | Copyleft por arquivo e condições de combinação | Examinar arquivos modificados e condições de licenciamento secundário na versão concreta, sem declarar incompatibilidade automática com AGPL. |
| Apache/MIT/BSD/ISC/Unlicense/0BSD | Avisos e origem | Preservar licenças/avisos aplicáveis; código Cosmos não substitui licença de componentes. |
| CC-BY-4.0 em dados/lockfile e OFL em fontes | Objetos com regimes próprios | Separar dados, código e fontes; atribuição, origem e modificações devem acompanhar os objetos. Não rebatizar tudo como AGPL. |
| Groq como serviço | Contrato distinto da licença dos pesos | Não distribuir pesos neste fluxo; reavaliar condições do serviço quando for efetivamente usado, sem contratação nesta missão. |
| cvc5/Ethos/GMP e forks Carcara | Dependências e configuração de build | Conferir revisões e opções dos binários efetivos. Apache/BSD no repositório principal não autentica composição de todo binário. |

### Cobertura declarativa do lockfile

242 localizações npm (diretas/transitivas/opcionais), sem instalação ou alteração de package/lockfile. Contagem por declaração, expressões AND contam como uma entrada:

| Declaração | Localizações |
|---|---:|
| 0BSD | 1 |
| Apache-2.0 | 39 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 2 |
| CC-BY-4.0 | 1 |
| ISC | 8 |
| LGPL-3.0-or-later | 10 |
| MIT | 145 |
| MPL-2.0 | 24 |
| Unlicense | 1 |

Há ainda avisos já incluídos em LICENSES/, entre eles OFL-JetBrainsMono e Unicode-3.0. A presença desses avisos não demonstra que a lista cobre cada recurso visual de terceiros. Pendências explícitas: revisão dos pesos/quantização, direitos e atribuição do corpus por lote, licença Logos e composição exata dos binários formais. Não houve instalação, compilação externa, aceite de termos, download de pesos ou parecer jurídico.
