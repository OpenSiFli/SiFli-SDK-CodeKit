const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 脚本文件名
const SCRIPT_FILENAME = 'run.sh'; // 构建脚本文件名 (固定为 run.sh)
const DOWNLOAD_SCRIPT_FILENAME = 'download.sh'; // 下载脚本文件名 (固定为 download.sh)

// 任务名称常量
const BUILD_TASK_NAME = "one-step: Build"; // 构建任务的唯一名称
const DOWNLOAD_TASK_NAME = "one-step: Download"; // 下载任务的唯一名称

let compileBtn, rebuildBtn, cleanBtn, downloadBtn;
let buildTaskEndListener = null; // 用于存储构建任务结束监听器，确保及时清理

// Helper function to create and execute a task
async function executeScriptAsTask(scriptFilename, taskName, taskSourceSuffix) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('请先打开一个工作区以执行任务。');
        return null; // 返回 null 表示无法执行
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const scriptPath = path.join(workspaceRoot, scriptFilename);

    if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage(`脚本 ${scriptFilename} 在工作区根目录未找到。`);
        return null; // 返回 null 表示无法执行
    }

    const taskDefinition = {
        type: 'shell',
        label: taskName // 任务的显示名称，也用作唯一标识
    };

    let commandLine = `./${scriptFilename}`;
    if (process.platform === 'win32') {
        // Windows specific command if needed, e.g. `bash ./${scriptFilename}`
        // For simplicity, assuming script is executable or shell handles it.
    }

    const task = new vscode.Task(
        taskDefinition,
        vscode.TaskScope.Workspace,
        taskName,
        `My Extension ${taskSourceSuffix}`, // 任务来源，添加后缀以区分
        new vscode.ShellExecution(commandLine, { cwd: workspaceRoot }),
        [] // problemMatchers
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Shared, // 关键: 使用共享的任务面板
        clear: true // 每次运行时清除之前的输出 (可根据需求调整为 false)
    };

    try {
        await vscode.tasks.executeTask(task);
        // vscode.window.showInformationMessage(`任务 "${taskName}" 已开始...`);
        return task; // 返回执行的任务对象
    } catch (error) {
        vscode.window.showErrorMessage(`执行任务 "${taskName}" 失败: ${error.message}`);
        console.error(`执行任务 "${taskName}" 失败:`, error);
        return null; // 返回 null 表示无法执行
    }
}


// 执行构建脚本 (run.sh) 的函数 - 使用 Tasks API
async function executeRunScript() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            vscode.window.showWarningMessage('部分文件未能保存，构建可能基于旧版文件。');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        return;
    }

    const buildTask = await executeScriptAsTask(SCRIPT_FILENAME, BUILD_TASK_NAME, "Build");

    if (!buildTask) { // 如果任务创建或执行失败
        return;
    }

    // 清理上一个构建任务的监听器（如果存在）
    if (buildTaskEndListener) {
        buildTaskEndListener.dispose();
        buildTaskEndListener = null;
    }

    // 监听构建任务结束事件
    buildTaskEndListener = vscode.tasks.onDidEndTaskProcess(async (event) => {
        if (event.execution.task.name === BUILD_TASK_NAME && event.execution.task.source === 'My Extension Build') {
            // vscode.window.showInformationMessage(`构建任务 "${event.execution.task.name}" 已结束，退出码: ${event.exitCode}`);

            if (event.exitCode === 0) { // 0 通常表示成功
                // vscode.window.showInformationMessage('构建成功！正在尝试重启 Clangd Language Server...');
                try {
                    await vscode.commands.executeCommand('clangd.restart');
                    // vscode.window.showInformationMessage('Clangd Language Server 已成功重启。');
                } catch (err) {
                    vscode.window.showErrorMessage(`重启 Clangd Language Server 失败。请确保 Clangd 扩展已安装并激活。错误: ${err.message}`);
                    console.error("重启 clangd 时出错:", err);
                }
            } else {
                vscode.window.showErrorMessage(`构建任务 "${event.execution.task.name}" 失败，退出码: ${event.exitCode}。Clangd 未重启。`);
            }

            if (buildTaskEndListener) {
                buildTaskEndListener.dispose();
                buildTaskEndListener = null;
            }
        }
    });
}

// 执行下载脚本 (download.sh) 的函数 - 使用 Tasks API
async function executeDownloadScript() {
    // 对于下载脚本，我们通常不需要在它结束后执行特定操作，所以这里不设置 onDidEndTaskProcess 监听器
    // 如果需要，可以仿照 executeRunScript 添加
    await executeScriptAsTask(DOWNLOAD_SCRIPT_FILENAME, DOWNLOAD_TASK_NAME, "Download");
}

// 执行清理命令 (删除 'build' 文件夹)
function executeCleanCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('请先打开一个工作区。');
        return;
    }
    const buildFolderPath = path.join(workspaceFolders[0].uri.fsPath, 'build');
    try {
        if (fs.existsSync(buildFolderPath)) {
            fs.rmSync(buildFolderPath, { recursive: true, force: true });
            vscode.window.showInformationMessage("'build' 文件夹已成功删除。");
        } else {
            vscode.window.showInformationMessage("'build' 文件夹不存在，无需删除。");
        }
    } catch (error) {
        vscode.window.showErrorMessage(`删除 'build' 文件夹失败: ${error.message}`);
    }
}

// 更新状态栏按钮的提示信息
function updateStatusBarItems() {
    if (compileBtn) {
        compileBtn.tooltip = `执行构建任务 (./${SCRIPT_FILENAME})`;
    }
    if (rebuildBtn) {
        rebuildBtn.tooltip = `清理并执行构建任务 (./${SCRIPT_FILENAME})`;
    }
    if (downloadBtn) {
        downloadBtn.tooltip = `执行下载任务 (./${DOWNLOAD_SCRIPT_FILENAME})`;
    }
}

// 初始化
function initializeExtension() {
    updateStatusBarItems();
}

async function activate(context) {
    const CMD_PREFIX = "extension.";

    compileBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
    compileBtn.text = '⚙️ Build';
    compileBtn.command = CMD_PREFIX + 'compile';
    compileBtn.show();
    context.subscriptions.push(compileBtn);

    rebuildBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    rebuildBtn.text = '🔄 Rebuild';
    rebuildBtn.command = CMD_PREFIX + 'rebuild';
    rebuildBtn.show();
    context.subscriptions.push(rebuildBtn);

    downloadBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    downloadBtn.text = '🚀 Download';
    downloadBtn.command = CMD_PREFIX + 'download';
    downloadBtn.show();
    context.subscriptions.push(downloadBtn);

    cleanBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
    cleanBtn.text = '🧹 Clean';
    cleanBtn.command = CMD_PREFIX + 'clean';
    cleanBtn.tooltip = "删除 'build' 文件夹";
    cleanBtn.show();
    context.subscriptions.push(cleanBtn);

    initializeExtension();

    context.subscriptions.push(
        vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeRunScript()),
        vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
            executeCleanCommand();
            await executeRunScript();
        }),
        vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
        vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadScript())
    );

    // 扩展停用时，清理监听器
    context.subscriptions.push({
        dispose: () => {
            if (buildTaskEndListener) {
                buildTaskEndListener.dispose();
            }
        }
    });
}

function deactivate() {
    if (buildTaskEndListener) {
        buildTaskEndListener.dispose();
    }
}

module.exports = { activate, deactivate };
