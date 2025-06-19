// one_step_for_sifi/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 定义SiFli SDK相关的常量
const TERMINAL_NAME = 'SF32'; // SDK配置的终端名称
const PROJECT_SUBFOLDER = 'project'; // 工程文件夹名称（命令执行的实际工作目录）
const SRC_SUBFOLDER = 'src'; // 源代码文件夹名称
const SCONSCRIPT_FILE = 'SConscript'; // 判断SiFli工程的依据文件

// SiFli SDK特定的指令
const COMPILE_COMMAND = 'scons --board=sf32lb52-lchspi-ulp -j8';
const MENUCONFIG_COMMAND = 'scons --board=sf32lb52-lchspi-ulp --menuconfig';
const DOWNLOAD_COMMAND = 'build_sf32lb52-lchspi-ulp_hcpu\\uart_download.bat';
// Clean 目标文件夹的相对路径，相对于 project 文件夹
const BUILD_TARGET_FOLDER = 'build_sf32lb52-lchspi-ulp_hcpu';

// 从用户提供的 settings.json 中提取 SF32 终端的配置
// 注意: 这里直接硬编码了路径和参数。更健壮的插件会去读取用户的 settings.json，但这会更复杂。
// 假设用户已经有此配置且路径不变。
const SF32_TERMINAL_PATH = "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const SF32_TERMINAL_ARGS = [
    "-ExecutionPolicy",
    "Bypass",
    "-NoExit",
    "-File",
    "E:\\SiFli-SDK\\sifli-sdk\\export.ps1"
];


// 任务名称常量 (保持不变，因为它们是给用户看的标签)
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";
const BUILD_DOWNLOAD_TASK_NAME = "SiFli: Build & Download";


// 状态栏按钮变量
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, buildDownloadBtn;
let buildTaskEndListener = null; 

/**
 * 辅助函数：获取或创建名为 'SF32' 的终端，并确保其工作目录为 'project' 子文件夹。
 * 创建时会使用 SF32 终端的特定配置来确保环境正确。
 * @returns {vscode.Terminal}
 */
async function getOrCreateSiFliTerminalAndCdProject() {
    console.log(`[SiFli Extension] Attempting to get or create terminal: ${TERMINAL_NAME}`);
    let terminal = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);

    if (!terminal) {
        console.log(`[SiFli Extension] Terminal "${TERMINAL_NAME}" not found, creating a new one with specific profile.`);
        // 使用 SF32 终端的精确配置来创建终端
        terminal = vscode.window.createTerminal({
            name: TERMINAL_NAME,
            shellPath: SF32_TERMINAL_PATH, //
            shellArgs: SF32_TERMINAL_ARGS //
        });
        
        // 确保工作区已打开
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);

            // 检查 project 文件夹是否存在
            if (fs.existsSync(projectPath) && fs.lstatSync(projectPath).isDirectory()) {
                // IMPORTANT: Give the terminal a moment to fully initialize and run its startup script (export.ps1)
                // before sending the 'cd' command. A small delay is often necessary.
                // The exact delay might need tuning.
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds

                terminal.sendText(`cd "${projectPath}"`); // 发送cd命令切换到project目录
                console.log(`[SiFli Extension] Sent 'cd "${projectPath}"' to terminal.`);
                vscode.window.showInformationMessage(`SiFli: Opened terminal "${TERMINAL_NAME}" and navigated to "${projectPath}"`);
            } else {
                vscode.window.showWarningMessage(`SiFli: Could not find '${PROJECT_SUBFOLDER}' folder at ${projectPath}. Commands might not work correctly.`);
                console.warn(`[SiFli Extension] Could not find '${PROJECT_SUBFOLDER}' folder at ${projectPath}.`);
            }
        } else {
            vscode.window.showWarningMessage('SiFli: No workspace folder open. Commands might not execute in the intended directory.');
            console.warn('[SiFli Extension] No workspace folder open.');
        }
    } else {
        console.log(`[SiFli Extension] Terminal "${TERMINAL_NAME}" already exists.`);
        // 如果终端已经存在，我们也需要确保它在正确的目录下。
        // 每次都发送 cd 命令是安全的做法，因为用户的操作可能改变了终端的当前目录。
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
            if (fs.existsSync(projectPath) && fs.lstatSync(projectPath).isDirectory()) {
                terminal.sendText(`cd "${projectPath}"`);
                console.log(`[SiFli Extension] Resent 'cd "${projectPath}"' to existing terminal.`);
            }
        }
    }

    terminal.show(true); // 显示终端并使其可见
    return terminal;
}

/**
 * 辅助函数：在已存在的终端中执行 shell 命令。
 * @param {string} commandLine 要执行的命令字符串
 * @param {string} taskName 任务的显示名称 (用于消息提示)
 * @returns {Promise<void>}
 */
async function executeShellCommandInTerminal(commandLine, taskName) {
    const terminal = await getOrCreateSiFliTerminalAndCdProject();

    console.log(`[SiFli Extension] Sending command "${commandLine}" for task "${taskName}" to terminal.`);
    terminal.sendText(commandLine); // 直接向终端发送命令
    vscode.window.showInformationMessage(`SiFli: Executing "${taskName}"...`);
}


// 执行编译任务
async function executeCompileTask() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            vscode.window.showWarningMessage('部分文件未能保存，构建可能基于旧版文件。');
            console.warn('[SiFli Extension] Not all files saved before compile.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        console.error('[SiFli Extension] Error saving files:', error);
        return;
    }

    await executeShellCommandInTerminal(COMPILE_COMMAND, BUILD_TASK_NAME);
}

// 执行下载任务
async function executeDownloadTask() {
    await executeShellCommandInTerminal(DOWNLOAD_COMMAND, DOWNLOAD_TASK_NAME);
}

// 执行 Menuconfig 任务
async function executeMenuconfigTask() {
    await executeShellCommandInTerminal(MENUCONFIG_COMMAND, MENUCONFIG_TASK_NAME);
}

// 执行清理命令 (删除特定 'build' 文件夹)
function executeCleanCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('请先打开一个工作区。');
        console.warn('[SiFli Extension] No workspace folder open for clean.');
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildFolderPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, BUILD_TARGET_FOLDER);

    vscode.window.showInformationMessage(`SiFli: Attempting to clean ${buildFolderPath}...`);
    console.log(`[SiFli Extension] Clean command: Checking for folder: ${buildFolderPath}`);

    if (fs.existsSync(buildFolderPath)) {
        try {
            fs.rmSync(buildFolderPath, { recursive: true, force: true });
            vscode.window.showInformationMessage(`'${BUILD_TARGET_FOLDER}' 文件夹已成功删除。`);
            console.log(`[SiFli Extension] Folder '${buildFolderPath}' deleted successfully.`);
        } catch (error) {
            vscode.window.showErrorMessage(`删除 '${BUILD_TARGET_FOLDER}' 文件夹失败: ${error.message}`);
            console.error(`[SiFli Extension] Clean failed for ${buildFolderPath}:`, error);
        }
    } else {
        vscode.window.showInformationMessage(`'${BUILD_TARGET_FOLDER}' 文件夹不存在，无需删除。`);
        console.log(`[SiFli Extension] Folder '${buildFolderPath}' not found, nothing to clean.`);
    }
}

// 更新状态栏按钮的提示信息
function updateStatusBarItems() {
    if (compileBtn) {
        compileBtn.tooltip = `执行 SiFli 构建 (${COMPILE_COMMAND})`;
    }
    if (rebuildBtn) {
        rebuildBtn.tooltip = `清理并执行 SiFli 构建`;
    }
    if (downloadBtn) {
        downloadBtn.tooltip = `执行 SiFli 下载 (${DOWNLOAD_COMMAND})`;
    }
    if (menuconfigBtn) {
        menuconfigBtn.tooltip = `打开 SiFli Menuconfig (${MENUCONFIG_COMMAND})`;
    }
    if (cleanBtn) {
        cleanBtn.tooltip = `删除 SiFli 构建缓存 (${BUILD_TARGET_FOLDER})`;
    }
    if (buildDownloadBtn) {
        buildDownloadBtn.tooltip = `构建并下载 SiFli 项目`;
    }
}

// 初始化状态栏按钮
function initializeStatusBarItems(context) {
    const CMD_PREFIX = "extension.";

    compileBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    compileBtn.text = '🛠️ Build';
    compileBtn.command = CMD_PREFIX + 'compile';
    compileBtn.show();
    context.subscriptions.push(compileBtn);

    rebuildBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    rebuildBtn.text = '♻️ Rebuild';
    rebuildBtn.command = CMD_PREFIX + 'rebuild';
    rebuildBtn.show();
    context.subscriptions.push(rebuildBtn);

    cleanBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    cleanBtn.text = '🗑️ Clean';
    cleanBtn.command = CMD_PREFIX + 'clean';
    cleanBtn.show();
    context.subscriptions.push(cleanBtn);

    downloadBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    downloadBtn.text = '💾 Download';
    downloadBtn.command = CMD_PREFIX + 'download';
    downloadBtn.show();
    context.subscriptions.push(downloadBtn);

    menuconfigBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    menuconfigBtn.text = '⚙️ Menuconfig';
    menuconfigBtn.command = CMD_PREFIX + 'menuconfig';
    menuconfigBtn.show();
    context.subscriptions.push(menuconfigBtn);

    buildDownloadBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    buildDownloadBtn.text = '🚀 Build & Download';
    buildDownloadBtn.command = CMD_PREFIX + 'buildAndDownload';
    buildDownloadBtn.show();
    context.subscriptions.push(buildDownloadBtn);

    updateStatusBarItems(); // 初始化tooltip
}


async function activate(context) {
    console.log('Congratulations, your SiFli extension is now active!');

    initializeStatusBarItems(context);

    const CMD_PREFIX = "extension.";

    // 插件激活时，根据 src/SConscript.py 文件是否存在来判断是否需要自动打开终端并cd
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const sconstructInSrcPath = path.join(workspaceRoot, SRC_SUBFOLDER, SCONSCRIPT_FILE); 
        console.log(`[SiFli Extension] Checking for SiFli project file: ${sconstructInSrcPath}`);
        
        if (fs.existsSync(sconstructInSrcPath)) {
            console.log(`[SiFli Extension] Found SConscript.py, attempting to initialize SF32 terminal.`);
            getOrCreateSiFliTerminalAndCdProject();
        } else {
            vscode.window.showInformationMessage('当前工作区可能不是 SiFli 项目。请确保 ' +
                                                `"${path.join(SRC_SUBFOLDER, SCONSCRIPT_FILE)}"` +
                                                ' 文件存在于您的项目中以正常使用本扩展。');
            console.log(`[SiFli Extension] SConscript.py not found at ${sconstructInSrcPath}. Not auto-initializing terminal.`);
        }
    } else {
        console.warn('[SiFli Extension] No workspace folder open on activation.');
    }

    // 注册所有命令
    context.subscriptions.push(
        vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
        vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
            executeCleanCommand(); // 先执行清理
            // 由于 executeCompileTask 直接 sendText，它不会等待清理完成。
            // 更好的做法是清理后再等待一段时间或监听清理结果，但这里保持简化。
            // 考虑到清理是文件操作，通常比编译快很多，这样串联多数情况是可行的。
            await executeCompileTask(); // 再执行编译
        }),
        vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
        vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
        vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
        vscode.commands.registerCommand(CMD_PREFIX + 'buildAndDownload', async () => {
            vscode.window.showInformationMessage('SiFli: Building and Downloading project...');
            // 简单化处理：直接在终端发送 'command1 && command2'
            // 这依赖于 shell 的 && 行为，前一个命令失败，后续命令不执行
            await executeShellCommandInTerminal(`${COMPILE_COMMAND} && ${DOWNLOAD_COMMAND}`, BUILD_DOWNLOAD_TASK_NAME);
        })
    );
}

function deactivate() {
    // 确保在插件停用时清理所有资源
    if (buildTaskEndListener) {
        buildTaskEndListener.dispose();
        buildTaskEndListener = null;
    }
    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };