import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('o10dock.open', () => {
    const panel = vscode.window.createWebviewPanel(
      'o10dock',
      'O10Dock',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
      if (message.type === 'openSettings') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:local.o10dock'
        );
      }
    }, undefined, context.subscriptions);

    panel.webview.html = getDashboardHtml(panel.webview);
  });

  context.subscriptions.push(disposable);
}

function getDashboardHtml(webview: vscode.Webview): string {
  const nonce = getNonce();

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
      padding: 32px;
      max-width: 920px;
      margin: 0 auto;
    }
    header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: var(--vscode-descriptionForeground); }
    .empty-state {
      margin-top: 28px;
      padding: 28px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      padding: 8px 14px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <header>
    <h1>O10Dock</h1>
    <p>Your projects, links and shortcuts in one place.</p>
  </header>
  <section class="empty-state">
    <h2>No projects configured yet</h2>
    <p>Set <code>o10dock.projectFolders</code> in VS Code settings to begin.</p>
    <button id="openSettings">Open Settings</button>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('openSettings')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let index = 0; index < 32; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

export function deactivate(): void {}
