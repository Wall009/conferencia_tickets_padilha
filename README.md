# Conferência de Tickets

## Publicar no EasyPanel
1. Crie um serviço **Postgres** (banco próprio para este app).
2. Envie estes arquivos a um repositório **privado** no GitHub e crie um serviço **App** (build por Dockerfile).
3. Em Environment, preencha as variáveis de `.env.example`:
   - `DATABASE_URL`: URL interna do Postgres criado.
   - `SESSION_SECRET`: texto aleatório com 32+ caracteres (`openssl rand -hex 32`).
   - `SENHA_OPERADOR` e `SENHA_VISUALIZADOR`: diferentes, com 10+ caracteres.
4. Em Domains, aponte um domínio com **HTTPS** para a porta 3000 (a câmera exige HTTPS).

Não há usuário, só senha: a senha define o perfil. Mantenha **uma única instância** do app.

## Uso
1. Entre como operador, abra **Painel** e importe a planilha.
2. Em **Bipar**, ligue a câmera. No iPhone, confira se o volume está ligado.
3. A outra pessoa entra no mesmo endereço com a senha de visualização. O painel atualiza a cada 3 s.

## Regras
- Todo ticket bipado precisa estar **Utilizado**; o resto é divergência.
- **Pendente** = Utilizado ainda não bipado. Na primeira vez inclui os que você já conferiu à mão: use **Uso desde**.
- Reimportar atualiza as situações e mantém as leituras. Vouchers ausentes na nova planilha permanecem como estavam.
- Sem conexão, nada é registrado (som de erro): bipe de novo.
- A planilha tem códigos que dão acesso a viagens. Não a coloque no repositório. O Excel exportado também contém códigos.
