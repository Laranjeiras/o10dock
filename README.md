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
npm run compile      # compila para out/
npx vsce package     # gera o .vsix
```

## Licença

MIT
