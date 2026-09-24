# Nook — branch do beta fechado

Implementação em `feat/nook-closed-beta`, baseada em `origin/main` no commit `1a019c1`.

**Ainda não liberada para iniciar o beta.** O código, a migração e os testes locais estão disponíveis. Falta o projeto Supabase de teste e a homologação autenticada ponta a ponta. Nenhum banco remoto foi modificado e nenhum deploy foi feito.

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm start -- -p 3100
# Em outro terminal, depois de instalar o Chromium:
npx playwright install chromium
npm run test:browser
```

Use Node 24.21 (versão verificada) e preencha somente as duas variáveis públicas em `.env.local` com o projeto de teste. A aplicação exige a migração 005; não a aponte para o banco antigo sem migrar primeiro uma cópia aprovada.

- [Configuração, backup, reversão e roteiro de sete dias](docs/BETA.md)
- [Resultados e limitações de cada recurso](docs/STATUS.md)
- [Captura desktop](docs/screenshots/access-desktop.png) e [cadastro no celular](docs/screenshots/signup-mobile.png)

O catálogo continua privado. Obras antigas ficam disponíveis ao administrador; cada obra deve ser liberada conscientemente aos convidados, com registro de autorização de compartilhamento. Favoritos, progresso e marcadores são separados por conta.
