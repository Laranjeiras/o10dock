# O10Dock

Extensão TypeScript para personalizar a tela inicial do VS Code com projetos, links e atalhos.

## Desenvolvimento

1. Abra a pasta `O10Dock` no VS Code.
2. Execute `npm install`.
3. Pressione `F5` para iniciar uma janela do VS Code com a extensão carregada.
4. Execute `O10Dock: Open` na Command Palette.

## Configuração

| Setting | Tipo | Descrição |
| --- | --- | --- |
| `o10dock.projectFolders` | `string[]` | Pastas contendo projetos a exibir no dashboard. |

O scanner de projetos será implementado sobre essa base.

## Build

```bash
npm run typecheck    # verifica tipos sem emitir
npm run compile      # compila para out/
npx vsce package     # gera o .vsix
```

## Versionamento e release

A versão é calculada automaticamente pelo [semantic-release](https://semantic-release.gitbook.io/)
a partir das mensagens de commit. Não edite `version` no `package.json` manualmente.

Cada merge em `main` dispara o workflow de release, que decide o bump pelo tipo dos commits:

| Commit                                   | Bump    |
| ---------------------------------------- | ------- |
| `fix:`, `perf:`, `refactor:`            | patch   |
| `feat:`                                  | minor   |
| `BREAKING CHANGE:` no rodapé             | major   |
| `docs:`, `style:`, `test:`, `chore:`, `ci:`, `build:` | nenhum |

`build:` não gera release de propósito: as PRs do Dependabot atualizam
devDependencies, que não mudam nada para quem usa a extensão. Quando um bump
de dependência realmente afeta o comportamento publicado, use `fix:` ou `feat:`.

Quando há bump, o workflow compila, empacota o `.vsix`, publica no VS Code
Marketplace e no Open VSX, cria a tag e a GitHub Release, e commita
`package.json` + `CHANGELOG.md` de volta em `main`. Sem commits releasáveis,
nada é publicado.

Para simular sem publicar: Actions → Release → Run workflow → `dry_run`.

### Secrets necessários

| Secret            | Uso                                                       |
| ----------------- | --------------------------------------------------------- |
| `VSCE_PAT`        | publicação no VS Code Marketplace                          |
| `OPEN_VSX_TOKEN`  | publicação no Open VSX (opcional; falha não bloqueia)      |
| `RELEASE_TOKEN`   | opcional; PAT para o push do release passar por branch protection |

## Licença

MIT
