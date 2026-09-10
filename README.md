# O10Dock

Um dock de projetos dentro do VS Code. Todas as suas pastas de trabalho em uma
barra lateral, com ícone, descrição e abertura em um clique — sem procurar em
"Arquivos Recentes" nem navegar pelo disco.

## O que a extensão faz

- **Dashboard de projetos na barra lateral.** Um ícone próprio na Activity Bar
  abre a lista dos seus projetos. Também disponível pela Command Palette em
  `O10Dock: Open`.
- **Abre na janela que você escolher.** Ao clicar em um projeto, escolha entre
  *Open in Current Window* e *Open in New Window*.
- **Detecção automática do tipo de projeto.** Cada pasta ganha ícone e descrição
  conforme os arquivos encontrados: solução .NET, app Angular, projeto Node.js,
  crate Rust, stack Docker Compose e outros.
- **Nome e descrição personalizados.** Um diálogo de edição permite sobrescrever
  o rótulo detectado quando o nome da pasta não diz o suficiente.
- **Reordenação por arrastar e soltar.** A ordem dos cards é a sua, e fica
  salva nas configurações.
- **Adicionar e remover pastas pela própria interface.** Botão `+` para escolher
  uma pasta, botão de lixeira (com confirmação) para tirar do dock.
- **Renderização instantânea.** O dashboard aparece direto das configurações e
  os tipos detectados chegam logo depois, sem tela de carregamento.

## Tipos de projeto detectados

| Detectado por | Descrição exibida |
| --- | --- |
| `*.slnx`, `*.sln` | .NET solution |
| `*.csproj` | C# project |
| `*.fsproj` | F# project |
| `angular.json` | Angular app |
| `next.config.*` | Next.js app |
| `package.json` | Node.js project |
| `pyproject.toml`, `requirements.txt` | Python project |
| `go.mod` | Go module |
| `Cargo.toml` | Rust crate |
| `pom.xml` | Maven project |
| `build.gradle*` | Gradle project |
| `composer.json` | PHP project |
| `docker-compose.yml` / `.yaml` | Docker Compose stack |

Pastas sem nenhum desses marcadores aparecem como `📁 Folder`.

## Como usar

1. Abra o painel **O10Dock** na Activity Bar.
2. Clique em `+` e escolha uma pasta de projeto.
3. Clique no card para abrir o projeto na janela desejada.

Use o ícone de lápis para ajustar nome e descrição, e arraste os cards para
reordenar.

## Comandos

| Comando | Descrição |
| --- | --- |
| `O10Dock: Open` | Abre o dashboard em uma aba do editor. |

## Configuração

| Setting | Tipo | Descrição |
| --- | --- | --- |
| `o10dock.projectFolders` | `array` | Projetos exibidos no dashboard. |

Cada item é um objeto `{ "path", "name", "description" }` — apenas `path` é
obrigatório. Strings simples (só o caminho) continuam sendo aceitas.

Normalmente não é preciso editar esse setting à mão: adicionar, editar, remover
e reordenar pela interface já grava aqui.

## Requisitos

VS Code 1.85.0 ou superior.

## Contribuindo

Build, testes, versionamento e release: veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

MIT
