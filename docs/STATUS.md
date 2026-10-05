# Estado verificável do Nook

O Nook é um leitor privado de Light Novels em PDF e Mangás/Manhwas em CBZ. O visual da biblioteca, das obras e do leitor PDF foi preservado.

## Verificado localmente

- `npm test`: migrations, RLS, isolamento de progresso, favoritos, marcadores, Storage privado, validação de PDF/CBZ e ordenação natural das páginas.
- `npm run lint`, `npm run typecheck` e `npm run build`.
- O teste de navegador cobre o worker CBZ com imagens reais e a tela de acesso em desktop e celular. Requer Chromium e servidor local.

## Funcionalidades

| Área | Estado |
|---|---|
| Biblioteca | Busca, categorias, favoritos, capas privadas, histórico recente ordenado por `reading_progress.updated_at` |
| Obra | Capa, sinopse, volumes, capítulos e continuação do último capítulo lido |
| PDF | Texto contínuo, modo página, ilustrações, índice, marcadores, progresso e navegação entre capítulos |
| CBZ | ZIP validado, JPG/PNG/WebP, ordenação natural, leitura vertical contínua, extração próxima à viewport e progresso por página/posição |
| Administração | Obras, volumes, capas, upload individual e em lote de PDF/CBZ, organização e moderação |
| Privacidade | Auth, RLS, buckets privados, URLs assinadas e isolamento de dados pessoais |

## Pendente de homologação autenticada

Não há projeto Supabase separado configurado neste repositório. Por isso, a rota autenticada de upload, a restauração de progresso entre dispositivos, os marcadores, as capas e o leitor em aparelhos reais ainda precisam ser verificados em um clone aprovado. O build e os testes locais não substituem essa verificação.

A migration 012 não foi aplicada remotamente. Ela aborta se houver registros ou objetos legados incompatíveis; faça backup e resolva esses registros antes de aplicá-la. Consulte [MIGRATIONS.md](MIGRATIONS.md) e [BETA.md](BETA.md).
