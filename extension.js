// one_step_for_sifli/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const axios = require('axios');

// 定义SiFli SDK相关的常量
const TERMINAL_NAME = 'SF32'; // SDK配置的终端名称
const PROJECT_SUBFOLDER = 'project'; // 工程文件夹名称（命令执行的实际工作目录）
const SRC_SUBFOLDER = 'src'; // 源代码文件夹名称
const SCONSCRIPT_FILE = 'SConscript'; // 判断SiFli工程的依据文件

// 支持的所有芯片模组列表
const SUPPORTED_BOARD_NAMES = [
    "sf32lb52-lcd_52d",
    "sf32lb52-lcd_base",
    "sf32lb52-lcd_n16r8",
    "sf32lb52-lchspi-ulp",
    "sf32lb52-lchspi-ulp_base",
    "sf32lb52-nano_52b",
    "sf32lb52-nano_52j",
    "sf32lb52-nano_base",
    "sf32lb56-lcd_a128r12n1",
    "sf32lb56-lcd_base",
    "sf32lb56-lcd_n16r12n1",
    "sf32lb58-lcd_a128r32n1_dsi",
    "sf32lb58-lcd_base",
    "sf32lb58-lcd_n16r32n1_dpi",
    "sf32lb58-lcd_n16r32n1_dsi",
    "sf32lb58-lcd_n16r64n4"
];

// 从 VS Code 用户配置中读取路径，初始化为 let 变量
let SF32_TERMINAL_PATH;
let SIFLI_SDK_EXPORT_SCRIPT_PATH;
let SIFLI_SDK_ROOT_PATH;
let SF32_TERMINAL_ARGS;
let selectedBoardName;          // 当前选中的芯片模组名称
let numThreads;                 // 编译线程数

// 任务名称常量
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";
const BUILD_DOWNLOAD_TASK_NAME = "SiFli: Build & Download";

// 状态栏按钮变量
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, buildDownloadBtn, currentBoardStatusItem, sdkManageBtn;

// 定义一个常量用于全局状态的键，表示是否已经执行过首次设置
const HAS_RUN_INITIAL_SETUP_KEY = 'oneStepForSifli.hasRunInitialSetup';

// SiFli SDK 仓库基础 API 地址 (不包含 /releases)
const SIFLI_SDK_GITHUB_REPO_BASE = 'https://api.github.com/repos/OpenSiFli/SiFli-SDK';
const SIFLI_SDK_GITEE_REPO_BASE = 'https://gitee.com/api/v5/repos/SiFli/sifli-sdk';

// 新增 Git 仓库URL常量 [新增]
const SIFLI_SDK_GITHUB_REPO_GIT = 'https://github.com/OpenSiFli/SiFli-SDK.git';
const SIFLI_SDK_GITEE_REPO_GIT = 'https://gitee.com/SiFli/sifli-sdk.git';

/**
 * 辅助函数：根据选定的芯片模组和线程数动态生成 SCons 编译命令。
 * @param {string} boardName 选定的芯片模组名称
 * @param {number} threads 编译线程数
 * @returns {string} 完整的编译命令
 */
function getCompileCommand(boardName, threads) {
    return `scons --board=${boardName} -j${threads}`;
}

/**
 * 辅助函数：根据选定的芯片模组动态生成 Menuconfig 命令。
 * @param {string} boardName 选定的芯片模组名称
 * @returns {string} 完整的 Menuconfig 命令
 */
function getMenuconfigCommand(boardName) {
    return `scons --board=${boardName} --menuconfig`;
}

/**
 * 辅助函数：根据选定的芯片模组动态生成下载脚本的相对路径。
 * @param {string} boardName 选定的芯片模组名称
 * @returns {string} 下载脚本的相对路径
 */
function getDownloadScriptRelativePath(boardName) {
    return `build_${boardName}_hcpu\\uart_download.bat`;
}

/**
 * 辅助函数：根据选定的芯片模组动态生成构建目标文件夹名称。
 * @param {string} boardName 选定的芯片模组名称
 * @returns {string} 构建目标文件夹名称
 */
function getBuildTargetFolder(boardName) {
    return `build_${boardName}_hcpu`;
}

/**
 * 辅助函数：读取并更新插件配置中的路径信息。
 * 在插件激活时调用，并在用户修改配置时监听并更新。
 */
function updateConfiguration() {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    SF32_TERMINAL_PATH = config.get('powershellPath');
    SIFLI_SDK_EXPORT_SCRIPT_PATH = config.get('sifliSdkExportScriptPath');
    selectedBoardName = config.get('defaultChipModule'); // 读取默认芯片模组
    numThreads = config.get('numThreads', os.cpus().length > 0 ? os.cpus().length : 8); // 读取线程数，默认为CPU核心数或8

    // 确保 selectedBoardName 是 SUPPORTED_BOARD_NAMES 之一，如果不是则使用 package.json 中的默认值
    if (!SUPPORTED_BOARD_NAMES.includes(selectedBoardName)) {
        // 这里的逻辑是如果当前配置的值无效，则回退到 package.json 中定义的默认值。
        // package.json 默认值是 "sf32lb52-lchspi-ulp" (SUPPORTED_BOARD_NAMES[3])
        selectedBoardName = config.inspect('defaultChipModule').defaultValue; // 获取 package.json 中的默认值
        // 如果 package.json 中也没有定义默认值，则强制使用我们列表的第一个
        if (!selectedBoardName || !SUPPORTED_BOARD_NAMES.includes(selectedBoardName)) {
             selectedBoardName = SUPPORTED_BOARD_NAMES[3]; // Fallback to a safe default
        }
        vscode.window.showWarningMessage(`SiFli: 配置中的芯片模组 "${selectedBoardName}" 无效或未设置，已使用默认值。`);
    }

    // 确保 numThreads 是有效的正整数
    if (typeof numThreads !== 'number' || numThreads <= 0 || !Number.isInteger(numThreads)) {
        numThreads = os.cpus().length > 0 ? os.cpus().length : 8; // 默认为CPU核心数或8
        vscode.window.showWarningMessage(`SiFli: 配置中的编译线程数 "${numThreads}" 无效，已使用默认值 ${numThreads}。`);
    }


    // 根据 export 脚本路径计算 SDK 根目录
    // 假设 export.ps1 位于 SDK 的根目录
    if (SIFLI_SDK_EXPORT_SCRIPT_PATH && fs.existsSync(SIFLI_SDK_EXPORT_SCRIPT_PATH)) {
        SIFLI_SDK_ROOT_PATH = path.dirname(SIFLI_SDK_EXPORT_SCRIPT_PATH);
    } else {
        // 如果路径无效，给一个默认值或提示用户
        SIFLI_SDK_ROOT_PATH = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath : os.homedir(); //
        vscode.window.showWarningMessage('SiFli SDK export.ps1 脚本路径未配置或无效，请在扩展设置中检查。');
    }

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
    console.log(`  Selected SiFli Board: ${selectedBoardName}`);
    console.log(`  Compilation Threads: ${numThreads}`);


    updateStatusBarItems(); // 配置更新后，更新状态栏显示
}

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
            vscode.window.showInformationMessage(`检测到单个 USB-SERIAL CH340 串口，自动选择 COM 端口：${comPortNum}。`);
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

    const compileCommand = getCompileCommand(selectedBoardName, numThreads);
    await executeShellCommandInSiFliTerminal(compileCommand, BUILD_TASK_NAME);
}

// 执行下载任务
async function executeDownloadTask() {
    const serialPort = await selectSerialPort();
    if (serialPort) {
        const downloadScriptPath = getDownloadScriptRelativePath(selectedBoardName);
        await executeShellCommandInSiFliTerminal(`.\\${downloadScriptPath}`, DOWNLOAD_TASK_NAME, serialPort);
    }
}

// 执行 Menuconfig 任务
async function executeMenuconfigTask() {
    const menuconfigCommand = getMenuconfigCommand(selectedBoardName);
    await executeShellCommandInSiFliTerminal(menuconfigCommand, MENUCONFIG_TASK_NAME);
}

// 执行清理命令 (删除特定 'build' 文件夹)
function executeCleanCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[SiFli Extension] No workspace folder open for clean.');
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const buildFolderPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, getBuildTargetFolder(selectedBoardName));

    console.log(`[SiFli Extension] Clean command: Checking for folder: ${buildFolderPath}`);
    if (fs.existsSync(buildFolderPath)) {
        try {
            fs.rmSync(buildFolderPath, { recursive: true, force: true });
            vscode.window.showInformationMessage(`'${getBuildTargetFolder(selectedBoardName)}' 文件夹已成功删除。`);
            console.log(`[SiFli Extension] Folder '${buildFolderPath}' deleted successfully.`);
        } catch (error) {
            vscode.window.showErrorMessage(`删除 '${getBuildTargetFolder(selectedBoardName)}' 文件夹失败: ${error.message}`);
            console.error(`[SiFli Extension] Clean failed for ${buildFolderPath}:`, error);
        }
    } else {
        vscode.window.showInformationMessage(`'${getBuildTargetFolder(selectedBoardName)}' 文件夹不存在，无需删除。`);
        console.log(`[SiFli Extension] Folder '${buildFolderPath}' not found, nothing to clean.`);
    }
}

// 更新状态栏按钮的提示信息
function updateStatusBarItems() {
    if (compileBtn) {
        compileBtn.tooltip = `执行 SiFli 构建 (${getCompileCommand(selectedBoardName, numThreads)})`;
    }
    if (rebuildBtn) {
        rebuildBtn.tooltip = `清理并执行 SiFli 构建`;
    }
    if (cleanBtn) {
        cleanBtn.tooltip = `删除 SiFli 构建缓存 (${getBuildTargetFolder(selectedBoardName)})`;
    }
    if (downloadBtn) {
        downloadBtn.tooltip = `执行 SiFli 下载 (当前模组: ${selectedBoardName})`;
    }
    if (menuconfigBtn) {
        menuconfigBtn.tooltip = `打开 SiFli Menuconfig (${getMenuconfigCommand(selectedBoardName)})`;
    }
    if (buildDownloadBtn) {
        buildDownloadBtn.tooltip = `构建并下载 SiFli 项目 (当前模组: ${selectedBoardName})`;
    }
    if (currentBoardStatusItem) {
        currentBoardStatusItem.text = `SiFli Board: ${selectedBoardName} (J${numThreads})`; // 显示线程数
        currentBoardStatusItem.tooltip = `当前 SiFli 芯片模组: ${selectedBoardName}\n编译线程数: J${numThreads}\n点击切换芯片模组或修改线程数`;
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

    // 显示当前板卡的状态栏项 (现在可点击)
    currentBoardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule'; // 新增：绑定命令
    currentBoardStatusItem.show();
    context.subscriptions.push(currentBoardStatusItem);

    updateStatusBarItems(); // 初始化tooltip和板卡显示
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
        const compileCommand = getCompileCommand(selectedBoardName, numThreads);
        const downloadScriptPath = getDownloadScriptRelativePath(selectedBoardName);
        // PowerShell 命令组合，确保编译成功后才执行下载
        const command = `${compileCommand}; if ($LASTEXITCODE -eq 0) { .\\${downloadScriptPath} }`;
        await executeShellCommandInSiFliTerminal(command, BUILD_DOWNLOAD_TASK_NAME, serialPort);
    }
}

/**
 * 提示用户选择初始芯片模组，并保存到配置中。
 * 仅在首次激活且未设置有效默认模组时调用。
 * @param {vscode.ExtensionContext} context 扩展上下文，用于访问全局状态。
 */
async function promptForInitialBoardSelection(context) {
    const hasRunInitialSetup = context.globalState.get(HAS_RUN_INITIAL_SETUP_KEY, false);

    if (!hasRunInitialSetup) {
        vscode.window.showInformationMessage('请选择您当前要开发的芯片模组。');

        // 定义你想要的自定义描述映射
        const CUSTOM_DESCRIPTIONS = {
            'sf32lb52-lchspi-ulp': '黄山派',
            // 根据需要添加更多模组和描述
            // '模组': '描述',
        };

        const pickOptions = SUPPORTED_BOARD_NAMES.map(board => {
            // 如果在 CUSTOM_DESCRIPTIONS 中找到对应描述，则使用它；否则使用通用描述
            const description = CUSTOM_DESCRIPTIONS[board];
            return {
                label: board,
                description: description
            };
        });

        const selected = await vscode.window.showQuickPick(pickOptions, {
            placeHolder: '请选择一个 SiFli 芯片模组',
            canPickMany: false,
            ignoreFocusOut: true
        });

        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        const defaultBoardFromPackageJson = config.inspect('defaultChipModule').defaultValue;

        if (selected) {
            await config.update('defaultChipModule', selected.label, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`SiFli 默认模组已设置为: ${selected.label}`);
            await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
        } else {
            await config.update('defaultChipModule', defaultBoardFromPackageJson, vscode.ConfigurationTarget.Global);
            vscode.window.showWarningMessage(`未选择芯片模组，已将默认模组重置为: ${defaultBoardFromPackageJson}。您可以在 VS Code 设置中修改。`);
            await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
        }
    }
}

/**
 * 处理用户点击状态栏芯片模组，选择或修改模组的命令。
 */
async function selectChipModule() {
    // 允许用户选择芯片模组
    const boardPickOptions = SUPPORTED_BOARD_NAMES.map(board => ({
        label: board,
        description: board === selectedBoardName ? '当前选中' : ''
    }));

    const selectedBoard = await vscode.window.showQuickPick(boardPickOptions, {
        placeHolder: '选择 SiFli 芯片模组',
        title: '选择芯片模组'
    });

    if (selectedBoard) {
        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        // 更新全局配置
        await config.update('defaultChipModule', selectedBoard.label, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`SiFli 芯片模组已切换为: ${selectedBoard.label}`);
        // updateConfiguration() 会在配置变化监听器中自动调用
    }

    // 允许用户修改线程数
    const numThreadsInput = await vscode.window.showInputBox({
        prompt: `输入编译线程数 (当前: J${numThreads})`,
        value: String(numThreads),
        validateInput: value => {
            const parsed = parseInt(value);
            if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
                return '请输入一个正整数。';
            }
            return null;
        }
    });

    if (numThreadsInput !== undefined && numThreadsInput !== String(numThreads)) {
        const newThreads = parseInt(numThreadsInput);
        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        await config.update('numThreads', newThreads, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`编译线程数已设置为: J${newThreads}`);
        // updateConfiguration() 会在配置变化监听器中自动调用
    }
}


async function activate(context) {
    console.log('Congratulations, your SiFli extension is now active!');

    // *** 仅在开发调试时使用：强制重置首次运行标志 ***
    // 这将使得每次“重新运行调试”时，Quick Pick 都会弹出。
    // 在发布生产版本时，请务必删除或注释掉此行！
    
    // ******************************************************
    await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false); //
    // ******************************************************

    // 在插件激活时立即读取配置
    updateConfiguration();

    // 只有是 SiFli 项目才激活插件功能
    if (isSiFliProject()) {
        console.log('[SiFli Extension] SiFli project detected. Activating full extension features.');

        initializeStatusBarItems(context); // 只有是 SiFli 项目才初始化状态栏按钮

        // 在初始化配置和状态栏后，检查是否需要提示用户选择初始芯片模组
        // 使用 setTimeout 稍微延迟，确保初始化完成
        setTimeout(async () => {
            // 传入 context 以便访问 globalState
            await promptForInitialBoardSelection(context);
            // 在确保板卡选择后，再尝试创建终端并 cd
            await getOrCreateSiFliTerminalAndCdProject();
        }, 500);


        // 监听配置变化，当用户在 VS Code 设置中修改插件的相关配置时，重新读取并更新这些路径变量。
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            // 检查是否是 'sifli-sdk-codekit' 相关的配置发生了变化
            if (e.affectsConfiguration('sifli-sdk-codekit')) {
                updateConfiguration(); // 更新内部的路径变量
                // vscode.window.showInformationMessage('SiFli 插件配置已更新。');
            }
        }));

        const CMD_PREFIX = "extension.";
        // 只有是 SiFli 项目才注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
                executeCleanCommand();
                await new Promise(resolve => setTimeout(resolve, 500)); // 添加一个小的延迟，确保清理完成再开始编译
                await executeCompileTask();
            }),
            vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
            vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'buildAndDownload', () => executeBuildAndDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'selectChipModule', () => selectChipModule()) // 注册新的命令
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
    if (currentBoardStatusItem) currentBoardStatusItem.dispose();

    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };