# Supabase isolado

Testes locais usam PGlite ou serviços simulados. Para SDK/RLS/Storage reais, crie
projeto exclusivo de teste e aplique todas as migrações. Configure no ambiente privado:

```text
NOOK_TEST_URL
NOOK_TEST_ANON_KEY
NOOK_TEST_SERVICE_KEY
NOOK_TEST_PROJECT_REF
NOOK_PRODUCTION_PROJECT_REF
NOOK_ALLOW_TEST_WRITES=isolated-beta-only
```

O último valor é histórico e mantido por compatibilidade. O executor rejeita
configuração ausente, URL sem HTTPS, domínio divergente ou referência igual à
produção antes de requests. Não exponha valores de credenciais.

Instale Chromium e execute `npm run test:e2e`. A suíte reconstrói para esse projeto,
cria contas/obra/arquivo fictícios e remove seus próprios recursos. Use confirmação
desativada **somente nesse projeto automatizado**: cadastro usa `.test` e espera
sessão imediata. A suíte verifica cadastro sem convite, leitor/admin, suspensão,
publicação, leitura e dados pessoais.

Homologue separadamente com SMTP real e confirmação habilitada: cadastro novo,
conta existente, reenvio, `/auth/confirm`, recuperação, `/auth/recovery`, senha nova,
link inválido/expirado, redirects HTTPS e retomada em dois aparelhos. Confira que
posição offline antiga não substitui leitura nova. Mock não substitui homologação.
Esta sessão não executou E2E remoto nem enviou e-mails.
