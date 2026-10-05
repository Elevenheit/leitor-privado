# Guia operacional do beta Nook

## Preparação

Use um projeto Supabase separado para homologação. Configure no aplicativo somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Chaves de serviço e senhas ficam fora do repositório e do cliente.

Antes de migrar qualquer catálogo existente, interrompa escritas, faça um dump PostgreSQL e copie os objetos dos buckets privados `novels`, `covers` e `profiles`. `node scripts/backup.mjs` faz a captura local com manifesto SHA-256 usando `NOOK_BACKUP_URL`, `NOOK_BACKUP_SERVICE_KEY` e `PGSERVICE` no processo administrativo. Verifique o backup com `node scripts/verify-backup.mjs` e ensaie a restauração em ambiente descartável. Não restaure um dump completo sobre schemas gerenciados do Supabase sem revisar os objetos.

## Banco e acesso

Siga [MIGRATIONS.md](MIGRATIONS.md) em ordem, até a migration 012. Ela preserva os PDFs existentes e exige que registros e objetos incompatíveis sejam resolvidos antes da execução. Execute `supabase/verify-preservation.sql` antes e depois e compare livros, caminhos, progresso, marcadores e favoritos. Nenhuma migration foi aplicada a um banco remoto durante esta refatoração.

Para um projeto novo, crie a conta administradora no Auth e promova essa conta explicitamente conforme [ADMIN-BOOTSTRAP.md](ADMIN-BOOTSTRAP.md). O cadastro do beta depende de convites em `public.beta_invites`; a aplicação não gerencia convites pela interface. No projeto de teste, habilite email/senha e configure o fluxo de confirmação de email de acordo com o roteiro de acesso do beta.

## Publicação

Entre como administrador em **Administrar acervo**. Crie uma obra do tipo Light Novel, Mangá ou Manhwa, depois crie ou escolha o volume. O upload individual e o lote aceitam PDF e CBZ. Confira o tipo detectado, número e título de cada capítulo antes de enviar. O lote mostra progresso individual e geral, permite cancelar e tentar novamente. O Storage permanece privado.

Use **Autorização de compartilhamento e moderação** para registrar a autorização da obra e liberá-la aos convidados. Obras novas começam restritas. Restringir uma obra impede novas URLs assinadas; URLs já emitidas podem funcionar até expirar.

## Verificação antes de abrir o beta

1. Entre e saia com contas administradora e leitora; confira convites, expiração e isolamento por RLS.
2. Crie e edite obra, volume e capítulo; confira capa, favoritos, busca, exclusão e organização.
3. Envie PDF individual e múltiplos PDFs em lote. Abra o leitor em texto e página; teste ilustrações, marcadores, índice, capítulo anterior/próximo e retomada.
4. Envie CBZ individual e múltiplos CBZ em lote. Teste nomes 1, 2, 10, JPG/PNG/WebP, arquivos auxiliares ignorados e rejeição de ZIP corrompido.
5. Leia CBZ no celular, tablet e desktop; role até o meio e fim, feche e reabra para conferir página, posição e percentual.
6. Confira que extensões e MIME fora de PDF/CBZ são rejeitados, que capas seguem privadas e que leitores não veem obras restritas.
7. Execute `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` e o teste de navegador local. Revise a interface em 320, 375, 430, 768, 1024 e 1440 pixels.

Os testes locais não simulam o serviço Supabase Auth nem substituem a verificação autenticada no projeto separado.
