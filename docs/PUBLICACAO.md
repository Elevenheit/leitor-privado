# Publicação — 9/10/2026

Destinos confirmados: workspace `My Workspace` no Render e projeto Supabase
`nook-closed-beta` (`trrrlyhakxifrdcaugrr`). O serviço Render publica a branch
`feat/nook-closed-beta`, com deploy automático desativado:
<https://nook-closed-beta.onrender.com>.

## Banco aplicado e verificado

O histórico remoto estava vazio apesar de existir um catálogo e parte do schema.
A inspeção confirmou a 012 aplicada, mas versões antigas de policies e lacunas
nas demais migrações. O upgrade `nook_launch_upgrade` alinhou 006–011 e aplicou
013–016 mais `20261010001650_deployment_security.sql` em uma operação.

Foram preservados 34 livros, 2 obras, 3 volumes, 4 registros de progresso,
2 perfis, 1 favorito e 37 objetos de Storage. Papéis administrativos,
suspensões e publicação explícita foram preservados; acessos ativos agora têm
validade permanente. Nenhuma mídia foi removida ou publicada pelo upgrade.

A policy extra `usuarios_logados_podem_ver_biblioteca`, que permitia listar todos
os livros autenticados, foi removida. A projeção de identidades mantém somente
id, nickname, avatar e avatar_path, sem acesso a biografias ou preferências alheias.
Os buckets continuam privados. O advisor não apresentou erros após o upgrade.
As funções beta_member/beta_admin continuam privilegiadas de forma intencional,
com acesso restrito a authenticated, e convites históricos continuam sem acesso.

Um teste remoto criou uma conta temporária dentro de uma transação e confirmou
cadastro sem convite, papel de leitor permanente, catálogo paginado sob RLS,
isolamento de perfis/progresso/favoritos, projeção comunitária e suspensão.
A transação foi revertida e a conta de teste não permaneceu no banco.

## Validação e cópia local

`npm test`, lint, TypeScript e build passaram. O teste de segurança adicional
reproduziu a policy permissiva e validou sua remoção e a projeção de identidades.
Snapshot de dados públicos, funções, constraints, policies e metadados de Storage:
`backups/deploy-20261009/before.json`, privado e ignorado pelo Git.
Essa cópia não é pg_dump nem contém os bytes dos arquivos ou um backup de Auth;
uma restauração operacional completa continua pendente.

## Render e GitHub

Render recebeu NODE_VERSION=24.21.0, URL do projeto e chave publishable ativa
no campo NEXT_PUBLIC_SUPABASE_ANON_KEY. Nenhuma chave service_role foi enviada.
A atualização de variáveis iniciou automaticamente um build da revisão anterior,
concluído com status `live`. O GitHub foi autenticado como Elevenheit e a revisão
atual é enviada para `feat/nook-closed-beta`, seguida de deploy manual. Confira
o commit e o status efetivamente publicado no
[serviço Render](https://dashboard.render.com/web/srv-daqqjrnlot8c73ebba2g).

## Auth e e-mails pendentes

O endpoint Auth informou cadastro habilitado e confirmação de e-mail desativada.
As ferramentas conectadas não expõem edição de Auth/SMTP. Configure no painel:

- Site URL: `https://nook-closed-beta.onrender.com`.
- Redirects de produção: `https://nook-closed-beta.onrender.com/auth/confirm`
  e `https://nook-closed-beta.onrender.com/auth/recovery`.
- Senha mínima de 10 caracteres e confirmação de e-mail, após configurar SMTP
  e verificar envio real pelo provedor escolhido.
- Preserve ConfirmationURL nos templates e verifique os hooks externos de cadastro.

Documentação: [redirects](https://supabase.com/docs/guides/auth/redirect-urls),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp) e
[senha](https://supabase.com/docs/guides/auth/password-security).
O advisor ainda informa proteção contra senhas vazadas desativada; confira
disponibilidade no plano antes de ativar no painel.

Cadastro, confirmação e recuperação por e-mail no domínio publicado, leitura
real e retomada em dois aparelhos ainda precisam de homologação.
