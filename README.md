# Nook

Biblioteca com login, cadastro sem convite e acesso permanente às obras publicadas.
Leitura PDF em texto ou páginas originais, CBZ, busca e sumário interno, marcadores,
favoritos e retomada individual. Next.js, React, TypeScript e Supabase.

Interface em preto e azul, adaptada ao celular, tablet e computador; temas
claro e sépia continuam disponíveis no leitor. A renovação e os testes estão em
[STATUS](docs/STATUS.md).

As quatro etapas estão implementadas. O projeto Supabase `nook-closed-beta`
recebeu o upgrade e as correções de segurança em 9/10/2026. Consulte
[PUBLICACAO](docs/PUBLICACAO.md) para o estado do deploy e os ajustes de Auth.

Para experimentar sem banco remoto, use Node compatível com `package.json`
(22.18 ou superior, antes de 25; recomendado 24):

```sh
npm ci
npm run demo:local
```

A administração inclui resumo do acervo, ações rápidas, organização de arquivos e
envio em lote com destino, revisão e confirmação. Com a demo em execução,
`node tests/admin-studio.mjs` verifica esses fluxos e layouts de 320 a 1440 pixels.

Espere `DEMO READY` e abra <http://127.0.0.1:3100/__demo>. Os dados são fictícios e
temporários. Cadastro aceita e-mail fictício novo; a demo não envia e-mails nem
valida senhas. Encerre com `Ctrl+C`.

Siga [MIGRATIONS](docs/MIGRATIONS.md) para instalação/upgrade, Auth e administrador;
[TESTE-LOCAL-RENDER](docs/TESTE-LOCAL-RENDER.md) para desenvolvimento e publicação.
Catálogo e buckets continuam privados. A administração publica cada obra explicitamente;
progresso, favoritos e marcadores permanecem separados por conta.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
npm run test:next-browser
npm run bench:catalog
```

[STATUS](docs/STATUS.md) e [relatório](docs/LANCAMENTO-NOOK.md) registram evidências
e limites. [E2E](docs/E2E.md) explica a homologação com Supabase isolado.
Builds, dependências e capturas são regeneráveis e ficam fora do Git.
