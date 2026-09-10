import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/** Shape persisted in the `o10dock.projectFolders` setting. */
interface ProjectEntry {
  path: string;
  name?: string;
  description?: string;
}

/** Entry resolved for rendering, with detected fallbacks applied. */
interface ProjectFolder {
  path: string;
  name: string;
  description: string;
  icon: string;
}

const CONFIG_SECTION = 'o10dock';
const FOLDERS_KEY = 'projectFolders';
const LAST_PICKED_FOLDER_KEY = 'o10dock.lastPickedFolder';

class O10DockViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'o10dock.sidebarView';

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.webview.options = { enableScripts: true };

    const render = async () => {
      webviewView.webview.html = getDashboardHtml(await getProjectFolders());
    };

    webviewView.webview.onDidReceiveMessage((message: DashboardMessage) =>
      handleDashboardMessage(message, this.context, webviewView.webview, render)
    );

    await render();
  }
}

function readProjectEntries(): ProjectEntry[] {
  const raw = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<Array<string | ProjectEntry>>(FOLDERS_KEY, []);

  // Legacy setting stored plain path strings; normalize both shapes.
  return raw
    .map((entry) => (typeof entry === 'string' ? { path: entry } : entry))
    .filter((entry): entry is ProjectEntry => typeof entry?.path === 'string' && entry.path.length > 0);
}

async function writeProjectEntries(entries: ProjectEntry[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(FOLDERS_KEY, entries, vscode.ConfigurationTarget.Global);
}

async function getProjectFolders(): Promise<ProjectFolder[]> {
  return Promise.all(readProjectEntries().map(describeFolder));
}

const PROJECT_KINDS: ReadonlyArray<{ glob: string; icon: string; description: string }> = [
  { glob: '*.slnx', icon: '🟣', description: '.NET solution' },
  { glob: '*.sln', icon: '🟣', description: '.NET solution' },
  { glob: '*.csproj', icon: '🟣', description: 'C# project' },
  { glob: '*.fsproj', icon: '🔵', description: 'F# project' },
  { glob: 'angular.json', icon: '🅰️', description: 'Angular app' },
  { glob: 'next.config.*', icon: '▲', description: 'Next.js app' },
  { glob: 'package.json', icon: '🟩', description: 'Node.js project' },
  { glob: 'pyproject.toml', icon: '🐍', description: 'Python project' },
  { glob: 'requirements.txt', icon: '🐍', description: 'Python project' },
  { glob: 'go.mod', icon: '🐹', description: 'Go module' },
  { glob: 'Cargo.toml', icon: '🦀', description: 'Rust crate' },
  { glob: 'pom.xml', icon: '☕', description: 'Maven project' },
  { glob: 'build.gradle*', icon: '☕', description: 'Gradle project' },
  { glob: 'composer.json', icon: '🐘', description: 'PHP project' },
  { glob: 'docker-compose.y*ml', icon: '🐳', description: 'Docker Compose stack' }
];

function folderNameOf(folderPath: string): string {
  return folderPath.split(/[\\/]/).filter(Boolean).pop() ?? folderPath;
}

async function describeFolder(entry: ProjectEntry): Promise<ProjectFolder> {
  const kind = await detectProjectKind(entry.path);

  return {
    path: entry.path,
    name: entry.name?.trim() || folderNameOf(entry.path),
    icon: kind?.icon ?? '📁',
    description: entry.description?.trim() || kind?.description || 'Folder'
  };
}

async function detectProjectKind(
  folderPath: string
): Promise<{ icon: string; description: string } | undefined> {
  for (const kind of PROJECT_KINDS) {
    const pattern = new vscode.RelativePattern(vscode.Uri.file(folderPath), kind.glob);
    const [match] = await vscode.workspace.findFiles(pattern, undefined, 1);
    if (match) {
      return kind;
    }
  }
  return undefined;
}

type DashboardMessage = {
  type?: string;
  path?: string;
  paths?: string[];
  entry?: ProjectEntry;
};

async function handleDashboardMessage(
  message: DashboardMessage,
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  onFoldersChanged: () => void
): Promise<void> {
  switch (message.type) {
    case 'openSettings':
      await vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION);
      return;

    case 'addFolder':
      await addFolder(context, onFoldersChanged);
      return;

    case 'editFolder':
      if (typeof message.path === 'string') {
        await requestEditDialog(message.path, webview);
      }
      return;

    case 'browseFolder':
      await browseForDialog(context, message.path, webview);
      return;

    case 'saveFolder':
      if (typeof message.path === 'string' && message.entry) {
        await saveFolder(message.path, message.entry, onFoldersChanged);
      }
      return;

    case 'deleteFolder':
      if (typeof message.path === 'string') {
        await deleteFolder(message.path, onFoldersChanged);
      }
      return;

    case 'reorderFolders':
      if (Array.isArray(message.paths)) {
        await reorderFolders(message.paths);
      }
      return;

    case 'openFolder':
      if (typeof message.path === 'string') {
        await openFolder(message.path);
      }
      return;

    default:
      return;
  }
}

/**
 * Lets the user choose the target window. The dashboard lives in the current
 * window, so reusing it replaces what the user is looking at — never assume it.
 */
async function openFolder(path: string): Promise<void> {
  const entries = readProjectEntries();
  const target = entries.find((entry) => entry.path === path);
  const label = target?.name?.trim() || folderNameOf(path);

  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(window) Open in Current Window', forceNewWindow: false },
      { label: '$(empty-window) Open in New Window', forceNewWindow: true }
    ],
    { title: `Open ${label}`, placeHolder: path }
  );
  if (!choice) {
    return;
  }

  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), {
    forceNewWindow: choice.forceNewWindow
  });
}

async function pickFolder(
  context: vscode.ExtensionContext,
  openLabel: string,
  currentPath?: string
): Promise<string | undefined> {
  // Reopen where the user last picked, falling back to the entry being edited.
  const remembered = context.globalState.get<string>(LAST_PICKED_FOLDER_KEY);
  const defaultPath = currentPath ?? remembered;

  const selection = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel,
    defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined
  });

  const folder = selection?.[0];
  if (!folder) {
    return undefined;
  }

  await context.globalState.update(LAST_PICKED_FOLDER_KEY, folder.fsPath);
  return folder.fsPath;
}

async function addFolder(
  context: vscode.ExtensionContext,
  onFoldersChanged: () => void
): Promise<void> {
  const folderPath = await pickFolder(context, 'Add Folder');
  if (!folderPath) {
    return;
  }

  const entries = readProjectEntries();
  if (entries.some((entry) => entry.path === folderPath)) {
    void vscode.window.showInformationMessage(`"${folderNameOf(folderPath)}" is already in the dock.`);
    return;
  }

  await writeProjectEntries([...entries, { path: folderPath }]);
  onFoldersChanged();
}

/**
 * Sends the stored entry to the webview so its modal opens pre-filled with the
 * raw values, not the rendered fallbacks — an empty field must stay empty so
 * the user can tell a custom name from a detected one.
 */
async function requestEditDialog(path: string, webview: vscode.Webview): Promise<void> {
  const current = readProjectEntries().find((entry) => entry.path === path);
  if (!current) {
    return;
  }

  await webview.postMessage({
    type: 'showEditDialog',
    path: current.path,
    entry: {
      path: current.path,
      name: current.name ?? '',
      description: current.description ?? ''
    },
    placeholders: {
      name: folderNameOf(current.path),
      description: (await detectProjectKind(current.path))?.description ?? 'Folder'
    }
  });
}

/** Opens the native folder dialog for the modal's browse button. */
async function browseForDialog(
  context: vscode.ExtensionContext,
  currentPath: string | undefined,
  webview: vscode.Webview
): Promise<void> {
  const picked = await pickFolder(context, 'Select Folder', currentPath);
  if (!picked) {
    return;
  }

  await webview.postMessage({ type: 'browsedFolder', path: picked });
}

async function saveFolder(
  path: string,
  edited: ProjectEntry,
  onFoldersChanged: () => void
): Promise<void> {
  const entries = readProjectEntries();
  const index = entries.findIndex((entry) => entry.path === path);
  if (index < 0) {
    return;
  }

  const trimmedPath = edited.path?.trim() ?? '';
  if (!trimmedPath) {
    void vscode.window.showErrorMessage('Path cannot be empty.');
    return;
  }

  const isDuplicate = entries.some((entry, i) => i !== index && entry.path === trimmedPath);
  if (isDuplicate) {
    void vscode.window.showErrorMessage(`"${trimmedPath}" is already in the dock.`);
    return;
  }

  entries[index] = {
    path: trimmedPath,
    name: edited.name?.trim() || undefined,
    description: edited.description?.trim() || undefined
  };

  await writeProjectEntries(entries);
  onFoldersChanged();
}

/**
 * Applies the order the webview reports. The stored entries stay the source of
 * truth: paths are matched back to them, and anything the webview did not list
 * (added or edited elsewhere while the drag was in flight) keeps its place at
 * the end instead of being dropped.
 */
async function reorderFolders(paths: string[]): Promise<void> {
  const entries = readProjectEntries();
  const remaining = new Map(entries.map((entry) => [entry.path, entry]));

  const reordered: ProjectEntry[] = [];
  for (const path of paths) {
    const entry = remaining.get(path);
    if (entry) {
      reordered.push(entry);
      remaining.delete(path);
    }
  }
  reordered.push(...remaining.values());

  const unchanged = reordered.every((entry, index) => entry.path === entries[index]?.path);
  if (unchanged) {
    return;
  }

  // No re-render: the webview already shows this order.
  await writeProjectEntries(reordered);
}

async function deleteFolder(path: string, onFoldersChanged: () => void): Promise<void> {
  const entries = readProjectEntries();
  const target = entries.find((entry) => entry.path === path);
  if (!target) {
    return;
  }

  const label = target.name?.trim() || folderNameOf(target.path);
  const confirmation = await vscode.window.showWarningMessage(
    `Remove "${label}" from the dock?`,
    { modal: true, detail: 'The folder itself is not deleted from disk.' },
    'Remove'
  );
  if (confirmation !== 'Remove') {
    return;
  }

  await writeProjectEntries(entries.filter((entry) => entry.path !== path));
  onFoldersChanged();
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new O10DockViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(O10DockViewProvider.viewType, provider)
  );

  const disposable = vscode.commands.registerCommand('o10dock.open', async () => {
    const panel = vscode.window.createWebviewPanel('o10dock', 'O10Dock', vscode.ViewColumn.One, {
      enableScripts: true
    });

    const render = async () => {
      panel.webview.html = getDashboardHtml(await getProjectFolders());
    };

    panel.webview.onDidReceiveMessage(
      (message: DashboardMessage) =>
        handleDashboardMessage(message, context, panel.webview, render),
      undefined,
      context.subscriptions
    );

    await render();
  });

  context.subscriptions.push(disposable);
}

const GRIP_ICON = `<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 2.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm6.5 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM6 8a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 6 8Zm6.5 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM6 13.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm6.5 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"/></svg>`;
const EDIT_ICON =`<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.23 1a1.5 1.5 0 0 1 1.06 2.56l-8.4 8.4-3.2.9.9-3.2 8.4-8.4A1.5 1.5 0 0 1 13.23 1Zm-.7 1.4-7.9 7.9-.38 1.35 1.35-.38 7.9-7.9-.97-.97Z"/></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.5 1h3a1 1 0 0 1 1 1v1H14v1h-1.1l-.7 9.07A2 2 0 0 1 10.2 15H5.8a2 2 0 0 1-2-1.93L3.1 4H2V3h3.5V2a1 1 0 0 1 1-1Zm0 2h3V2h-3v1ZM4.1 4l.7 8.99a1 1 0 0 0 1 .01h4.4a1 1 0 0 0 1-.01L11.9 4H4.1Zm2.4 1.5h1v7h-1v-7Zm2 0h1v7h-1v-7Z"/></svg>`;

function getDashboardHtml(folders: ProjectFolder[]): string {
  const nonce = getNonce();

  const folderItems = folders
    .map(
      (folder) => `<li class="folder-item" draggable="true" data-path="${escapeHtml(folder.path)}" title="${escapeHtml(folder.path)}">
        <span class="drag-handle" aria-hidden="true">${GRIP_ICON}</span>
        <span class="folder-open" data-action="open" data-path="${escapeHtml(folder.path)}">
          <span class="codicon">${folder.icon}</span>
          <span class="folder-info">
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-description">${escapeHtml(folder.description)}</span>
          </span>
        </span>
        <span class="folder-actions">
          <button class="action-button" data-action="edit" data-path="${escapeHtml(folder.path)}" title="Edit project" aria-label="Edit project">${EDIT_ICON}</button>
          <button class="action-button danger" data-action="delete" data-path="${escapeHtml(folder.path)}" title="Remove project" aria-label="Remove project">${DELETE_ICON}</button>
        </span>
      </li>`
    )
    .join('');

  const listOrEmpty = folders.length
    ? `<ul class="folder-list">${folderItems}</ul>`
    : `<div class="empty-state">
        <h2>No projects configured yet</h2>
        <p>Click the <strong>+</strong> button above to add a folder.</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>O10Dock</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      max-width: 920px;
      margin: 0 auto;
    }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 20px;
      gap: 16px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: var(--vscode-descriptionForeground); }
    .header-actions { display: flex; gap: 8px; }
    .icon-button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 4px;
      width: 32px;
      height: 32px;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
    }
    .icon-button:hover { background: var(--vscode-button-hoverBackground); }
    .empty-state {
      margin-top: 28px;
      padding: 28px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    button.text-button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      padding: 8px 14px;
      cursor: pointer;
    }
    button.text-button:hover { background: var(--vscode-button-hoverBackground); }
    .folder-list {
      list-style: none;
      margin: 28px 0 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }
    .folder-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      min-width: 0;
    }
    .folder-item:hover { background: var(--vscode-list-hoverBackground); }
    .drag-handle {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: -4px;
      color: var(--vscode-descriptionForeground);
      cursor: grab;
      opacity: 0;
    }
    .folder-item:hover .drag-handle { opacity: 1; }
    .folder-item.dragging {
      opacity: 0.4;
      cursor: grabbing;
    }
    .folder-item.drop-before { box-shadow: -2px 0 0 0 var(--vscode-focusBorder); }
    .folder-item.drop-after { box-shadow: 2px 0 0 0 var(--vscode-focusBorder); }
    .folder-open {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }
    .folder-info { display: flex; flex-direction: column; min-width: 0; }
    .folder-name {
      color: var(--vscode-textLink-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .folder-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .folder-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
      opacity: 0;
    }
    .folder-item:hover .folder-actions,
    .folder-actions:focus-within { opacity: 1; }
    .action-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-icon-foreground, var(--vscode-foreground));
      cursor: pointer;
    }
    .action-button:hover { background: var(--vscode-toolbar-hoverBackground); }
    .action-button.danger:hover { color: var(--vscode-errorForeground); }
    .action-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    dialog {
      width: min(420px, 90vw);
      padding: 0;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
    }
    dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
    dialog form { display: flex; flex-direction: column; }
    .dialog-title {
      margin: 0;
      padding: 14px 16px;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .field-row { display: flex; gap: 6px; }
    .field-row input { flex: 1; min-width: 0; }
    dialog input {
      padding: 5px 8px;
      font-family: inherit;
      font-size: 13px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
    }
    dialog input:focus { outline: 1px solid var(--vscode-focusBorder); }
    dialog input::placeholder { color: var(--vscode-input-placeholderForeground); }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .dialog-actions button, .browse-button {
      padding: 5px 14px;
      font-family: inherit;
      font-size: 13px;
      border: 0;
      border-radius: 3px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }
    .dialog-actions button:hover, .browse-button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .dialog-actions button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .dialog-actions button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .browse-button { flex-shrink: 0; padding: 5px 10px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>O10Dock</h1>
      <p>Your projects, links and shortcuts in one place.</p>
    </div>
    <div class="header-actions">
      <button class="icon-button" id="addFolder" title="Add Folder">+</button>
    </div>
  </header>
  ${listOrEmpty}
  <dialog id="editDialog">
    <form method="dialog" id="editForm">
      <h2 class="dialog-title">Edit project</h2>
      <div class="dialog-body">
        <div class="field">
          <label for="editPath">Path</label>
          <div class="field-row">
            <input id="editPath" name="path" type="text" required spellcheck="false">
            <button type="button" class="browse-button" id="browseFolder" title="Browse for folder">Browse…</button>
          </div>
        </div>
        <div class="field">
          <label for="editName">Name</label>
          <input id="editName" name="name" type="text" spellcheck="false">
        </div>
        <div class="field">
          <label for="editDescription">Description</label>
          <input id="editDescription" name="description" type="text">
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="secondary" id="cancelEdit">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </dialog>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('addFolder')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'addFolder' });
    });
    document.getElementById('openSettings')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    const MESSAGE_BY_ACTION = {
      open: 'openFolder',
      edit: 'editFolder',
      delete: 'deleteFolder'
    };

    // A drag that ends over the card can be followed by a click; ignore it so
    // reordering never opens a folder by accident.
    let suppressClickUntil = 0;

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger || Date.now() < suppressClickUntil) {
        return;
      }
      const type = MESSAGE_BY_ACTION[trigger.getAttribute('data-action')];
      if (type) {
        vscode.postMessage({ type, path: trigger.getAttribute('data-path') });
      }
    });

    const dialog = document.getElementById('editDialog');
    const form = document.getElementById('editForm');
    const pathInput = document.getElementById('editPath');
    const nameInput = document.getElementById('editName');
    const descriptionInput = document.getElementById('editDescription');
    // The entry being edited is keyed by its original path, so renaming the
    // path still updates the right entry instead of creating a new one.
    let editingPath = null;

    document.getElementById('browseFolder')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'browseFolder', path: pathInput.value.trim() });
    });

    document.getElementById('cancelEdit')?.addEventListener('click', () => {
      dialog.close();
    });

    dialog?.addEventListener('close', () => {
      editingPath = null;
    });

    form?.addEventListener('submit', () => {
      if (!editingPath) {
        return;
      }
      vscode.postMessage({
        type: 'saveFolder',
        path: editingPath,
        entry: {
          path: pathInput.value,
          name: nameInput.value,
          description: descriptionInput.value
        }
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.type === 'showEditDialog') {
        editingPath = message.path;
        pathInput.value = message.entry.path;
        nameInput.value = message.entry.name;
        descriptionInput.value = message.entry.description;
        nameInput.placeholder = message.placeholders.name;
        descriptionInput.placeholder = message.placeholders.description;
        dialog.showModal();
        nameInput.focus();
        nameInput.select();
      } else if (message?.type === 'browsedFolder') {
        pathInput.value = message.path;
      }
    });

    const list = document.querySelector('.folder-list');
    let dragged = null;

    function clearDropMarkers() {
      document
        .querySelectorAll('.drop-before, .drop-after')
        .forEach((item) => item.classList.remove('drop-before', 'drop-after'));
    }

    list?.addEventListener('dragstart', (event) => {
      dragged = event.target.closest('.folder-item');
      if (!dragged) {
        return;
      }
      dragged.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      // Firefox requires data to be set for the drag to start at all.
      event.dataTransfer.setData('text/plain', dragged.getAttribute('data-path'));
    });

    list?.addEventListener('dragover', (event) => {
      if (!dragged) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const target = event.target.closest('.folder-item');
      clearDropMarkers();
      if (!target || target === dragged) {
        return;
      }

      // Cards sit in a grid row, so the horizontal midpoint decides the side.
      const bounds = target.getBoundingClientRect();
      const after = event.clientX > bounds.left + bounds.width / 2;
      target.classList.add(after ? 'drop-after' : 'drop-before');
    });

    list?.addEventListener('drop', (event) => {
      if (!dragged) {
        return;
      }
      event.preventDefault();

      const target = event.target.closest('.folder-item');
      clearDropMarkers();
      if (target && target !== dragged) {
        const bounds = target.getBoundingClientRect();
        const after = event.clientX > bounds.left + bounds.width / 2;
        target.insertAdjacentElement(after ? 'afterend' : 'beforebegin', dragged);
      }

      const paths = Array.from(list.querySelectorAll('.folder-item')).map((item) =>
        item.getAttribute('data-path')
      );
      vscode.postMessage({ type: 'reorderFolders', paths });
    });

    list?.addEventListener('dragend', () => {
      suppressClickUntil = Date.now() + 100;
      dragged?.classList.remove('dragging');
      clearDropMarkers();
      dragged = null;
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce(): string {
  return randomBytes(16).toString('base64url');
}

export function deactivate(): void {}
