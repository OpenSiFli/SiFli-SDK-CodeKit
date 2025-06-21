// one_step_for_sifli/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os'); // 引入 os 模块用于获取临时目录

// 定义SiFli SDK相关的常量
const TERMINAL_NAME = 'SF32'; // SDK配置的终端名称
const PROJECT_SUBFOLDER = 'project'; // 工程文件夹名称（命令执行的实际工作目录）
const SRC_SUBFOLDER = 'src'; // 源代码文件夹名称
const SCONSCRIPT_FILE = 'SConscript'; // 判断SiFli工程的依据文件

// SiFli SDK特定的指令
const COMPILE_COMMAND = 'scons --board=sf32lb52-lchspi-ulp -j8';
const MENUCONFIG_COMMAND = 'scons --board=sf32lb52-lchspi-ulp --menuconfig';
const DOWNLOAD_SCRIPT_RELATIVE_PATH = 'build_sf32lb52-lchspi-ulp_hcpu\\uart_download.bat';
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

// 任务名称常量
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";
const BUILD_DOWNLOAD_TASK_NAME = "SiFli: Build & Download";


// 状态栏按钮变量
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, buildDownloadBtn;

/**
 * 辅助函数：判断当前工作区是否是 SiFli SDK 工程。
 * 判断依据是工作区根目录下是否存在 'src/SConscript' 文件。
 * @returns {boolean} 如果是 SiFli 工程则返回 true，否则返回 false。
 */
function isSiFliProject() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        console.log('[SiFli Extension] No workspace folder open. Not a SiFli project.');
        return false;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const sconstructPathToCheck = path.join(workspaceRoot, SRC_SUBFOLDER, SCONSCRIPT_FILE);

    const isProject = fs.existsSync(sconstructPathToCheck);
    console.log(`[SiFli Extension] Checking for SiFli project file: ${sconstructPathToCheck} - Found: ${isProject}`);
    return isProject;
}

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
        terminal = vscode.window.createTerminal({
            name: TERMINAL_NAME,
            shellPath: SF32_TERMINAL_PATH, // PowerShell 可执行文件
            shellArgs: SF32_TERMINAL_ARGS, // PowerShell 启动参数，包括执行 export.ps1
            cwd: SIFLI_SDK_ROOT_PATH // 这确保了 export.ps1 在正确的上下文环境中运行
        });

        await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒的延迟是给 powershell 启动和 export.ps1 运行留足时间

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);

            if (fs.existsSync(projectPath) && fs.lstatSync(projectPath).isDirectory()) {
                terminal.sendText(`cd "${projectPath}"`); // 发送cd命令切换到project目录
                console.log(`[SiFli Extension] Sent 'cd "${projectPath}"' to terminal.`);
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
 * 辅助函数：在已存在的SF32终端中执行 shell 命令。
 * @param {string} commandLine 要执行的命令字符串
 * @param {string} taskName 任务的显示名称 (用于消息提示)
 * @param {string} [serialPortNumInput] 可选的串口号输入，如果提供则在命令后发送
 * @returns {Promise<void>}
 */
async function executeShellCommandInSiFliTerminal(commandLine, taskName, serialPortNumInput = '') {
    const terminal = await getOrCreateSiFliTerminalAndCdProject();

    console.log(`[SiFli Extension] Sending command "${commandLine}" for task "${taskName}" to SF32 terminal.`);
    terminal.sendText(commandLine); // 直接向终端发送命令

    // 如果提供了串口号输入，则在发送命令后立即发送
    if (serialPortNumInput) {
        // 等待一小段时间，确保 bat 脚本输出 "please input the serial port num:"
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 秒延迟，可能需要根据实际情况微调
        terminal.sendText(serialPortNumInput); // 发送串口号
    }
}

/**
 * 辅助函数：通过 PowerShell Get-WmiObject 获取当前系统中所有可用的 CH340 串口设备。
 * @returns {Promise<Array<{name: string, com: string, manufacturer?: string, description?: string}>>} 返回一个 Promise，解析为串口设备数组。
 */
async function getSerialPorts() {
    let detectedPorts = new Set(); // 使用 Set 避免重复的 COM 端口

    try {
        // 定义 PowerShell 脚本内容，直接在其中使用 PowerShell 的引号和转义规则
        const powershellScriptContent = `
            Get-WmiObject Win32_PnPEntity | Where-Object { ($_.Name -match "COM\\d+" -and ($_.Manufacturer -like "*wch.cn*" -or $_.Name -like "*CH340*")) } | Select-Object Name, Description, Manufacturer, DeviceID | ForEach-Object { $_.Name -match "\\((COM\\d+)\\)" | Out-Null; [PSCustomObject]@{ Name = $_.Name; COM = $Matches[1]; Manufacturer = $_.Manufacturer; Description = $_.Description } } | ConvertTo-Json
        `;

        // 创建一个临时 PowerShell 脚本文件
        const tempScriptPath = path.join(os.tmpdir(), `get_serial_ports_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, powershellScriptContent, { encoding: 'utf8' });

        const { stdout: psStdout, stderr: psStderr } = await new Promise((resolve, reject) => {
            // 执行临时 PowerShell 脚本文件
            // 使用 -File 参数而不是 -Command，并设置 ExecutionPolicy 以允许脚本执行
            exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${tempScriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => { // 增加超时到15秒
                // 清理临时文件
                try {
                    fs.unlinkSync(tempScriptPath); // 同步删除，确保删除完成
                } catch (cleanupError) {
                    console.warn(`[SiFli Extension] 无法删除临时 PowerShell 脚本文件 ${tempScriptPath}: ${cleanupError.message}`);
                }

                if (error) {
                    console.error(`[SiFli Extension] 执行 PowerShell 脚本失败: ${error.message}`);
                    return reject(error);
                }
                resolve({ stdout, stderr });
            });
        });

        if (psStderr) {
            console.warn(`[SiFli Extension] PowerShell 获取串口警告: ${psStderr}`);
        }

        try {
            const psSerialPorts = JSON.parse(psStdout.trim());
            // 如果只有单个对象而非数组，或者 stdout 为空，确保能正确处理
            const portsArray = Array.isArray(psSerialPorts) ? psSerialPorts : (psSerialPorts ? [psSerialPorts] : []);
            
            portsArray.forEach(p => {
                // 进一步确保获取到的 COM 端口是有效的，且 Manufacturer 或 Name 明确指示是 CH340
                // p.Manufacturer?.includes('wch.cn') 使用可选链，确保即使 Manufacturer 为 null/undefined 也不会报错
                if (p.COM && (p.Manufacturer?.includes('wch.cn') || p.Name?.includes('CH340'))) {
                    detectedPorts.add(JSON.stringify({
                        name: p.Name,
                        com: p.COM.toUpperCase(),
                        manufacturer: p.Manufacturer,
                        description: p.Description
                    }));
                }
            });
        } catch (parseError) {
            console.warn(`[SiFli Extension] 解析 PowerShell 串口信息失败 (可能没有CH340串口或输出格式不符): ${parseError.message}`);
            // 当没有 CH340 串口时，stdout 可能为空或不是有效的 JSON，这里是预期行为
        }
    } catch (error) {
        // 捕获 exec 错误，例如 powershell.exe 未找到或权限问题
        vscode.window.showErrorMessage(`无法执行 PowerShell 命令获取串口列表。请确保 PowerShell 已正确安装并可访问。错误信息: ${error.message}`);
        console.error(`[SiFli Extension] 获取串口失败 (PowerShell exec error): ${error.message}`);
    }

    const finalPorts = Array.from(detectedPorts).map(item => JSON.parse(item));
    console.log('[SiFli Extension] Final detected serial ports:', finalPorts);
    return finalPorts;
}

/**
 * 辅助函数：处理下载前的串口选择逻辑。
 * 根据检测到的 "USB-SERIAL CH340" 串口数量，进行自动化或用户交互。
 * @returns {Promise<string|null>} 返回选择的串口号的纯数字，如果用户取消则返回 null。
 */
async function selectSerialPort() {
    try {
        const serialPorts = await getSerialPorts();

        if (serialPorts.length === 0) {
            // 无串口：提示用户检查设备连接
            vscode.window.showWarningMessage('未检测到 USB-SERIAL CH340 串口设备。请检查设备连接、驱动安装或 SDK 配置中的 PowerShell 路径。');
            return null;
        } else if (serialPorts.length === 1) {
            // 单个串口：自动提取并返回串口号的纯数字
            const comPortFull = serialPorts[0].com; // 例如 "COM5"
            const comPortNum = comPortFull.replace('COM', ''); // 提取数字，例如 "5"
            vscode.window.showInformationMessage(`检测到单个 USB-SERIAL CH340 串口：${serialPorts[0].name}，自动选择 COM 端口：${comPortNum}。`);
            return comPortNum;
        } else {
            // 多个串口：弹出一个选择界面供用户选择
            const pickOptions = serialPorts.map(p => ({
                label: p.name,
                description: `COM 端口: ${p.com}`,
                com: p.com // 存储完整的 COM 字符串
            }));

            const selectedPort = await vscode.window.showQuickPick(pickOptions, {
                placeHolder: '检测到多个 USB-SERIAL CH340 串口，请选择一个进行烧录：'
            });

            if (selectedPort) {
                const comPortNum = selectedPort.com.replace('COM', ''); // 提取纯数字
                vscode.window.showInformationMessage(`已选择串口：${comPortNum}`);
                return comPortNum;
            } else {
                vscode.window.showInformationMessage('已取消串口选择。');
                return null;
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`获取或选择串口时发生错误: ${error.message}`);
        console.error('[SiFli Extension] Error selecting serial port:', error);
        return null;
    }
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

    await executeShellCommandInSiFliTerminal(COMPILE_COMMAND, BUILD_TASK_NAME);
}

// 执行下载任务
async function executeDownloadTask() {
    const serialPort = await selectSerialPort();
    if (serialPort) {
        await executeShellCommandInSiFliTerminal(`.\\${DOWNLOAD_SCRIPT_RELATIVE_PATH}`, DOWNLOAD_TASK_NAME, serialPort);
    }
}

// 执行 Menuconfig 任务
async function executeMenuconfigTask() {
    await executeShellCommandInSiFliTerminal(MENUCONFIG_COMMAND, MENUCONFIG_TASK_NAME);
}

// 执行清理命令 (删除特定 'build' 文件夹)
function executeCleanCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[SiFli Extension] No workspace folder open for clean.');
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const buildFolderPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, BUILD_TARGET_FOLDER);

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
        downloadBtn.tooltip = `执行 SiFli 下载`;
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

// 执行编译并下载任务
async function executeBuildAndDownloadTask() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            vscode.window.showWarningMessage('部分文件未能保存，构建可能基于旧版文件。');
            console.warn('[SiFli Extension] Not all files saved before build and download.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        console.error('[SiFli Extension] Error saving files:', error);
        return;
    }

    const serialPort = await selectSerialPort();
    if (serialPort) {
        const command = `${COMPILE_COMMAND}; if ($LASTEXITCODE -eq 0) { .\\${DOWNLOAD_SCRIPT_RELATIVE_PATH} }`;
        await executeShellCommandInSiFliTerminal(command, BUILD_DOWNLOAD_TASK_NAME, serialPort);
    }
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
        
        initializeStatusBarItems(context); // 只有是 SiFli 项目才初始化状态栏按钮

        await getOrCreateSiFliTerminalAndCdProject(); // 只有是 SiFli 项目才自动打开并配置终端

        // 只有是 SiFli 项目才注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
                executeCleanCommand();
                await new Promise(resolve => setTimeout(resolve, 500)); // 添加一个小的延迟，确保清理完成再开始编译（非严格等待，但通常够用）
                await executeCompileTask();
            }),
            vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
            vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'buildAndDownload', () => executeBuildAndDownloadTask())
        );
    } else {
        console.log('[SiFli Extension] Not a SiFli project. Extension features will not be activated.');
    }
}

function deactivate() {
    // 确保在插件停用时清理所有状态栏按钮，防止资源泄露
    if (compileBtn) compileBtn.dispose();
    if (rebuildBtn) rebuildBtn.dispose();
    if (cleanBtn) cleanBtn.dispose();
    if (downloadBtn) downloadBtn.dispose();
    if (menuconfigBtn) menuconfigBtn.dispose();
    if (buildDownloadBtn) buildDownloadBtn.dispose();

    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };