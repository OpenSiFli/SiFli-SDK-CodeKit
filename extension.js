// sifli-sdk-codekit/extension.js
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

// 新增板子发现相关的常量
const CUSTOMER_BOARDS_SUBFOLDER = 'customer/boards'; // SDK 下的板子目录
const HCPU_SUBFOLDER = 'hcpu'; // 板子目录下的 hcpu 文件夹 
const PTAB_JSON_FILE = 'ptab.json'; // 板子目录下的 ptab.json 文件

// 从 VS Code 用户配置中读取路径,初始化为 let 变量
let SF32_TERMINAL_PATH;
let SIFLI_SDK_EXPORT_SCRIPT_PATH;
let SIFLI_SDK_ROOT_PATH;
let SF32_TERMINAL_ARGS;
let selectedBoardName;          // 当前选中的芯片模组名称
let numThreads;                 // 编译线程数
let selectedSerialPort = null;  // 新增：当前选定的串口号,初始化为 null

// 任务名称常量
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";
const BUILD_DOWNLOAD_TASK_NAME = "SiFli: Build & Download";

// 状态栏按钮变量
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, buildDownloadBtn, currentBoardStatusItem, sdkManageBtn, currentSerialPortStatusItem; // 新增 currentSerialPortStatusItem

// 定义一个常量用于全局状态的键,表示是否已经执行过首次设置
const HAS_RUN_INITIAL_SETUP_KEY = 'oneStepForSifli.hasRunInitialSetup';

// SiFli SDK 仓库基础 API 地址 (不包含 /releases)
const SIFLI_SDK_GITHUB_REPO_BASE = 'https://api.github.com/repos/OpenSiFli/SiFli-SDK';
const SIFLI_SDK_GITEE_REPO_BASE = 'https://gitee.com/api/v5/repos/SiFli/sifli-sdk';

// 新增 Git 仓库URL常量
const SIFLI_SDK_GITHUB_REPO_GIT = 'https://github.com/OpenSiFli/SiFli-SDK.git';
const SIFLI_SDK_GITEE_REPO_GIT = 'https://gitee.com/SiFli/sifli-sdk.git';


/**
 * 辅助函数：根据选定的芯片模组和线程数动态生成 SCons 编译命令。
 * @param {string} boardName 选定的芯片模组名称
 * @param {number} threads 编译线程数
 * @returns {Promise<string>} 完整的编译命令
 */
async function getCompileCommand(boardName, threads) {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';
    const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);

    let boardSearchArg = '';
    const availableBoardsDetails = await discoverBoards(); // 获取所有板子的详细信息

    const currentBoardDetails = availableBoardsDetails.find(b => b.name === boardName);

    if (currentBoardDetails) {
        if (currentBoardDetails.type === 'sdk') {
            // 如果板子来源于SDK，scons默认会找到，--board_search_path 可以省略或指向任意路径
            // 在这种情况下，我们不添加 --board_search_path 参数，保持命令简洁
            boardSearchArg = ''; 
            console.log(`[SiFli Extension] Board '${boardName}' is from SDK. No --board_search_path needed.`);
        } else if (currentBoardDetails.type === 'project_local') {
            // 如果板子来源于项目同级的 boards 目录，相对于 project 目录是 '../boards'
            // board.path 是 'workspaceRoot/boards/board_name'
            // 我们需要 'workspaceRoot/boards' 相对于 'projectPath' 的路径
            const projectLocalBoardsDir = path.dirname(currentBoardDetails.path); // 获取到 .../boards 目录
            const relativeToProject = path.relative(projectPath, projectLocalBoardsDir);
            boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`;
            console.log(`[SiFli Extension] Board '${boardName}' is from project local. Using --board_search_path="${relativeToProject}".`);
        } else if (currentBoardDetails.type === 'custom') {
            // 如果板子来源于自定义路径
            // currentBoardDetails.path 是 'custom_path/board_name'
            // 我们需要 'custom_path' 相对于 'projectPath' 的路径
            const customBoardSearchDir = path.dirname(currentBoardDetails.path); // 获取到自定义的搜索目录

            // 检查 customBoardSearchDir 和 projectPath 是否在同一盘符
            const isSameDrive = path.parse(customBoardSearchDir).root.toLowerCase() === path.parse(projectPath).root.toLowerCase();

            if (isSameDrive) {
                // 如果在同一盘符，计算相对路径
                const relativeToProject = path.relative(projectPath, customBoardSearchDir);
                boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`;
                console.log(`[SiFli Extension] Board '${boardName}' is from custom path on same drive. Using --board_search_path="${relativeToProject}".`);
            } else {
                // 如果不在同一盘符，使用绝对路径
                boardSearchArg = `--board_search_path="${customBoardSearchDir.replace(/\\/g, '/')}"`; // SCons 通常接受正斜杠的绝对路径
                console.log(`[SiFli Extension] Board '${boardName}' is from custom path on different drive. Using absolute --board_search_path="${customBoardSearchDir}".`);
            }
        }
    } else {
        // 如果 selectedBoardName 不在任何发现的板子列表中，可能是无效配置，发出警告
        vscode.window.showWarningMessage(`当前选择的芯片模组 "${boardName}" 未找到有效配置。请在设置中重新选择。`);
        console.warn(`[SiFli Extension] Selected board "${boardName}" not found in discovered boards.`);
        // 尝试使用默认的 project_local 路径作为 fallback，以避免命令失败
        // 这里仍旧回退到项目同级的 boards 目录
        boardSearchArg = `--board_search_path="../boards"`; 
    }

    return `scons --board=${boardName} ${boardSearchArg} -j${threads}`;
}

/**
 * 辅助函数：根据选定的芯片模组动态生成 Menuconfig 命令。
 * @param {string} boardName 选定的芯片模组名称
 * @returns {string} 完整的 Menuconfig 命令
 */
async function getMenuconfigCommand(boardName) { // 变为 async 函数
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';
    const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);

    let boardSearchArg = '';
    const availableBoardsDetails = await discoverBoards(); // 获取所有板子的详细信息

    const currentBoardDetails = availableBoardsDetails.find(b => b.name === boardName);

    if (currentBoardDetails) {
        if (currentBoardDetails.type === 'sdk') {
            boardSearchArg = ''; 
        } else if (currentBoardDetails.type === 'project_local') {
            boardSearchArg = `--board_search_path="../boards"`;
        } else if (currentBoardDetails.type === 'custom') {
            const customBoardPath = currentBoardDetails.path; 
            const relativeToProject = path.relative(projectPath, customBoardPath);
            boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`; 
        }
    } else {
        vscode.window.showWarningMessage(`当前选择的芯片模组 "${boardName}" 未找到有效配置。请在设置中重新选择。`);
        console.warn(`[SiFli Extension] Selected board "${boardName}" not found in discovered boards.`);
        boardSearchArg = `--board_search_path="../boards"`; 
    }

    return `scons --board=${boardName} ${boardSearchArg} --menuconfig`;
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
 * 辅助函数：读取并解析 ImgBurnList.ini 文件。
 * @param {string} boardName 选定的芯片模组名称。
 * @returns {Promise<Array<{file: string, address: string}>>} 返回一个 Promise,解析为包含文件路径和地址的对象数组。
 */
async function readImgBurnListIni(boardName) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区,无法读取 ImgBurnList.ini。');
        return [];
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildTargetFolder = getBuildTargetFolder(boardName);
    const iniFilePath = path.join(workspaceRoot, PROJECT_SUBFOLDER, buildTargetFolder, 'ImgBurnList.ini');

    console.log(`[SiFli Extension] Reading ImgBurnList.ini from: ${iniFilePath}`);

    if (!fs.existsSync(iniFilePath)) {
        console.warn(`[SiFli Extension] 未找到当前模组 (${boardName}) 的烧录列表文件 (${path.basename(iniFilePath)})。这可能影响下载命令的完整性。`);
        return [];
    }

    try {
        const fileContent = fs.readFileSync(iniFilePath, 'utf8');
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '' && !line.startsWith('['));
        const filesToFlash = [];
        let numFiles = 0;

        for (const line of lines) {
            if (line.startsWith('NUM=')) {
                numFiles = parseInt(line.split('=')[1]);
                break; // 找到 NUM 后即可退出循环
            }
        }

        if (numFiles === 0) {
            console.warn(`[SiFli Extension] ImgBurnList.ini 中未找到有效文件数量 (NUM=0)。`);
            return [];
        }

        for (let i = 0; i < numFiles; i++) {
            const fileLine = lines.find(line => line.startsWith(`FILE${i}=`));
            const addrLine = lines.find(line => line.startsWith(`ADDR${i}=`));

            if (fileLine && addrLine) {
                const relativeFilePath = fileLine.split('=')[1].trim();
                const address = addrLine.split('=')[1].trim(); 
                filesToFlash.push({
                    file: relativeFilePath,
                    address: address
                });
            } else {
                console.warn(`[SiFli Extension] ImgBurnList.ini 中缺少 FILE${i} 或 ADDR${i} 条目。`);
            }
        }
        console.log(`[SiFli Extension] Parsed ImgBurnList.ini:`, filesToFlash);
        return filesToFlash;

    } catch (error) {
        vscode.window.showErrorMessage(`解析烧录列表文件 (${path.basename(iniFilePath)}) 失败: ${error.message}。请检查文件内容是否损坏。`);
        console.error(`[SiFli Extension] Failed to read or parse ImgBurnList.ini:`, error);
        return [];
    }
}


/**
 * 辅助函数：根据选定的芯片模组和串口号动态生成 sftool 下载命令。
 * **增加：在生成下载命令前,检查关键固件文件是否存在。**
 * @param {string} boardName 选定的芯片模组名称 (e.g., "sf32lb52-lchspi-ulp").
 * @param {string} serialPortNum 串口号 (e.g., "5" for COM5).
 * @returns {Promise<string>} 完整的 sftool 下载命令。如果文件不存在,则返回空字符串。
 */
async function getSftoolDownloadCommand(boardName, serialPortNum) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区,无法生成下载命令。');
        return '';
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildTargetFolder = getBuildTargetFolder(boardName); // 例如 "build_sf32lb52-lchspi-ulp_hcpu"
    const buildPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, buildTargetFolder);

    // **新增：检查关键 .bin 文件是否存在**
    const bootloaderPath = path.join(buildPath, 'bootloader', 'bootloader.bin');
    const ftabPath = path.join(buildPath, 'ftab', 'ftab.bin');
    const mainBinPath = path.join(buildPath, 'main.bin');

    const missingFiles = [];
    if (!fs.existsSync(bootloaderPath)) {
        missingFiles.push(path.relative(workspaceRoot, bootloaderPath));
    }
    if (!fs.existsSync(ftabPath)) {
        missingFiles.push(path.relative(workspaceRoot, ftabPath));
    }
    if (!fs.existsSync(mainBinPath)) {
        missingFiles.push(path.relative(workspaceRoot, mainBinPath));
    }

    if (missingFiles.length > 0) {
        vscode.window.showWarningMessage(
            `当前模组 (${boardName}) 的以下关键固件文件未找到,无法执行下载操作：\n` +
            `- ${missingFiles.join('\n- ')}\n` +
            `请尝试先执行“Build”操作,确保项目已成功编译。`
        );
        return ''; // 文件缺失,不生成下载命令
    }

    // 从 boardName 中提取芯片类型,例如 "sf32lb52-lcd_base" -> "SF32LB52"
    // 假定芯片类型是第一个连字符之前的部分,并转换为大写。
    const chipType = boardName.substring(0, boardName.indexOf('-')).toUpperCase();

    // 调用辅助函数来读取烧录文件列表和地址
    const filesToFlash = await readImgBurnListIni(boardName);
    // 如果 filesToFlash 为空,但关键bin文件都存在,说明ImgBurnList.ini有问题,但下载可能仍基于默认或硬编码（如果sftool支持）
    // 但更安全做法是如果文件列表为空,则阻止下载,因为 sftool 需要知道烧录什么
    if (filesToFlash.length === 0) {
        vscode.window.showWarningMessage(
            `当前模组 (${boardName}) 的烧录列表文件 (${path.basename(buildPath)}/ImgBurnList.ini) 无效或内容为空,无法生成下载命令。`
        );
        return ''; // 读取 ImgBurnList.ini 失败或内容为空,不生成下载命令
    }

    // 构建 write_flash 部分的参数
    // 每个文件路径都需要相对于 `project` 目录,因为终端会 `cd` 到 `project`
    // ImgBurnList.ini 中的文件路径是相对于 `build_sf32lb52-lchspi-ulp_hcpu` 的。
    const flashArguments = filesToFlash.map(item => {
        // 构建完整的相对路径,例如 "build_sf32lb52-lchspi-ulp_hcpu\bootloader\bootloader.bin"
        const fullRelativePath = path.join(buildTargetFolder, item.file).replace(/\\/g, '\\\\'); // Windows路径可能需要双反斜杠转义
        return `"${fullRelativePath}@${item.address}"`;
    }).join(' ');

    // 构造完整的 sftool 命令
    const downloadCommand = `sftool -p COM${serialPortNum} -c ${chipType} write_flash ${flashArguments}`;
    console.log(`[SiFli Extension] Generated sftool command: ${downloadCommand}`);
    return downloadCommand;
}


/**
 * 辅助函数：读取并更新插件配置中的路径信息。
 * 在插件激活时调用,并在用户修改配置时监听并更新。
 */
function updateConfiguration() {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    SF32_TERMINAL_PATH = config.get('powershellPath');
    SIFLI_SDK_EXPORT_SCRIPT_PATH = config.get('sifliSdkExportScriptPath');
    selectedBoardName = config.get('defaultChipModule'); // 读取默认芯片模组
    numThreads = config.get('numThreads', os.cpus().length > 0 ? os.cpus().length : 8); // 读取线程数,默认为CPU核心数或8

    // 根据 export 脚本路径计算 SDK 根目录
    // 假设 export.ps1 位于 SDK 的根目录
    if (SIFLI_SDK_EXPORT_SCRIPT_PATH && fs.existsSync(SIFLI_SDK_EXPORT_SCRIPT_PATH)) {
        SIFLI_SDK_ROOT_PATH = path.dirname(SIFLI_SDK_EXPORT_SCRIPT_PATH);
    } else {
        SIFLI_SDK_ROOT_PATH = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath : os.homedir();
        vscode.window.showWarningMessage('SiFli SDK export.ps1 脚本路径未配置或无效,请在扩展设置中检查。');
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


    updateStatusBarItems(); // 配置更新后,更新状态栏显示
}

/**
 * 辅助函数：判断当前工作区是否是 SiFli SDK 工程。
 * 判断依据是工作区根目录下是否存在 'src/SConscript' 文件,并且 export.ps1 脚本路径有效。
 * @returns {boolean} 如果是 SiFli 工程则返回 true,否则返回 false。
 */
function isSiFliProject() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        console.log('[SiFli Extension] No workspace folder open. Not a SiFli project.');
        return false;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const sconstructPathToCheck = path.join(workspaceRoot, SRC_SUBFOLDER, SCONSCRIPT_FILE);

    // 假设 export.ps1 位于 SDK 根目录,我们通过配置获取 SDK 根目录
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const sifliSdkExportScriptPath = config.get('sifliSdkExportScriptPath');
    let isSdkEnvironment = false;
    if (sifliSdkExportScriptPath && fs.existsSync(sifliSdkExportScriptPath)) {
        isSdkEnvironment = true;
    }

    const isProject = fs.existsSync(sconstructPathToCheck) && isSdkEnvironment;
    console.log(`[SiFli Extension] Checking for SiFli project file: ${sconstructPathToCheck} - Found: ${fs.existsSync(sconstructPathToCheck)}`);
    console.log(`[SiFli Extension] Checking for SDK environment (export.ps1): ${sifliSdkExportScriptPath} - Found: ${isSdkEnvironment}`);
    return isProject;
}

/**
 * 辅助函数：获取或创建名为 'SF32' 的终端,并确保其工作目录为 'project' 子文件夹。
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
            shellArgs: SF32_TERMINAL_ARGS, // PowerShell 启动参数,包括执行 export.ps1
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
 * @returns {Promise<void>}
 */
async function executeShellCommandInSiFliTerminal(commandLine, taskName) { // 移除 serialPortNumInput 参数
    const terminal = await getOrCreateSiFliTerminalAndCdProject();

    console.log(`[SiFli Extension] Sending command "${commandLine}" for task "${taskName}" to SF32 terminal.`);
    terminal.sendText(commandLine); // 直接向终端发送命令
}

/**
 * 辅助函数：通过 PowerShell Get-WmiObject 获取当前系统中所有可用的串口设备（通用）。
 * @returns {Promise<Array<{name: string, com: string, manufacturer?: string, description?: string}>>} 返回一个 Promise,解析为串口设备数组。
 */
async function getSerialPorts() {
    let detectedPorts = new Set(); // 使用 Set 避免重复的 COM 端口

    try {
        // 定义 PowerShell 脚本内容,直接在其中使用 PowerShell 的引号和转义规则
        // 关键修改：移除对特定制造商（如wch.cn）或名称（如CH340）的过滤
        const powershellScriptContent = `
            Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "COM\\d+" } | Select-Object Name, Description, Manufacturer, DeviceID | ForEach-Object { $_.Name -match "\\((COM\\d+)\\)" | Out-Null; [PSCustomObject]@{ Name = $_.Name; COM = $Matches[1]; Manufacturer = $_.Manufacturer; Description = $_.Description } } | ConvertTo-Json
        `;

        // 创建一个临时 PowerShell 脚本文件
        const tempScriptPath = path.join(os.tmpdir(), `get_serial_ports_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, powershellScriptContent, { encoding: 'utf8' });

        const { stdout: psStdout, stderr: psStderr } = await new Promise((resolve, reject) => {
            // 执行临时 PowerShell 脚本文件
            // 使用 -File 参数而不是 -Command,并设置 ExecutionPolicy 以允许脚本执行
            exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${tempScriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => { // 增加超时到15秒
                // 清理临时文件
                try {
                    fs.unlinkSync(tempScriptPath); // 同步删除,确保删除完成
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
            // 如果只有单个对象而非数组,或者 stdout 为空,确保能正确处理
            const portsArray = Array.isArray(psSerialPorts) ? psSerialPorts : (psSerialPorts ? [psSerialPorts] : []);

            portsArray.forEach(p => {
                // 现在只要求有 COM 端口号即可,不再限制制造商或名称中包含特定字符串
                if (p.COM) {
                    detectedPorts.add(JSON.stringify({
                        name: p.Name,
                        com: p.COM.toUpperCase(),
                        manufacturer: p.Manufacturer,
                        description: p.Description
                    }));
                }
            });
        } catch (parseError) {
            console.warn(`[SiFli Extension] 解析 PowerShell 串口信息失败 (可能没有可用串口或输出格式不符): ${parseError.message}`);
            // 当没有串口时,stdout 可能为空或不是有效的 JSON,这里是预期行为
        }
    } catch (error) {
        vscode.window.showErrorMessage(`无法执行 PowerShell 命令获取串口列表。请确保 PowerShell 已正确安装并可访问。错误信息: ${error.message}`);
        console.error(`[SiFli Extension] 获取串口失败 (PowerShell exec error): ${error.message}`);
    }

    const finalPorts = Array.from(detectedPorts).map(item => JSON.parse(item));
    console.log('[SiFli Extension] Final detected serial ports:', finalPorts);
    return finalPorts;
}

/**
 * 辅助函数：处理串口选择逻辑。
 * 根据检测到的串口数量,进行自动化或用户交互。
 * 此函数现在只负责选择并更新全局变量 `selectedSerialPort`,不直接触发下载。
 * @returns {Promise<string|null>} 返回选择的串口号的纯数字,如果用户取消则返回 null。
 */
async function selectSerialPort() { // 此函数不再是下载前的选择,而是通用的串口选择器
    try {
        const serialPorts = await getSerialPorts();

        if (serialPorts.length === 0) {
            // 将警告信息降级为信息提示,更友好
            vscode.window.showInformationMessage('未检测到任何串行端口设备。请检查设备连接和驱动安装。');
            selectedSerialPort = null; // 未检测到串口时清空已选串口
            updateStatusBarItems(); // 更新状态栏显示
            return null;
        } else if (serialPorts.length === 1) {
            const comPortFull = serialPorts[0].com;
            const comPortNum = comPortFull.replace('COM', '');
            vscode.window.showInformationMessage(`检测到单个串行端口设备,自动选择 COM 端口：${comPortNum}。`);
            selectedSerialPort = comPortNum; // 更新全局变量
            updateStatusBarItems(); // 更新状态栏显示
            return comPortNum;
        } else {
            vscode.window.showInformationMessage(`检测到多个串行端口设备,请选择一个。`);
            const pickOptions = serialPorts.map(p => ({
                label: p.name,
                description: `COM 端口: ${p.com}${p.manufacturer ? ` (${p.manufacturer})` : ''}`, // 描述中可以包含制造商信息
                com: p.com
            }));

            const selected = await vscode.window.showQuickPick(pickOptions, {
                placeHolder: '检测到多个串行端口设备,请选择一个：'
            });

            if (selected) {
                const comPortNum = selected.com.replace('COM', '');
                vscode.window.showInformationMessage(`已选择串口：${comPortNum}`);
                selectedSerialPort = comPortNum; // 更新全局变量
                updateStatusBarItems(); // 更新状态栏显示
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


/**
 * 辅助函数：扫描指定目录，查找符合条件的板子配置。
 * @param {string} directoryPath 要扫描的目录路径
 * @param {Map<string, {name: string, path: string, type: 'sdk'|'custom'|'project_local'}>} boardMap 存储发现板子信息的 Map
 * @param {'sdk'|'custom'|'project_local'} sourceType 当前扫描的板子来源类型
 */
async function scanDirectoryForBoards(directoryPath, boardMap, sourceType) {
    if (!fs.existsSync(directoryPath) || !fs.lstatSync(directoryPath).isDirectory()) {
        console.log(`[SiFli Extension] Board scan path does not exist or is not a directory: ${directoryPath}`);
        return;
    }

    try {
        const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const boardName = entry.name;
                const boardFullPath = path.join(directoryPath, boardName);
                const hcpuPath = path.join(boardFullPath, HCPU_SUBFOLDER); // 检查 hcpu 目录
                const ptabJsonPath = path.join(boardFullPath, PTAB_JSON_FILE); // 检查 ptab.json 文件

                if (fs.existsSync(hcpuPath) && fs.lstatSync(hcpuPath).isDirectory() && fs.existsSync(ptabJsonPath) && fs.lstatSync(ptabJsonPath).isFile()) {
                    // 优先级逻辑：如果高优先级类型（custom/project_local）的板子与已存在板子同名，则覆盖
                    // SDK板子优先级最低
                    if (sourceType === 'sdk' && boardMap.has(boardName)) {
                        // 如果当前是SDK板子，但Map中已有同名板子，则跳过（因为Map中的板子优先级更高）
                        console.log(`[SiFli Extension] Skipping SDK board ${boardName} as higher priority board already exists.`);
                        continue;
                    } else if ((sourceType === 'custom' || sourceType === 'project_local') && boardMap.has(boardName)) {
                        // 如果当前是自定义或项目本地板子，且Map中已有同名板子，则覆盖
                        console.log(`[SiFli Extension] Overwriting board ${boardName} with higher priority board from ${sourceType} path.`);
                        boardMap.delete(boardName); // 删除旧的，添加新的
                    }
                    
                    boardMap.set(boardName, {
                        name: boardName,
                        path: boardFullPath, // 存储板子的完整路径
                        type: sourceType     // 存储板子的来源类型
                    });
                    console.log(`[SiFli Extension] Found valid board: ${boardName} (Type: ${sourceType}, Path: ${boardFullPath})`);
                } else {
                    console.log(`[SiFli Extension] Not a valid board (missing hcpu or ptab.json): ${boardName} at ${boardFullPath}`);
                }
            }
        }
    } catch (error) {
        console.error(`[SiFli Extension] Failed to scan directory ${directoryPath} for boards: ${error.message}`);
    }
}

/**
 * 辅助函数：动态发现所有可用的板子配置。
 * 遵循以下扫描规则：
 * 1. 扫描SDK目录下的 customer/boards (最低优先级)。
 * 2. 扫描工程中与 project 同级的 boards 目录下 (中等优先级)。
 * 3. 如果设置了 customBoardSearchPath，则扫描该目录 (最高优先级)。
 * 有效的板子选项需同时存在 `hcpu` 目录和 `ptab.json` 文件。
 *
 * @returns {Promise<Array<{name: string, path: string, type: 'sdk'|'custom'|'project_local'}>>} 返回一个 Promise，解析为有效板子信息的数组。
 */
async function discoverBoards() {
    // 使用 Map 来存储板子，键为板子名称，值是包含其路径和类型的对象，以便处理优先级
    const discoveredBoardMap = new Map();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[SiFli Extension] No workspace folder open, cannot discover boards.');
        return [];
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const customBoardSearchPath = config.get('customBoardSearchPath', '');

    // 1. 扫描SDK目录下的 customer/boards (最低优先级)
    if (SIFLI_SDK_ROOT_PATH) {
        const sdkBoardsPath = path.join(SIFLI_SDK_ROOT_PATH, CUSTOMER_BOARDS_SUBFOLDER);
        await scanDirectoryForBoards(sdkBoardsPath, discoveredBoardMap, 'sdk');
    }

    // 2. 扫描工程中与 project 同级的 boards 目录下 (中等优先级)
    const projectLocalBoardsPath = path.join(workspaceRoot, 'boards'); // 与 project 同级
    await scanDirectoryForBoards(projectLocalBoardsPath, discoveredBoardMap, 'project_local');

    // 3. 如果设置了 customBoardSearchPath，则扫描该目录 (最高优先级)
    if (customBoardSearchPath) {
        const targetCustomBoardPath = path.isAbsolute(customBoardSearchPath) ?
                                      customBoardSearchPath :
                                      path.resolve(workspaceRoot, customBoardSearchPath);
        await scanDirectoryForBoards(targetCustomBoardPath, discoveredBoardMap, 'custom');
    }

    // 将 Map 的值转换为数组返回
    const result = Array.from(discoveredBoardMap.values());
    console.log('[SiFli Extension] Discovered boards:', result);
    return result;
}


// 执行编译任务
async function executeCompileTask() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            vscode.window.showWarningMessage('部分文件未能保存,构建可能基于旧版文件。');
            console.warn('[SiFli Extension] Not all files saved before compile.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        console.error('[SiFli Extension] Error saving files:', error);
        return;
    }

    const compileCommand = await getCompileCommand(selectedBoardName, numThreads); // getCompileCommand 变为 async
    await executeShellCommandInSiFliTerminal(compileCommand, BUILD_TASK_NAME);
}

// 执行下载任务
async function executeDownloadTask() {
    // 检查是否已选择串口,如果未选择则提示用户选择
    if (!selectedSerialPort) {
        // 将这里的警告改为信息提示,避免打扰用户
        vscode.window.showInformationMessage('请先选择一个用于下载的串口。点击状态栏中的 "COM: N/A" 进行选择。');
        const chosenPort = await selectSerialPort(); // 尝试让用户选择
        if (!chosenPort) { // 如果用户仍然没有选择,则退出
            return;
        }
    }

    // 更新：直接使用 selectedSerialPort 生成命令
    const sftoolCommand = await getSftoolDownloadCommand(selectedBoardName, selectedSerialPort);
    if (sftoolCommand) { // 只有在成功生成命令后才执行
        await executeShellCommandInSiFliTerminal(sftoolCommand, DOWNLOAD_TASK_NAME);
    }
}

// 执行 Menuconfig 任务
async function executeMenuconfigTask() {
    const menuconfigCommand = await getMenuconfigCommand(selectedBoardName); // getMenuconfigCommand 变为 async
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
        vscode.window.showInformationMessage(`'${getBuildTargetFolder(selectedBoardName)}' 文件夹不存在,无需删除。`);
        console.log(`[SiFli Extension] Folder '${buildFolderPath}' not found, nothing to clean.`);
    }
}

// 更新状态栏按钮的提示信息
function updateStatusBarItems() {
    // getCompileCommand 和 getMenuconfigCommand 现在是异步的，不能直接在这里调用。
    // 状态栏的tooltip可以简化，或者在需要时才异步更新。
    // 为了避免在这里await，我们移除tooltip中动态命令的显示。
    if (compileBtn) {
        compileBtn.tooltip = `执行 SiFli 构建`;
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
        menuconfigBtn.tooltip = `打开 SiFli Menuconfig`;
    }
    if (buildDownloadBtn) {
        buildDownloadBtn.tooltip = `构建并下载 SiFli 项目 (当前模组: ${selectedBoardName})`;
    }
    if (currentBoardStatusItem) {
        currentBoardStatusItem.text = `SiFli Board: ${selectedBoardName} (J${numThreads})`; // 显示线程数
        currentBoardStatusItem.tooltip = `当前 SiFli 芯片模组: ${selectedBoardName}\n编译线程数: J${numThreads}\n点击切换芯片模组或修改线程数`;
    }
    // 新增：更新串口状态栏项
    if (currentSerialPortStatusItem) {
        currentSerialPortStatusItem.text = `COM: ${selectedSerialPort || 'N/A'}`; // 如果没有选择,显示 N/A
        currentSerialPortStatusItem.tooltip = `当前下载串口: ${selectedSerialPort || '未选择'}\n点击选择串口`;
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
    currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule'; // 绑定命令
    currentBoardStatusItem.show();
    context.subscriptions.push(currentBoardStatusItem);

    // 新增：显示当前串口的状态栏项
    currentSerialPortStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89); // 优先级略低于板卡
    currentSerialPortStatusItem.command = CMD_PREFIX + 'selectDownloadPort'; // 绑定新的命令
    currentSerialPortStatusItem.show();
    context.subscriptions.push(currentSerialPortStatusItem);

    updateStatusBarItems(); // 初始化tooltip和板卡、串口显示
}

// 执行编译并下载任务
async function executeBuildAndDownloadTask() {
    try {
        const allSaved = await vscode.workspace.saveAll();
        if (!allSaved) {
            vscode.window.showWarningMessage('部分文件未能保存,构建可能基于旧版文件。');
            console.warn('[SiFli Extension] Not all files saved before build and download.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error.message}`);
        console.error('[SiFli Extension] Error saving files:', error);
        return;
    }

    // 检查是否已选择串口,如果未选择则提示用户选择
    if (!selectedSerialPort) {
        // 将这里的警告改为信息提示,避免打扰用户
        vscode.window.showInformationMessage('请先选择一个用于下载的串口。点击状态栏中的 "COM: N/A" 进行选择。');
        const chosenPort = await selectSerialPort(); // 尝试让用户选择
        if (!chosenPort) { // 如果用户仍然没有选择,则退出
            return;
        }
    }

    const compileCommand = await getCompileCommand(selectedBoardName, numThreads); // 确保这里是 await
    const sftoolDownloadCommand = await getSftoolDownloadCommand(selectedBoardName, selectedSerialPort);

    if (sftoolDownloadCommand) { // 只有在成功生成命令后才执行
        // PowerShell 命令组合,确保编译成功后才执行下载
        const command = `${compileCommand}; if ($LASTEXITCODE -eq 0) { ${sftoolDownloadCommand} }`;
        await executeShellCommandInSiFliTerminal(command, BUILD_DOWNLOAD_TASK_NAME);
    }
}

/**
 * 提示用户选择初始芯片模组,并保存到配置中。
 * 仅在首次激活且未设置有效默认模组时调用。
 * @param {vscode.ExtensionContext} context 扩展上下文,用于访问全局状态。
 */
async function promptForInitialBoardSelection(context) {
    const hasRunInitialSetup = context.globalState.get(HAS_RUN_INITIAL_SETUP_KEY, false);
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    let currentDefaultBoard = config.get('defaultChipModule'); // 获取当前配置的默认模组

    // 动态获取可用板子列表
    const availableBoardsDetails = await discoverBoards();

    // 检查是否需要提示用户选择初始芯片模组
    // 条件：从未进行过初始设置 OR 当前配置的默认模组无效 OR 当前配置的默认模组不在已发现的板子列表中
    if (!hasRunInitialSetup || !currentDefaultBoard || !availableBoardsDetails.some(b => b.name === currentDefaultBoard)) {
        vscode.window.showInformationMessage('请选择您当前要开发的芯片模组。');

        if (availableBoardsDetails.length === 0) {
            vscode.window.showWarningMessage('未发现任何 SiFli 芯片模组。请检查您的 SDK 安装或自定义板子路径设置。');
            await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true); // 即使没有板子,也标记为已运行,避免每次启动都弹出
            return;
        }

        const pickOptions = availableBoardsDetails.map(board => {
            let description = '';
            if (board.type === 'sdk') {
                description = '来源: SDK 默认';
            } else if (board.type === 'project_local') {
                description = '来源: 项目本地 boards 目录';
            } else if (board.type === 'custom') {
                description = `来源: 自定义路径 (${path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, board.path)})`;
            }
            return {
                label: board.name,
                description: description,
                boardData: board
            };
        });

        const selected = await vscode.window.showQuickPick(pickOptions, {
            placeHolder: '请选择一个 SiFli 芯片模组',
            canPickMany: false,
            ignoreFocusOut: true
        });

        if (selected) {
            await config.update('defaultChipModule', selected.label, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`SiFli 默认模组已设置为: ${selected.label}`);
        } else {
            // 如果用户取消选择,但有可用的板子,则默认选择第一个
            if (availableBoardsDetails.length > 0) {
                await config.update('defaultChipModule', availableBoardsDetails[0].name, vscode.ConfigurationTarget.Global);
                vscode.window.showWarningMessage(`未选择芯片模组,已将默认模组设置为第一个可用模组: ${availableBoardsDetails[0].name}。您可以在 VS Code 设置中修改。`);
            } else {
                vscode.window.showWarningMessage(`未选择芯片模组且未发现可用模组。请确保 SDK 安装正确且存在板子配置。`);
            }
        }
        await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
        // 更新 selectedBoardName 确保后续操作使用最新的默认模组
        selectedBoardName = config.get('defaultChipModule');
        updateStatusBarItems(); // 确保状态栏立即更新
    }
}

/**
 * 处理用户点击状态栏芯片模组,选择或修改模组的命令。
 */
async function selectChipModule() {
    // 动态获取可用的板子列表
    const availableBoardsDetails = await discoverBoards();

    if (availableBoardsDetails.length === 0) {
        vscode.window.showWarningMessage('未发现任何 SiFli 芯片模组。请检查您的 SDK 安装或自定义板子路径设置。');
        return;
    }

    // 允许用户选择芯片模组
    const boardPickOptions = availableBoardsDetails.map(board => {
        let description = '';
        if (board.type === 'sdk') {
            description = '来源: SDK 默认';
        } else if (board.type === 'project_local') {
            description = '来源: 项目本地 boards 目录';
        } else if (board.type === 'custom') {
            description = `来源: 自定义路径 (${path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, board.path)})`;
        }
        if (board.name === selectedBoardName) {
            description += ' (当前选中)';
        }
        return {
            label: board.name,
            description: description,
            boardData: board // 将完整的板子数据存储在 quick pick 选项中
        };
    });

    const selectedQuickPickItem = await vscode.window.showQuickPick(boardPickOptions, {
        placeHolder: '选择 SiFli 芯片模组',
        title: '选择芯片模组'
    });

    if (selectedQuickPickItem && selectedQuickPickItem.label !== selectedBoardName) {
        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        // 更新全局配置
        await config.update('defaultChipModule', selectedQuickPickItem.label, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`SiFli 芯片模组已切换为: ${selectedQuickPickItem.label}`);
        // updateConfiguration() 会在配置变化监听器中自动调用,更新 selectedBoardName
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

/**
 * 新增：处理用户点击状态栏串口,选择或修改串口的命令。
 */
async function selectDownloadPort() {
    await selectSerialPort(); // 直接调用通用的串口选择函数
}

async function activate(context) {
    console.log('Congratulations, your SiFli extension is now active!');

    // *** 仅在开发调试时使用：强制重置首次运行标志 ***
    // 这将使得每次“重新运行调试”时,Quick Pick 都会弹出。
    // 在发布生产版本时,请务必删除或注释掉此行！
    await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false);
    // ******************************************************

    // 在插件激活时立即读取配置
    updateConfiguration();

    // 只有是 SiFli 项目才激活插件功能
    if (isSiFliProject()) {
        console.log('[SiFli Extension] SiFli project detected. Activating full extension features.');

        initializeStatusBarItems(context); // 只有是 SiFli 项目才初始化状态栏按钮

        // 在初始化配置和状态栏后,检查是否需要提示用户选择初始芯片模组
        // 使用 setTimeout 稍微延迟,确保初始化完成
        setTimeout(async () => {
            await promptForInitialBoardSelection(context);
            // 确保终端在所有配置更新和板子选择后创建
            await getOrCreateSiFliTerminalAndCdProject();
        }, 500);


        // 监听配置变化,当用户在 VS Code 设置中修改插件的相关配置时,重新读取并更新这些路径变量。
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            // 检查是否是 'sifli-sdk-codekit' 相关的配置发生了变化
            if (e.affectsConfiguration('sifli-sdk-codekit')) {
                updateConfiguration(); // 更新内部的路径变量
            }
        }));

        const CMD_PREFIX = "extension.";
        // 只有是 SiFli 项目才注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
                executeCleanCommand();
                await new Promise(resolve => setTimeout(resolve, 500)); // 添加一个小的延迟,确保清理完成再开始编译
                await executeCompileTask();
            }),
            vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
            vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'buildAndDownload', () => executeBuildAndDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'selectChipModule', () => selectChipModule()),
            vscode.commands.registerCommand(CMD_PREFIX + 'selectDownloadPort', () => selectDownloadPort()) // 注册新的命令
        );
    } else {
        console.log('[SiFli Extension] Not a SiFli project. Extension features will not be activated.');
    }
}

function deactivate() {
    // 确保在插件停用时清理所有状态栏按钮,防止资源泄露
    if (compileBtn) compileBtn.dispose();
    if (rebuildBtn) rebuildBtn.dispose();
    if (cleanBtn) cleanBtn.dispose();
    if (downloadBtn) downloadBtn.dispose();
    if (menuconfigBtn) menuconfigBtn.dispose();
    if (buildDownloadBtn) buildDownloadBtn.dispose();
    if (currentBoardStatusItem) currentBoardStatusItem.dispose();
    if (currentSerialPortStatusItem) currentSerialPortStatusItem.dispose(); // 销毁新增的串口状态栏项

    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };