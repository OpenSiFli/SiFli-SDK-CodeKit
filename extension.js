// one_step_for_sifli/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 定义SiFli SDK相关的常量 (保持不变)
const TERMINAL_NAME = 'SF32'; // SDK配置的终端名称
const PROJECT_SUBFOLDER = 'project'; // 工程文件夹名称（命令执行的实际工作目录）
const SRC_SUBFOLDER = 'src'; // 源代码文件夹名称
const SCONSCRIPT_FILE = 'SConscript'; // 判断SiFli工程的依据文件

// SiFli SDK特定的指令 (保持不变)
const COMPILE_COMMAND = 'scons --board=sf32lb52-lchspi-ulp -j8';
const MENUCONFIG_COMMAND = 'scons --board=sf32lb52-lchspi-ulp --menuconfig';
const DOWNLOAD_COMMAND = 'build_sf32lb52-lchspi-ulp_hcpu\\uart_download.bat';
// Clean 目标文件夹的相对路径，相对于 project 文件夹 (保持不变)
const BUILD_TARGET_FOLDER = 'build_sf32lb52-lchspi-ulp_hcpu';

// 从 VS Code 用户配置中读取路径，初始化为 let 变量
let SF32_TERMINAL_PATH;
let SIFLI_SDK_EXPORT_SCRIPT_PATH;
let SIFLI_SDK_ROOT_PATH;
let SF32_TERMINAL_ARGS;

/**
 * 辅助函数：读取并更新插件配置中的路径信息。
 * 在插件激活时调用，并在用户修改配置时监听并更新。
 */
function updateConfiguration() {
    const config = vscode.workspace.getConfiguration('one-step-for-sifli'); // 获取插件的配置
    SF32_TERMINAL_PATH = config.get('powershellPath'); // 读取 powershellPath 配置项
    SIFLI_SDK_EXPORT_SCRIPT_PATH = config.get('sifliSdkExportScriptPath'); // 读取 sifliSdkExportScriptPath 配置项

    // 根据 export 脚本路径计算 SDK 根目录
    SIFLI_SDK_ROOT_PATH = path.dirname(SIFLI_SDK_EXPORT_SCRIPT_PATH);

    // 重新构建终端启动参数
    SF32_TERMINAL_ARGS = [
        "-ExecutionPolicy",
        "Bypass",
        "-NoExit",
        "-File",
        SIFLI_SDK_EXPORT_SCRIPT_PATH
    ];
    console.log(`[SiFli Extension] Configuration updated:`);
    console.log(`  PowerShell Path: ${SF32_TERMINAL_PATH}`);
    console.log(`  SiFli SDK Export Script Path: ${SIFLI_SDK_EXPORT_SCRIPT_PATH}`);
}

// 任务名称常量 (保持不变)
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";
const BUILD_DOWNLOAD_TASK_NAME = "SiFli: Build & Download";


// 状态栏按钮变量 (保持不变)
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, buildDownloadBtn;

/**
 * 辅助函数：判断当前工作区是否是 SiFli SDK 工程。 (保持不变)
 * 判断依据是工作区根目录下是否存在 'src/SConscript' 文件。
 * @returns {boolean} 如果是 SiFli 工程则返回 true，否则返回 false。
 */
function isSiFliProject() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        console.log('[SiFli Extension] No workspace folder open. Not a SiFli project.');
        return false;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    // === 修正点 1：检查路径是否正确 ===
    // 假设 SConscript 在工作区根目录下的 src 文件夹内
    const sconstructPathToCheck = path.join(workspaceRoot, SRC_SUBFOLDER, SCONSCRIPT_FILE);

    const isProject = fs.existsSync(sconstructPathToCheck);
    console.log(`[SiFli Extension] Checking for SiFli project file: ${sconstructPathToCheck} - Found: ${isProject}`);
    return isProject;
}

/**
 * 辅助函数：获取或创建名为 'SF32' 的终端，并确保其工作目录为 'project' 子文件夹。 (保持不变)
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
            shellPath: SF32_TERMINAL_PATH, // PowerShell 可执行文件
            shellArgs: SF32_TERMINAL_ARGS, // PowerShell 启动参数，包括执行 export.ps1
            // === 修正点：设置 PowerShell 的初始工作目录为 export.ps1 所在的目录 ===
            cwd: SIFLI_SDK_ROOT_PATH // 这确保了 export.ps1 在正确的上下文环境中运行
        });

        // IMPORTANT: 等待足够的时间，确保终端启动和 export.ps1 执行完成
        // 5秒的延迟是给 powershell 启动和 export.ps1 运行留足时间
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 确保工作区已打开
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);

            // 检查 project 文件夹是否存在
            if (fs.existsSync(projectPath) && fs.lstatSync(projectPath).isDirectory()) {
                terminal.sendText(`cd "${projectPath}"`); // 发送cd命令切换到project目录
                console.log(`[SiFli Extension] Sent 'cd "${projectPath}"' to terminal.`);
                // 移除：vscode.window.showInformationMessage(`SiFli: Opened terminal "${TERMINAL_NAME}" and navigated to "${projectPath}"`);
            } else {
                vscode.window.showWarningMessage(`SiFli: 无法找到 '${PROJECT_SUBFOLDER}' 文件夹。部分命令可能无法正常工作。`);
                console.warn(`[SiFli Extension] Could not find '${PROJECT_SUBFOLDER}' folder at ${projectPath}.`);
            }
        } else {
            vscode.window.showWarningMessage('SiFli: 未打开工作区。命令可能无法在预期目录执行。');
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
                terminal.sendText(`cd "${projectPath}"`); // 确保每次执行命令前都在正确目录
                console.log(`[SiFli Extension] Resent 'cd "${projectPath}"' to existing terminal.`);
            }
        }
    }

    terminal.show(true); // 显示终端并使其可见
    return terminal;
}

/**
 * 辅助函数：在已存在的SF32终端中执行 shell 命令。 (保持不变)
 * @param {string} commandLine 要执行的命令字符串
 * @param {string} taskName 任务的显示名称 (用于消息提示)
 * @returns {Promise<void>}
 */
async function executeShellCommandInSiFliTerminal(commandLine, taskName) {
    const terminal = await getOrCreateSiFliTerminalAndCdProject();

    console.log(`[SiFli Extension] Sending command "${commandLine}" for task "${taskName}" to SF32 terminal.`);
    terminal.sendText(commandLine); // 直接向终端发送命令
    // vscode.window.showInformationMessage(`SiFli: 正在执行 "${taskName}"...`);
}


// 执行编译任务 (保持不变)
async function executeCompileTask() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            // 保留此条，因为这是构建可能出现问题的警告
            vscode.window.showWarningMessage('部分文件未能保存，构建可能基于旧版文件。');
            console.warn('[SiFli Extension] Not all files saved before compile.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        console.error('[SiFli Extension] Error saving files:', error);
        return;
    }

    await executeShellCommandInSiFliTerminal(COMPILE_COMMAND, BUILD_TASK_NAME);
}

// 执行下载任务 (保持不变)
async function executeDownloadTask() {
    await executeShellCommandInSiFliTerminal(DOWNLOAD_COMMAND, DOWNLOAD_TASK_NAME);
}

// 执行 Menuconfig 任务 (保持不变)
async function executeMenuconfigTask() {
    await executeShellCommandInSiFliTerminal(MENUCONFIG_COMMAND, MENUCONFIG_TASK_NAME);
}

// 执行清理命令 (删除特定 'build' 文件夹) (保持不变)
function executeCleanCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        // vscode.window.showErrorMessage('请先打开一个工作区。');
        console.warn('[SiFli Extension] No workspace folder open for clean.');
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const buildFolderPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, BUILD_TARGET_FOLDER);

    // vscode.window.showInformationMessage(`SiFli: 尝试清理 ${BUILD_TARGET_FOLDER} 文件夹...`);
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

// 更新状态栏按钮的提示信息 (保持不变)
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

// 初始化状态栏按钮 (保持不变)
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

    buildDownloadBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    buildDownloadBtn.text = '🚀 Build & Download';
    buildDownloadBtn.command = CMD_PREFIX + 'buildAndDownload';
    buildDownloadBtn.show();
    context.subscriptions.push(buildDownloadBtn);
    
    menuconfigBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    menuconfigBtn.text = '⚙️ Menuconfig';
    menuconfigBtn.command = CMD_PREFIX + 'menuconfig';
    menuconfigBtn.show();
    context.subscriptions.push(menuconfigBtn);

    updateStatusBarItems(); // 初始化tooltip
}

async function activate(context) {
    console.log('Congratulations, your SiFli extension is now active!');

    updateConfiguration(); // 在插件激活时立即读取配置

    // 监听配置变化，当用户在 VS Code 设置中修改插件的相关配置时，重新读取并更新这些路径变量。
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        // 检查是否是 'one-step-for-sifli' 相关的配置发生了变化
        if (e.affectsConfiguration('one-step-for-sifli')) {
            updateConfiguration(); // 更新内部的路径变量
            vscode.window.showInformationMessage('SiFli 插件配置已更新。若要确保所有更改生效，可能需要重启 VS Code。');
        }
    }));


    const CMD_PREFIX = "extension.";

    // 只有是 SiFli 项目才激活插件功能
    if (isSiFliProject()) {
        console.log('[SiFli Extension] SiFli project detected. Activating full extension features.');
        // vscode.window.showInformationMessage('SiFli 项目已检测到，插件功能已激活。');

        // 只有是 SiFli 项目才初始化状态栏按钮
        initializeStatusBarItems(context);

        // 只有是 SiFli 项目才自动打开并配置终端
        // await 确保终端初始化完成后再继续执行后续代码
        await getOrCreateSiFliTerminalAndCdProject();

        // 只有是 SiFli 项目才注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
                executeCleanCommand();
                // 添加一个小的延迟，确保清理完成再开始编译（非严格等待，但通常够用）
                await new Promise(resolve => setTimeout(resolve, 500));
                await executeCompileTask();
            }),
            vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
            vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'buildAndDownload', async () => {
                // 保留此条，因为这是命令组合的开始提示
                // vscode.window.showInformationMessage('SiFli: 正在构建并下载项目...');
                // 针对 PowerShell 兼容性已修正：使用分号顺序执行，并使用 if ($LASTEXITCODE -eq 0) 模拟 && 的条件执行
                await executeShellCommandInSiFliTerminal(`${COMPILE_COMMAND}; if ($LASTEXITCODE -eq 0) { .\\${DOWNLOAD_COMMAND} }`, BUILD_DOWNLOAD_TASK_NAME);
            })
        );
    } else {
        console.log('[SiFli Extension] Not a SiFli project. Extension features will not be activated.');
        // 保留此条，因为这是插件未激活的原因提示
        vscode.window.showInformationMessage('当前工作区不是 SiFli 项目，插件功能未激活。请确保 ' +
                                            `"${path.join(SRC_SUBFOLDER, SCONSCRIPT_FILE)}"` +
                                            ' 文件存在于您的项目中以正常使用本扩展。');
    }
}

function deactivate() {
    // 确保在插件停用时清理所有状态栏按钮，防止资源泄露 (保持不变)
    if (compileBtn) compileBtn.dispose();
    if (rebuildBtn) rebuildBtn.dispose();
    if (cleanBtn) cleanBtn.dispose();
    if (downloadBtn) downloadBtn.dispose();
    if (menuconfigBtn) menuconfigBtn.dispose();
    if (buildDownloadBtn) buildDownloadBtn.dispose();

    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };