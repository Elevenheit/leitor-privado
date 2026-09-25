# Promover a primeira conta administradora

A migration `005_closed_beta.sql` cria a estrutura e as funções de autorização, mas não escolhe uma conta administradora. Depois de executá-la, promova explicitamente uma conta Auth do projeto de teste pelo SQL Editor administrativo. Use o e-mail exato da conta; não coloque UUID ou credenciais pessoais em migrations ou no repositório.

```sql
do $$
declare
  target_email text := lower('<email-da-conta-administradora>');
  target_id uuid;
begin
  select id into strict target_id
  from auth.users
  where lower(email) = target_email;

  insert into public.beta_access(user_id, role, expires_at, revoked)
  values (target_id, 'admin', 'infinity'::timestamptz, false)
  on conflict (user_id) do update
  set role = 'admin', expires_at = 'infinity'::timestamptz, revoked = false;
end $$;
```

`INTO STRICT` faz o comando falhar se o e-mail não corresponder a exatamente uma conta. `beta_admin()` continua verificando `beta_access.role`, expiração e revogação. Execute a promoção uma vez por ambiente; em um banco clonado, confirme a conta de destino antes de promovê-la.
