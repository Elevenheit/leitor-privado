# Instalação, upgrade e conta — 9/10/2026

O projeto `nook-closed-beta` foi atualizado em 9/10/2026; detalhes em
[PUBLICACAO](PUBLICACAO.md). Para outras instalações, siga a sequência abaixo.

## Banco novo

Crie um projeto Supabase e aplique no SQL Editor, uma vez, nesta ordem:

```text
supabase/schema.sql
supabase/migrations/002_library_structure.sql
supabase/migrations/004_reader_productivity.sql
supabase/migrations/005_closed_beta.sql
supabase/migrations/006_visible_series_comments.sql
supabase/migrations/007_storage_visibility.sql
supabase/migrations/008_nonnegative_catalog_numbers.sql
supabase/migrations/009_reader_navigation.sql
supabase/migrations/010_comment_report_rate_limit.sql
supabase/migrations/011_profile_storage_privacy.sql
supabase/migrations/012_reading_only.sql
supabase/migrations/013_progress_order.sql
supabase/migrations/014_open_registration.sql
supabase/migrations/015_reader_anchors.sql
supabase/migrations/016_catalog_pagination.sql
supabase/migrations/20261010001650_deployment_security.sql
```

Não existem arquivos 001 ou 003 neste repositório. Supabase fornece `auth` e `storage`.

## Banco existente

Faça backup de banco/Storage e teste primeiro uma cópia isolada. Inventarie o
histórico aplicado; se está em 013, aplique somente 014, 015 e 016, nessa ordem.
Se é anterior, aplique os arquivos pendentes. Não reaplique baseline nem substitua tabelas.

Confira também as definições reais: instalações feitas pelo SQL Editor podem
ter histórico vazio e migrações antigas parcialmente aplicadas. O upgrade remoto
de 9/10/2026 foi registrado como `nook_launch_upgrade`: alinhou 006–011,
aplicou 013–016 e a correção `deployment_security`, preservando a 012 já aplicada.

- **014:** cria perfil/leitor permanente sem convite e preenche lacunas legadas.
  Preserva perfis existentes, admins, suspensões, publicação e objetos.
- **015:** âncoras opcionais de página/caractere em progresso e marcadores.
  Registros antigos continuam válidos; mantém RLS e a proteção da 013 contra gravação antiga.
- **016:** RPC `browse_catalog` com privilégios do chamador/RLS, filtros,
  contagens e páginas de 24 obras. Não apaga nem publica acervo.
- **deployment_security:** remove a policy legada que expunha todos os livros
  a usuários logados, restringe funções e mantém a projeção pública de identidades
  através de view `security_invoker` e função em schema privado. Não altera dados.

Nomes `beta_access`, `beta_member`, `beta_admin`, `enroll_beta` e `beta_visible`
permanecem por compatibilidade. `beta_visible` corresponde à publicação;
`revoked` à suspensão. Convites históricos não são usados no cadastro.
O frontend novo exige as três migrações; não há fallback silencioso para o beta.

## Auth

Habilite cadastro por e-mail e remova eventuais hooks externos de aprovação por
convite. Configure confirmação, mínimo de senha de 10 caracteres e SMTP;
confira limites/envio reais do provedor.
Em URL Configuration, defina Site URL para a origem do Nook e redirects exatos:

```text
http://localhost:3000/auth/confirm
http://localhost:3000/auth/recovery
https://seu-dominio/auth/confirm
https://seu-dominio/auth/recovery
```

Use domínio/porta efetivos; se usar `127.0.0.1`, cadastre esses redirects também.
Nos templates, preserve o link de verificação gerado (`ConfirmationURL`) ou
equivalente que encaminhe o redirect solicitado. Um link direto à página sem
verificar token não substitui esse fluxo. As rotas públicas tratam sessão, código
PKCE quando presente e erro/expiração. Consulte [Auth por senha](https://supabase.com/docs/guides/auth/passwords),
[redirects](https://supabase.com/docs/guides/auth/redirect-urls) e
[templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Primeiro administrador

Cadastre/confirme a conta escolhida. No projeto correto, substitua o e-mail fictício:

```sql
begin;
do $$
declare selected_user uuid;
begin
  select id into strict selected_user from auth.users
    where lower(email) = lower('administrador@exemplo.test');
  update public.beta_access set role = 'admin', revoked = false,
    expires_at = 'infinity' where user_id = selected_user;
  if not found then raise exception 'Acesso ausente: aplique a migration 014'; end if;
end $$;
commit;
```

A seleção estrita exige exatamente uma conta. Ninguém é promovido automaticamente;
admins existentes mantêm o papel. Suspensão permanece uma decisão explícita com
`update public.beta_access set revoked=true where user_id='<uuid escolhido>';`.

## Backup e reversão

`scripts/backup.mjs` faz backup de leitura de banco/Storage, com `pg_dump`,
`PGSERVICE` e `NOOK_BACKUP_URL`/`NOOK_BACKUP_SERVICE_KEY` fornecidos privadamente.
`node scripts/verify-backup.mjs <pasta>` verifica integridade local. Ensaie a
restauração em projeto separado; `scripts/verify-restoration.mjs` compara a cópia
restaurada e não executa restauração. Preserve também Auth/SMTP/redirects.
Teste de hash não comprova recuperação operacional. Voltar o frontend não desfaz
migrações: preserve colunas/dados e não tente reaplicar o baseline.
