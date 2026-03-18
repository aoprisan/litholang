import * as path from "path";
import {
  workspace,
  ExtensionContext,
  commands,
  window,
  StatusBarAlignment,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "server.js"),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "litho" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.litho"),
    },
  };

  client = new LanguageClient(
    "lithoLanguageServer",
    "Litho Language Server",
    serverOptions,
    clientOptions,
  );

  // Status bar
  const statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 0);
  statusBar.text = "$(beaker) Litho";
  statusBar.tooltip = "LithoLang Language Server";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Start the client (which also starts the server)
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
