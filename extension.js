// sifli-sdk-codekit/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');
const axios = require('axios');

// 定义SiFli SDK相关的常量
const TERMINAL_NAME = 'SF32'; // SDK配置的终端名称
const PROJECT_SUBFOLDER = 'project'; // 工程文件夹名称（命令执行的实际工作目录）
const SRC_SUBFOLDER = 'src'; // 源代码文件夹名称
const SCONSCRIPT_FILE = 'SConscript'; // 判断SiFli工程的依据文件

// 判断板子发现相关的常量
const CUSTOMER_BOARDS_SUBFOLDER = 'customer/boards'; // SDK 下的板子目录
const HCPU_SUBFOLDER = 'hcpu'; // 板子目录下的 hcpu 文件夹 
const PTAB_JSON_FILE = 'ptab.json'; // 板子目录下的 ptab.json 文件

// sftool 参数文件常量
const SFTOOL_PARAM_JSON_FILE = 'sftool_param.json';

// 从 VS Code 用户配置中读取路径,初始化为 let 变量
let gitOutputChannel;           // 专属Git输出通道
let SF32_TERMINAL_PATH;
let SIFLI_SDK_EXPORT_SCRIPT_PATH;
let SIFLI_SDK_ROOT_PATH;
let SF32_TERMINAL_ARGS;
let selectedBoardName;          // 当前选中的芯片模组名称
let numThreads;                 // 编译线程数
let selectedSerialPort = null;  // 当前选定的串口号,初始化为 null

// 任务名称常量
const BUILD_TASK_NAME = "SiFli: Build";
const DOWNLOAD_TASK_NAME = "SiFli: Download";
const MENUCONFIG_TASK_NAME = "SiFli: Menuconfig";
const CLEAN_TASK_NAME = "SiFli: Clean";
const REBUILD_TASK_NAME = "SiFli: Rebuild";

// 状态栏按钮变量
let compileBtn, rebuildBtn, cleanBtn, downloadBtn, menuconfigBtn, currentBoardStatusItem, sdkManageBtn, currentSerialPortStatusItem, currentSdkVersionStatusItem;
let detectedSdkVersions = [];    // 存储发现的 SDK 版本信息

// 定义一个常量用于全局状态的键,表示是否已经执行过首次设置
const HAS_RUN_INITIAL_SETUP_KEY = 'oneStepForSifli.hasRunInitialSetup';

// SiFli SDK 仓库基础 API 地址 (不包含 /releases)
const SIFLI_SDK_GITHUB_REPO_BASE = 'https://api.github.com/repos/OpenSiFli/SiFli-SDK';
const SIFLI_SDK_GITEE_REPO_BASE = 'https://gitee.com/api/v5/repos/SiFli/sifli-sdk';

// Git 仓库URL常量
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
            // 如果板子来源于SDK,scons默认会找到,--board_search_path 可以省略或指向任意路径
            // 在这种情况下,我们不添加 --board_search_path 参数,保持命令简洁
            boardSearchArg = ''; 
            console.log(`[SiFli Extension] Board '${boardName}' is from SDK. No --board_search_path needed.`);
        } else if (currentBoardDetails.type === 'project_local') {
            // 如果板子来源于项目同级的 boards 目录,相对于 project 目录是 '../boards'
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
                // 如果在同一盘符,计算相对路径
                const relativeToProject = path.relative(projectPath, customBoardSearchDir);
                boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`;
                console.log(`[SiFli Extension] Board '${boardName}' is from custom path on same drive. Using --board_search_path="${relativeToProject}".`);
            } else {
                // 如果不在同一盘符,使用绝对路径
                boardSearchArg = `--board_search_path="${customBoardSearchDir.replace(/\\/g, '/')}"`; // SCons 通常接受正斜杠的绝对路径
                console.log(`[SiFli Extension] Board '${boardName}' is from custom path on different drive. Using absolute --board_search_path="${customBoardSearchDir}".`);
            }
        }
    } else {
        // 如果 selectedBoardName 不在任何发现的板子列表中,可能是无效配置,发出警告
        vscode.window.showWarningMessage(`当前选择的芯片模组 "${boardName}" 未找到有效配置。请在设置中重新选择。`);
        console.warn(`[SiFli Extension] Selected board "${boardName}" not found in discovered boards.`);
        // 尝试使用默认的 project_local 路径作为 fallback,以避免命令失败
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
            const projectLocalBoardsDir = path.dirname(currentBoardDetails.path);
            const relativeToProject = path.relative(projectPath, projectLocalBoardsDir);
            boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`;
        } else if (currentBoardDetails.type === 'custom') {
            const customBoardSearchDir = path.dirname(currentBoardDetails.path);
            const isSameDrive = path.parse(customBoardSearchDir).root.toLowerCase() === path.parse(projectPath).root.toLowerCase();

            if (isSameDrive) {
                const relativeToProject = path.relative(projectPath, customBoardSearchDir);
                boardSearchArg = `--board_search_path="${relativeToProject.replace(/\\/g, '/')}"`;
            } else {
                boardSearchArg = `--board_search_path="${customBoardSearchDir.replace(/\\/g, '/')}"`;
            }
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
 * 辅助函数：读取并解析 sftool_param.json 文件。
 * @param {string} boardName 选定的芯片模组名称 (用于确定 build 路径)。
 * @returns {Promise<{chip: string, memory: string, files: Array<{file: string, addr: string}>}|null>} 返回一个 Promise,解析为包含芯片类型、存储类型和文件列表的对象,如果文件不存在或解析失败则返回 null。
 */
async function readSftoolParamJson(boardName) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区,无法读取 sftool_param.json。');
        return null;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildTargetFolder = getBuildTargetFolder(boardName);
    const jsonFilePath = path.join(workspaceRoot, PROJECT_SUBFOLDER, buildTargetFolder, SFTOOL_PARAM_JSON_FILE);

    console.log(`[SiFli Extension] Reading sftool_param.json from: ${jsonFilePath}`);

    if (!fs.existsSync(jsonFilePath)) {
        vscode.window.showWarningMessage(
            `未找到当前模组 (${boardName}) 的下载参数文件 (${path.basename(jsonFilePath)})。` + 
            `请尝试先执行“构建”操作。`
        );
        return null;
    }

    try {
        const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
        const sftoolParam = JSON.parse(fileContent);

        // 验证 JSON 结构
        // 确保 'chip', 'write_flash' 和 'write_flash.files' 字段存在且类型正确
        if (!sftoolParam.chip || !sftoolParam.write_flash || !Array.isArray(sftoolParam.write_flash.files)) {
            vscode.window.showErrorMessage(`sftool_param.json 结构无效。缺少 'chip' 或 'write_flash.files' 字段。`);
            console.error(`[SiFli Extension] Invalid sftool_param.json structure:`, sftoolParam);
            return null;
        }

        // 获取 memory 字段,如果不存在则默认为 'NOR'
        const memoryType = sftoolParam.memory || 'NOR';

        // 映射文件列表,注意 json 文件的键是 "file" 和 "addr"
        const filesToFlash = sftoolParam.write_flash.files.map(item => ({
            file: item.file,
            addr: item.addr
        }));

        console.log(`[SiFli Extension] Parsed sftool_param.json:`, { chip: sftoolParam.chip, memory: memoryType, files: filesToFlash });
        return {
            chip: sftoolParam.chip,
            memory: memoryType,
            files: filesToFlash
        };

    } catch (error) {
        vscode.window.showErrorMessage(`解析 sftool_param.json 失败: ${error.message}。请检查文件内容是否为有效 JSON。`);
        console.error(`[SiFli Extension] Failed to read or parse sftool_param.json:`, error);
        return null;
    }
}


/**
 * 辅助函数：根据选定的芯片模组和串口号动态生成 sftool 下载命令。
 * @param {string} boardName 选定的芯片模组名称 (e.g., "sf32lb52-lchspi-ulp").
 * @param {string} serialPortNum 串口号 (e.g., "5" for COM5).
 * @returns {Promise<string>} 完整的 sftool 下载命令。如果文件不存在或参数获取失败,则返回空字符串。
 */
async function getSftoolDownloadCommand(boardName, serialPortNum) {
    if (!boardName) {
        vscode.window.showWarningMessage('未选择 SiFli 芯片模组。请点击状态栏中的“SiFli Board: N/A”选择模组。');
        return '';
    }
    if (!serialPortNum) {
        vscode.window.showWarningMessage('未选择下载串口。请点击状态栏中的“COM: N/A”选择串口。');
        return '';
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区,无法生成下载命令。');
        return '';
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildTargetFolder = getBuildTargetFolder(boardName);
    const buildPath = path.join(workspaceRoot, PROJECT_SUBFOLDER, buildTargetFolder);

    // 读取 sftool_param.json 获取芯片类型、存储类型和文件列表
    const sftoolParams = await readSftoolParamJson(boardName);
    if (!sftoolParams) {
        // readSftoolParamJson 内部已经处理了文件不存在或解析失败的提示
        return '';
    }

    const chipType = sftoolParams.chip;
    const memoryType = sftoolParams.memory.toLowerCase(); // 转换为小写,如 "nor", "nand", "sd"
    const filesToFlash = sftoolParams.files;

    if (filesToFlash.length === 0) {
        vscode.window.showWarningMessage(
            `sftool_param.json 中未指定任何烧录文件。无法生成下载命令。`
        );
        return ''; 
    }

    // 检查核心 .bin 文件是否存在（基于 JSON 中的路径）
    const missingFiles = [];
    for (const fileEntry of filesToFlash) {
        const fullFilePath = path.join(buildPath, fileEntry.file); // 注意这里是 item.file
        if (!fs.existsSync(fullFilePath)) {
            missingFiles.push(path.relative(workspaceRoot, fullFilePath));
        }
    }

    if (missingFiles.length > 0) {
        vscode.window.showWarningMessage(
            `当前模组 (${boardName}) 的以下关键固件文件未找到,无法执行下载操作：\n` +
            `- ${missingFiles.join('\n- ')}\n` +
            `请尝试先执行“Build”操作,确保项目已成功编译。`
        );
        return ''; // 文件缺失,不生成下载命令
    }


    // 构建 write_flash 部分的参数
    const flashArguments = filesToFlash.map(item => {
        // JSON 中的路径是相对于构建输出目录的,直接拼接即可
        const fullRelativePath = path.join(buildTargetFolder, item.file).replace(/\\/g, '\\\\'); // Windows路径可能需要双反斜杠转义
        return `"${fullRelativePath}@${item.addr}"`; // 注意这里是 item.addr
    }).join(' ');

    // 构造完整的 sftool 命令,加入 -m 参数
    const downloadCommand = `sftool -p COM${serialPortNum} -m ${memoryType} -c ${chipType} write_flash ${flashArguments}`;
    console.log(`[SiFli Extension] Generated sftool command: ${downloadCommand}`);
    return downloadCommand;
}


/**
 * 辅助函数：读取并更新插件配置中的路径信息。
 * 在插件激活时调用,并在用户修改配置时监听并更新。
 */
async function updateConfiguration() { // 变为 async 函数,因为会调用 discoverSiFliSdks
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    SF32_TERMINAL_PATH = config.get('powershellPath');
    SIFLI_SDK_EXPORT_SCRIPT_PATH = config.get('sifliSdkExportScriptPath'); // 这是当前激活的 SDK 脚本路径
    
    // **确保这里始终从配置中读取 selectedBoardName**
    // 如果配置中没有或为空,则 selectedBoardName 将保持为空字符串,在状态栏中会显示为 N/A
    selectedBoardName = config.get('defaultChipModule', ''); // 确保获取时有默认值,如果未设置则为''
    
    numThreads = config.get('numThreads', os.cpus().length > 0 ? os.cpus().length : 8); 

    // 根据当前激活的 export 脚本路径计算 SDK 根目录
    // 假设 export.ps1 位于 SDK 的根目录
    if (SIFLI_SDK_EXPORT_SCRIPT_PATH && fs.existsSync(SIFLI_SDK_EXPORT_SCRIPT_PATH)) {
        SIFLI_SDK_ROOT_PATH = path.dirname(SIFLI_SDK_EXPORT_SCRIPT_PATH);
    } else {
        // 如果当前配置的 export 脚本路径无效,尝试从已安装路径中查找第一个有效的
        const installedPaths = config.get('installedSdkPaths', []);
        let foundValidPath = false;
        for (const sdkPath of installedPaths) {
            const exportScript = path.join(sdkPath, 'export.ps1');
            if (fs.existsSync(exportScript)) {
                SIFLI_SDK_EXPORT_SCRIPT_PATH = exportScript;
                SIFLI_SDK_ROOT_PATH = sdkPath;
                await config.update('sifliSdkExportScriptPath', exportScript, vscode.ConfigurationTarget.Global); // 更新配置为第一个找到的有效路径
                vscode.window.showInformationMessage(`SiFli SDK export.ps1 脚本路径已自动设置为: ${exportScript}`);
                foundValidPath = true;
                break;
            }
        }
        if (!foundValidPath) {
            SIFLI_SDK_ROOT_PATH = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
                ? vscode.workspace.workspaceFolders[0].uri.fsPath : os.homedir();
            vscode.window.showWarningMessage('SiFli SDK export.ps1 脚本路径未配置或无效，且未在已安装路径中找到有效 SDK。请在扩展设置中检查。');
        }
    }

    // 重新构建终端启动参数
    SF32_TERMINAL_ARGS = [
        "-ExecutionPolicy",
        "Bypass",
        "-NoExit",
        "-File",
        SIFLI_SDK_EXPORT_SCRIPT_PATH
    ];

    // 发现所有已安装的 SDK 版本
    detectedSdkVersions = await discoverSiFliSdks(); // 调用新的发现函数

    console.log(`[SiFli Extension] Configuration updated:`);
    console.log(`  PowerShell Path: ${SF32_TERMINAL_PATH}`);
    console.log(`  SiFli SDK Export Script Path: ${SIFLI_SDK_EXPORT_SCRIPT_PATH}`);
    console.log(`  Selected SiFli Board: ${selectedBoardName}`); 
    console.log(`  Compilation Threads: ${numThreads}`);
    console.log(`  Detected SDK Versions:`, detectedSdkVersions);

    updateStatusBarItems(); // 配置更新后,更新状态栏显示
}

/**
 * 辅助函数：扫描所有已配置的 SDK 路径，并尝试识别其版本（仅从 version.txt 读取）。
 * @returns {Promise<Array<{path: string, version: string, current: boolean, isValid: boolean}>>}
 */
async function discoverSiFliSdks() {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const installedPaths = config.get('installedSdkPaths', []);
    const currentActiveSdkPath = SIFLI_SDK_ROOT_PATH; // 当前激活的 SDK 根目录

    const discovered = [];

    for (const sdkPath of installedPaths) {
        const exportScriptPath = path.join(sdkPath, 'export.ps1');
        const versionFile = path.join(sdkPath, 'version.txt');

        let sdkVersion = '未知版本';
        let isValidSdk = false;

        if (fs.existsSync(exportScriptPath)) {
            isValidSdk = true;
            try {
                // 仅从 version.txt 文件读取版本号
                if (fs.existsSync(versionFile)) {
                    sdkVersion = fs.readFileSync(versionFile, 'utf8').trim();
                } else {
                    sdkVersion = '无 version.txt 文件';
                }
            } catch (err) {
                console.error(`[SiFli Extension] 读取 SDK 版本信息失败 for ${sdkPath}: ${err.message}`);
                sdkVersion = '读取失败';
            }
        } else {
            isValidSdk = false;
            sdkVersion = '无效 SDK 路径 (无 export.ps1)';
        }

        discovered.push({
            path: sdkPath,
            version: sdkVersion,
            isValid: isValidSdk,
            current: sdkPath === currentActiveSdkPath
        });
    }

    return discovered;
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
 * 切换 SiFli SDK 版本的命令。
 * 弹出 Quick Pick 列表供用户选择。
 */
async function switchSdkVersion() {
    if (detectedSdkVersions.length === 0) {
        vscode.window.showInformationMessage('未发现任何已安装的 SiFli SDK 版本。请通过“管理 SiFli SDK”功能进行安装。');
        return;
    }

    const pickOptions = detectedSdkVersions.map(sdk => ({
        label: sdk.version,
        description: sdk.path,
        detail: sdk.current ? '当前激活' : (sdk.isValid ? '' : '无效路径'),
        sdkPath: sdk.path,
        isValid: sdk.isValid
    }));

    const selected = await vscode.window.showQuickPick(pickOptions, {
        placeHolder: '选择要切换的 SiFli SDK 版本',
        title: '切换 SiFli SDK 版本'
    });

    if (selected) {
        if (!selected.isValid) {
            vscode.window.showWarningMessage(`选择的 SDK 路径无效：${selected.sdkPath}。请检查该路径下是否存在 'export.ps1'。`);
            return;
        }
        
        // 如果选择的是当前激活的 SDK，则不做任何操作
        if (selected.sdkPath === SIFLI_SDK_ROOT_PATH) {
            vscode.window.showInformationMessage(`SiFli SDK 已是当前版本：${selected.version}`);
            return;
        }

        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        const newExportScriptPath = path.join(selected.sdkPath, 'export.ps1');

        await config.update('sifliSdkExportScriptPath', newExportScriptPath, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`SiFli SDK 已切换到版本: ${selected.version}`);
        
        // 强制重新初始化终端以加载新的环境变量
        vscode.window.showInformationMessage('SiFli SDK 环境已更新。正在重新加载终端...');
        const terminal = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
        if (terminal) {
            terminal.dispose(); // 关闭现有终端
        }

        // 确保 updateConfiguration 已经执行，因为它会更新 SF32_TERMINAL_ARGS
        // 由于 config.update 触发 onDidChangeConfiguration -> updateConfiguration，
        // 可以在这里加一个短延迟确保 updateConfiguration 完成，尽管通常不是严格必要，但为了健壮性可以保留。
        await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟
        await updateConfiguration(); // 再次确保所有配置最新，特别是 SF32_TERMINAL_ARGS
        await getOrCreateSiFliTerminalAndCdProject(); // 立即创建并显示新终端，它会执行新的 export.ps1 并 cd 到项目目录
    } else {
        vscode.window.showInformationMessage('已取消 SDK 版本切换。');
    }
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
                selectedSerialPort = null; // 明确设置为 null
                updateStatusBarItems(); // 更新状态栏
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
 * 辅助函数：扫描指定目录,查找符合条件的板子配置。
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
                    // 优先级逻辑：如果高优先级类型（custom/project_local）的板子与已存在板子同名,则覆盖
                    // SDK板子优先级最低
                    if (sourceType === 'sdk' && boardMap.has(boardName)) {
                        // 如果当前是SDK板子,但Map中已有同名板子,则跳过（因为Map中的板子优先级更高）
                        console.log(`[SiFli Extension] Skipping SDK board ${boardName} as higher priority board already exists.`);
                        continue;
                    } else if ((sourceType === 'custom' || sourceType === 'project_local') && boardMap.has(boardName)) {
                        // 如果当前是自定义或项目本地板子,且Map中已有同名板子,则覆盖
                        console.log(`[SiFli Extension] Overwriting board ${boardName} with higher priority board from ${sourceType} path.`);
                        boardMap.delete(boardName); // 删除旧的,添加新的
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
 * 3. 如果设置了 customBoardSearchPath,则扫描该目录 (最高优先级)。
 * 有效的板子选项需同时存在 `hcpu` 目录和 `ptab.json` 文件。
 *
 * @returns {Promise<Array<{name: string, path: string, type: 'sdk'|'custom'|'project_local'}>>} 返回一个 Promise,解析为有效板子信息的数组。
 */
async function discoverBoards() {
    // 使用 Map 来存储板子,键为板子名称,值是包含其路径和类型的对象,以便处理优先级
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

    // 3. 如果设置了 customBoardSearchPath,则扫描该目录 (最高优先级)
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
    // 统一检查板子是否已选择
    if (!selectedBoardName) {
        vscode.window.showWarningMessage('未选择 SiFli 芯片模组。请点击状态栏中的“SiFli Board: N/A”选择模组。');
        return;
    }

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
    if (compileCommand) { // 只有命令生成成功才执行
        await executeShellCommandInSiFliTerminal(compileCommand, BUILD_TASK_NAME);
    }
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

/**
 * 更新状态栏按钮的提示信息
 */
function updateStatusBarItems() {
    // getCompileCommand 和 getMenuconfigCommand 现在是异步的,不能直接在这里调用。
    // 状态栏的tooltip可以简化,或者在需要时才异步更新。
    // 为了避免在这里await,我们移除tooltip中动态命令的显示。
    if (compileBtn) {
        compileBtn.tooltip = `执行 SiFli 构建`;
    }
    if (rebuildBtn) {
        rebuildBtn.tooltip = `清理并执行 SiFli 构建`;
    }
    if (cleanBtn) {
        cleanBtn.tooltip = `删除 SiFli 构建缓存 (${selectedBoardName || 'N/A'})`; // tooltip也同步N/A状态
    }
    if (downloadBtn) {
        downloadBtn.tooltip = `执行 SiFli 下载 (当前模组: ${selectedBoardName || '未选择'})`; // 更新提示
    }
    if (menuconfigBtn) {
        menuconfigBtn.tooltip = `打开 SiFli Menuconfig`;
    }
    if (currentBoardStatusItem) {
        // 如果 selectedBoardName 为空字符串,则显示 "N/A"
        currentBoardStatusItem.text = `$(circuit-board) SiFli Board: ${selectedBoardName || 'N/A'} (J${numThreads})`;
        currentBoardStatusItem.tooltip = `当前 SiFli 芯片模组: ${selectedBoardName || '未选择'}\n编译线程数: J${numThreads}\n点击切换芯片模组或修改线程数`;
    }
    // 更新串口状态栏项
    if (currentSerialPortStatusItem) {
        currentSerialPortStatusItem.text = `$(plug) COM: ${selectedSerialPort || 'N/A'}`; // 如果没有选择,显示 N/A
        currentSerialPortStatusItem.tooltip = `当前下载串口: ${selectedSerialPort || '未选择'}\n点击选择串口`;
    }
    if (sdkManageBtn) { // 更新 SDK 管理按钮的 tooltip
        sdkManageBtn.tooltip = '管理 SiFli SDK 安装';
    }
    if (currentSdkVersionStatusItem) {
        // 查找当前激活的 SDK 版本信息
        const currentSdk = detectedSdkVersions.find(sdk => sdk.current);
        const sdkVersionText = currentSdk ? currentSdk.version : 'N/A';
        currentSdkVersionStatusItem.text = `SDK: ${sdkVersionText}`; // 带有图标和版本号
        currentSdkVersionStatusItem.tooltip = `当前 SiFli SDK 版本: ${sdkVersionText}\n点击切换 SDK 版本`;
    }
}

// 初始化状态栏按钮
function initializeStatusBarItems(context) {
    const CMD_PREFIX = "extension.";

    // SDK 管理按钮 (保持不变，或根据需要调整优先级)
    sdkManageBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
    sdkManageBtn.text = '$(cloud-download)';
    sdkManageBtn.tooltip = '管理 SiFli SDK 安装';
    sdkManageBtn.command = CMD_PREFIX + 'manageSiFliSdk';
    sdkManageBtn.show();
    context.subscriptions.push(sdkManageBtn);

    // 新增：SDK 版本切换按钮
    currentSdkVersionStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    currentSdkVersionStatusItem.text = 'SDK: N/A'; // 初始文本
    currentSdkVersionStatusItem.tooltip = '点击切换 SiFli SDK 版本';
    currentSdkVersionStatusItem.command = CMD_PREFIX + 'switchSdkVersion'; // 绑定新的切换命令
    currentSdkVersionStatusItem.show();
    context.subscriptions.push(currentSdkVersionStatusItem);
    
    // 显示当前板卡的状态栏项
    currentBoardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    currentBoardStatusItem.text = '$(circuit-board) SiFli Board: N/A';
    currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule';
    currentBoardStatusItem.show();
    context.subscriptions.push(currentBoardStatusItem);

    // 显示当前串口的状态栏项
    currentSerialPortStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    currentSerialPortStatusItem.text = '$(plug) COM: N/A';
    currentSerialPortStatusItem.command = CMD_PREFIX + 'selectDownloadPort';
    currentSerialPortStatusItem.show();
    context.subscriptions.push(currentSerialPortStatusItem);
    
    compileBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    compileBtn.text = '$(symbol-property)';
    compileBtn.command = CMD_PREFIX + 'compile';
    compileBtn.show();
    context.subscriptions.push(compileBtn);

    rebuildBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    rebuildBtn.text = '$(sync)';
    rebuildBtn.command = CMD_PREFIX + 'rebuild';
    rebuildBtn.show();
    context.subscriptions.push(rebuildBtn);

    cleanBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    cleanBtn.text = '$(trashcan)';
    cleanBtn.command = CMD_PREFIX + 'clean';
    cleanBtn.show();
    context.subscriptions.push(cleanBtn);

    downloadBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    downloadBtn.text = '$(symbol-event)';
    downloadBtn.command = CMD_PREFIX + 'download';
    downloadBtn.show();
    context.subscriptions.push(downloadBtn);

    menuconfigBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 94);
    menuconfigBtn.text = '$(settings-gear)';
    menuconfigBtn.command = CMD_PREFIX + 'menuconfig';
    menuconfigBtn.show();
    context.subscriptions.push(menuconfigBtn);

    updateStatusBarItems(); // 初始化tooltip和板卡、串口显示
}

/**
 * 提示用户选择初始芯片模组。
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
    // 条件：从未进行过初始设置 OR 当前配置的默认模组无效/未设置 OR 当前配置的默认模组不在已发现的板子列表中
    if (!hasRunInitialSetup || !currentDefaultBoard || !availableBoardsDetails.some(b => b.name === currentDefaultBoard)) {
        vscode.window.showInformationMessage('请选择您当前要开发的芯片模组。');

        if (availableBoardsDetails.length === 0) {
            vscode.window.showWarningMessage('未发现任何 SiFli 芯片模组。请检查您的 SDK 安装或自定义板子路径设置。');
            // 即使没有板子,也标记为已运行,避免每次启动都弹出
            await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
            // 此时 selectedBoardName 保持为空或无效值,updateConfiguration 会将其显示为 N/A
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
            // 用户取消初始选择,清空配置中的 defaultChipModule,使其显示为 N/A
            await config.update('defaultChipModule', '', vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('已取消芯片模组选择。请稍后点击状态栏中的“SiFli Board: N/A”重新选择。');
        }
        await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
        // 这里不需要再手动更新 selectedBoardName 和 updateStatusBarItems(),
        // 因为 config.update() 会触发 onDidChangeConfiguration,进而调用 updateConfiguration() 来处理。
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

    if (selectedQuickPickItem) {
        if (selectedQuickPickItem.label !== selectedBoardName) {
            const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
            // 更新全局配置
            await config.update('defaultChipModule', selectedQuickPickItem.label, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`SiFli 芯片模组已切换为: ${selectedQuickPickItem.label}`);
            // updateConfiguration() 会在配置变化监听器中自动调用,更新 selectedBoardName
        }
    } else {
        // 用户取消选择,不做任何操作,保持原有的 defaultChipModule 不变。
        // vscode.window.showInformationMessage('已取消芯片模组选择。'); // 可以选择不显示此消息,避免打扰用户
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
 * 处理用户点击状态栏串口,选择或修改串口的命令。
 */
async function selectDownloadPort() {
    await selectSerialPort(); // 直接调用通用的串口选择函数
}

// --- 新增 Git 相关辅助函数 ---

/**
 * 检查系统是否安装了 Git。
 * @returns {Promise<boolean>}
 */
async function isGitInstalled() {
    return new Promise(resolve => {
        exec('git --version', (error) => {
            if (error) {
                console.error(`[SiFli Extension] Git is not installed or not in PATH: ${error.message}`);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

/**
 * 辅助函数：执行 Git 命令。
 * 使用 child_process.spawn 结合 progress 监听 Git 输出，并将详细日志写入输出通道。
 * @param {string} command Git命令 (例如 'clone')
 * @param {string[]} args 命令参数 (例如 ['--recursive', '--progress', '<url>', '-b', '<tag>', '<path>'])
 * @param {string} cwd 命令执行的工作目录
 * @returns {Promise<void>}
 */
async function executeGitCommand(command, args, cwd) { // 参数改为 command 和 args 数组 
    let lastProgressMessage = ''; // 存储上一个进度消息，避免重复报告
    let lastKnownProgress = 0; // 上次已知的Git下载百分比
    
    // 返回一个 Promise，以便外部的 withProgress 可以等待这个子操作完成
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Git ${command} - 下载中...`,
        cancellable: false
    }, async (gitProgress) => {
        return new Promise((resolve, reject) => {
            gitOutputChannel.show(true); // 显示输出通道
            gitOutputChannel.appendLine(`>>> 执行 Git 命令: git ${command} ${args.join(' ')} (工作目录: ${cwd})`);
            gitProgress.report({ message: `启动 Git ${command}...` });

            const gitProcess = spawn(command, args, { cwd: cwd, timeout: 600000 }); // 10分钟超时

            gitProcess.stdout.on('data', (data) => {
                const message = data.toString().trim();
                if (message) {
                    gitOutputChannel.appendLine(`[stdout] ${message}`);
                    // 对于标准输出，通常是文件列表等信息，可以在进度条上简要显示
                    if (message.length < 100) { // 避免过长的文件名刷屏
                        gitProgress.report({ message: message });
                    }
                }
            });

            gitProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (!message) return;

                gitOutputChannel.appendLine(`[stderr] ${message}`);

                // 尝试匹配 Git 克隆进度百分比
                const progressMatch = message.match(/Receiving objects: (\d+)%/);
                if (progressMatch && progressMatch[1]) {
                    const currentPercent = parseInt(progressMatch[1]);
                    // 仅当百分比有变化时才更新进度条
                    if (currentPercent !== lastKnownProgress) {
                        gitProgress.report({ increment: currentPercent - lastKnownProgress, message: `Git 进度: ${message}` });
                        lastKnownProgress = currentPercent;
                    }
                } else if (message.includes('Cloning into') || message.includes('Resolving deltas')) {
                    // 其他重要 Git 进度信息，但不包含百分比
                    if (message !== lastProgressMessage) { // 避免重复显示相同消息
                        gitProgress.report({ message: `Git 消息: ${message}` });
                        lastProgressMessage = message;
                    }
                } else {
                    // 其他 stderr 输出，也报告给进度条，但可以设置一个长度限制避免刷屏
                    if (message.length < 100 && message !== lastProgressMessage) {
                        gitProgress.report({ message: `Git 警告/信息: ${message}` });
                        lastProgressMessage = message;
                    }
                }
            });

            gitProcess.on('close', (code) => {
                if (code === 0) {
                    gitOutputChannel.appendLine(`<<< Git 命令完成 (退出码: ${code})`);
                    gitProgress.report({ message: `Git ${command} 完成。`, increment: 100 - lastKnownProgress }); // 确保进度条走完
                    resolve();
                } else {
                    const errorMessage = `Git 命令失败 (退出码: ${code})`;
                    gitOutputChannel.appendLine(`!!! ${errorMessage}`);
                    reject(new Error(errorMessage));
                }
            });

            gitProcess.on('error', (err) => {
                const errorMessage = `执行 Git 命令出错: ${err.message}`;
                gitOutputChannel.appendLine(`!!! ${errorMessage}`);
                reject(new Error(errorMessage));
            });
        });
    });
}

// --- SDK 管理相关的函数修改 ---

/**
 * 从 GitHub 或 Gitee API 获取 SiFli SDK 的发布版本列表 (现在返回更全面的信息)。
 * @param {'github' | 'gitee'} source
 * @returns {Promise<Array<{name: string, tagName: string, downloadUrl?: string, publishedAt: string}>>}
 * downloadUrl 现在可能为空,因为我们主用 Git。
 * publishedAt 用于排序和判断最新。
 */
async function fetchSiFliSdkReleases(source) {
    const url = source === 'github' ? `${SIFLI_SDK_GITHUB_REPO_BASE}/releases` : `${SIFLI_SDK_GITEE_REPO_BASE}/releases`;
    const headers = { 'User-Agent': 'VSCode-SiFli-Extension' };

    try {
        const response = await axios.get(url, { headers });
        const releases = response.data;

        const formattedReleases = releases.map(release => ({
            name: release.name || release.tag_name,
            tagName: release.tag_name,
            downloadUrl: release.zipball_url || '', // 兼容性保留,主用 Git 后可以忽略
            publishedAt: release.created_at
        }));

        // 按发布日期降序排序,确保第一个是最新版本
        formattedReleases.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

        return formattedReleases;
    } catch (error) {
        console.error(`[SiFli SDK Manager] 获取发布版本失败 (${source}): ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}, Data:`, error.response.data);
        } else if (error.request) {
            console.error('No response received:', error.request);
        }
        throw new Error(`获取发布版本失败: ${error.message}`);
    }
}

/**
 * 新增：从 GitHub 或 Gitee API 获取 SiFli SDK 的分支列表。
 * @param {'github' | 'gitee'} source
 * @returns {Promise<Array<{name: string, commitSha: string}>>}
 */
async function fetchSiFliSdkBranches(source) {
    const url = source === 'github' ? `${SIFLI_SDK_GITHUB_REPO_BASE}/branches` : `${SIFLI_SDK_GITEE_REPO_BASE}/branches`;
    const headers = { 'User-Agent': 'VSCode-SiFli-Extension' };

    try {
        const response = await axios.get(url, { headers });
        const branches = response.data;

        const formattedBranches = branches.map(branch => ({
            name: branch.name,
            commitSha: branch.commit.sha
        }));

        // 优先显示 main/master,然后按字母顺序排序
        formattedBranches.sort((a, b) => {
            if (a.name === 'main' || a.name === 'master') return -1;
            if (b.name === 'main' || b.name === 'master') return 1;
            return a.name.localeCompare(b.name);
        });

        return formattedBranches;
    } catch (error) {
        console.error(`[SiFli SDK Manager] 获取分支失败 (${source}): ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}, Data:`, error.response.data);
        } else if (error.request) {
            console.error('No response received:', error.request);
        }
        throw new Error(`获取分支失败: ${error.message}`);
    }
}


/**
 * 获取 WebView 的 HTML 内容。
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @returns {string} HTML 字符串 
 */
function getSdkManagementWebviewContent(webview, extensionUri) {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'WebView', 'sdk_manager.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'WebView', 'sdk_manager.css'));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'images', 'SiFli.png'));

    // 读取 HTML 文件内容
    const htmlFilePath = vscode.Uri.joinPath(extensionUri, 'WebView', 'sdk_manager.html');
    let htmlContent = fs.readFileSync(htmlFilePath.fsPath, 'utf8');

    // 替换占位符
    htmlContent = htmlContent.replace(/{{nonce}}/g, nonce);
    htmlContent = htmlContent.replace(/{{cspSource}}/g, webview.cspSource);
    htmlContent = htmlContent.replace(/{{scriptUri}}/g, scriptUri);
    htmlContent = htmlContent.replace(/{{styleUri}}/g, styleUri);
    htmlContent = htmlContent.replace(/{{logoUri}}/g, logoUri);

    return htmlContent;
}

/**
 * 生成一个随机字符串作为 CSP 的 nonce。
 * @returns {string}
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) { //
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * 创建并显示用于 SiFli SDK 管理的 WebView。
 * @param {vscode.ExtensionContext} context
 */
async function createSdkManagementWebview(context) {
    const panel = vscode.window.createWebviewPanel(
        'sifliSdkManager', // Identifies the type of the webview. Used internally
        'SiFli SDK 管理器', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
            enableScripts: true, // Enable JavaScript in the webview
            retainContextWhenHidden: true // Keep the state of the webview even when it's not visible
        }
    );

    panel.webview.html = getSdkManagementWebviewContent(panel.webview, context.extensionUri);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'browseInstallPath':
                    const selectedFolders = await vscode.window.showOpenDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                        canSelectMany: false,
                        title: '选择 SiFli SDK 安装目录'
                    });
                    if (selectedFolders && selectedFolders.length > 0) {
                        panel.webview.postMessage({
                            command: 'installPathSelected',
                            path: selectedFolders[0].fsPath
                        });
                    }
                    return;
                case 'fetchReleases':
                    try {
                        const releases = await fetchSiFliSdkReleases(message.source);
                        panel.webview.postMessage({
                            command: 'displayReleases',
                            releases: releases
                        });
                    } catch (error) {
                        // 将Webview的logMessage替换为VS Code的错误弹窗或控制台日志
                        vscode.window.showErrorMessage(`获取发布版本失败: ${error.message}`);
                        console.error(`[SiFli SDK Manager] 获取发布版本失败: ${error.message}`);
                    }
                    return;
                case 'fetchBranches': // 新增：处理获取分支的命令
                    try {
                        const branches = await fetchSiFliSdkBranches(message.source);
                        panel.webview.postMessage({
                            command: 'displayBranches',
                            branches: branches
                        });
                    } catch (error) {
                        // 将Webview的logMessage替换为VS Code的错误弹窗或控制台日志
                        vscode.window.showErrorMessage(`获取分支列表失败: ${error.message}`);
                        console.error(`[SiFli SDK Manager] 获取分支列表失败: ${error.message}`);
                    }
                    return;
                case 'startSdkInstallation':
                    // 检查 Git 是否安装
                    if (!await isGitInstalled()) {
                        vscode.window.showErrorMessage('Git 未安装或不在 PATH 中。请先安装 Git。');
                        panel.webview.postMessage({ command: 'installationError', error: 'Git 未安装。' });
                        return;
                    }

                    // 移除了这里的 `vscode.window.showInformationMessage`，因为 `installSiFliSdk` 会处理最终提示
                    // vscode.window.showInformationMessage(`正在为 ${message.type === 'tag' ? '版本' : '分支'} ${message.name} 在 ${message.installPath} 启动 SiFli SDK 安装 (通过 Git)`);

                    try {
                        await installSiFliSdk(message.source, message.type, message.name, message.installPath, panel.webview);
                        // 移除了这里的 `vscode.window.showInformationMessage`，因为 `installSiFliSdk` 会处理最终提示
                        // vscode.window.showInformationMessage('SiFli SDK 安装成功完成！');
                        panel.webview.postMessage({ command: 'installationComplete' });
                    } catch (error) {
                        // 移除了这里的 `vscode.window.showErrorMessage`，因为 `installSiFliSdk` 会处理最终提示
                        // vscode.window.showErrorMessage(`SiFli SDK 安装失败: ${error.message}`);
                        panel.webview.postMessage({ command: 'installationError', error: error.message });
                    }
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

/**
 * 执行 SiFli SDK 的下载和安装（通过 Git）。
 * 使用 vscode.window.withProgress 提供安装进程反馈。
 * @param {'github' | 'gitee'} source Git仓库来源
 * @param {'tag' | 'branch'} type 下载类型：标签(release)或分支
 * @param {string} name 对应的标签名称或分支名称
 * @param {string} installPath 安装目录的完整路径
 * @param {vscode.Webview} webview 用于向 WebView 发送安装完成/失败消息 (可选,仅用于通知 WebView 禁用按钮等)
 * @returns {Promise<void>}
 */
async function installSiFliSdk(source, type, name, installPath, webview) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, // 显示在通知区域
        title: "SiFli SDK 整体安装中", // 更改标题以反映整体进度
        cancellable: false
    }, async (progress) => {
        let currentOverallProgress = 0;
        // 总共约 7 个主要步骤，每个步骤分配一定的权重
        const totalStepsWeight = 100;

        const updateOverallProgress = (message, weight) => {
            currentOverallProgress += weight;
            progress.report({ message: message, increment: weight });
            // 可以在这里也记录到输出通道，如果需要整体日志
            gitOutputChannel.appendLine(`[SDK Installer] ${message} (${currentOverallProgress}%)`);
        };

        try {
            updateOverallProgress('检查 Git 安装...', 5);
            if (!await isGitInstalled()) {
                throw new Error('Git 未安装或不在 PATH 中。请先安装 Git。');
            }

            if (type === 'tag') {
                updateOverallProgress('检查最新版本信息...', 10);
                try {
                    const allReleases = await fetchSiFliSdkReleases(source);
                    if (allReleases.length > 0) {
                        const latestReleaseTag = allReleases[0].tagName;
                        if (name !== latestReleaseTag) {
                            const userChoice = await vscode.window.showWarningMessage(
                                `您选择的版本是 ${name}, 但最新版本是 ${latestReleaseTag}。是否要安装最新版本？`,
                                '安装最新版本', '安装我选择的版本'
                            );
                            if (userChoice === '安装最新版本') {
                                name = latestReleaseTag;
                                updateOverallProgress(`用户选择安装最新版本: ${name}`, 0);
                            } else if (userChoice === undefined) {
                                throw new Error('用户取消安装。');
                            }
                        }
                    }
                } catch (error) {
                    updateOverallProgress('无法获取最新版本信息，继续安装指定版本。', 0);
                    console.warn(`[SiFli SDK Manager] 无法获取最新版本信息或处理版本选择: ${error.message}`);
                }
            }

            updateOverallProgress('准备安装路径...', 10);
            if (fs.existsSync(installPath)) {
                const response = await vscode.window.showWarningMessage(
                    `安装路径 '${installPath}' 已存在。是否清空并继续安装？`,
                    '清空并继续', '取消'
                );
                if (response === '清空并继续') {
                    updateOverallProgress(`清空现有目录: ${installPath}`, 10);
                    try {
                        fs.rmSync(installPath, { recursive: true, force: true });
                    } catch (error) {
                        throw new Error(`清空目录失败: ${error.message}`);
                    }
                } else {
                    throw new Error('用户取消安装。');
                }
            }

            const parentDir = path.dirname(installPath);
            if (!fs.existsSync(parentDir)) {
                updateOverallProgress(`创建父目录: ${parentDir}`, 5);
                try {
                    fs.mkdirSync(parentDir, { recursive: true });
                } catch (error) {
                    throw new Error(`创建父目录失败: ${error.message}`);
                }
            }

            updateOverallProgress(`开始克隆 Git 仓库 (${type}: ${name})...`, 0); // 进度交给子进度条
            const repoUrl = source === 'github' ? SIFLI_SDK_GITHUB_REPO_GIT : SIFLI_SDK_GITEE_REPO_GIT;
            const gitArgs = ['clone', '--recursive', '--progress', repoUrl, '-b', name, installPath];

            // <<<<<< 调用修改后的 executeGitCommand
            await executeGitCommand('git', gitArgs, parentDir);
            updateOverallProgress('Git 克隆和版本/分支切换完成。', 45); // Git操作完成后，增加整体进度

            updateOverallProgress('更新 VS Code 配置...', 10);
            // const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
            // const exportPs1Path = path.join(installPath, 'export.ps1');

            // if (fs.existsSync(exportPs1Path)) {
            //     await config.update('sifliSdkExportScriptPath', exportPs1Path, vscode.ConfigurationTarget.Global);
            //     vscode.window.showInformationMessage(`SiFli SDK 安装完成，并已更新 'SiFli SDK 导出脚本路径' 到: ${exportPs1Path}`);
            // } else {
            //     vscode.window.showWarningMessage(`SDK 安装完成，但未找到 'export.ps1' 脚本于 ${exportPs1Path}。请手动配置。`);
            // }

            updateOverallProgress('SDK 安装流程最终完成。', 5); // 确保总进度达到100
            vscode.window.showInformationMessage('SiFli SDK 已成功安装！');
            webview.postMessage({ command: 'installationComplete' });

        } catch (error) {
            vscode.window.showErrorMessage(`SiFli SDK 安装失败: ${error.message}`);
            gitOutputChannel.appendLine(`!!! SiFli SDK 安装失败: ${error.message}`); // 错误也写入输出通道
            webview.postMessage({ command: 'installationError', error: error.message });

            if (fs.existsSync(installPath)) {
                try {
                    vscode.window.showWarningMessage(`安装失败，尝试清理部分文件...`);
                    fs.rmSync(installPath, { recursive: true, force: true });
                    gitOutputChannel.appendLine(`!!! 已尝试清理部分安装目录: ${installPath}`);
                } catch (cleanupError) {
                    gitOutputChannel.appendLine(`!!! 清理目录失败: ${cleanupError.message}`);
                    vscode.window.showWarningMessage(`安装失败，且无法完全清理目录: ${cleanupError.message}`);
                }
            }
        } finally {
            // 确保在安装无论成功或失败后，输出通道都可见，方便查看日志
            gitOutputChannel.show(true);
        }
    });
}

async function activate(context) {
    console.log('Congratulations, your SiFli extension is now active!');

    // *** 仅在开发调试时使用：强制重置首次运行标志 ***
    // 这将使得每次“重新运行调试”时,Quick Pick 都会弹出。
    // 在发布生产版本时,请务必删除或注释掉此行！
    await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false); // <--- 生产环境请注释或删除此行
    // ******************************************************

    gitOutputChannel = vscode.window.createOutputChannel("SiFli SDK Git Operations");
    context.subscriptions.push(gitOutputChannel);
    
    // 在插件激活时立即读取配置 (注意现在 updateConfiguration 是 async 的)
    await updateConfiguration(); // 确保在后续逻辑执行前完成配置和 SDK 发现

    if (isSiFliProject()) {
        console.log('[SiFli Extension] SiFli project detected. Activating full extension features.');

        initializeStatusBarItems(context);

        setTimeout(async () => {
            await promptForInitialBoardSelection(context); 
            await updateConfiguration(); // 再次调用以确保在 promptForInitialBoardSelection 之后更新 SDK 列表和状态栏
            
            if (!selectedSerialPort) {
                vscode.window.showInformationMessage('首次启动或串口未连接。请点击状态栏中的 "COM: N/A" 选择串口,以便进行下载操作。');
            }
            await getOrCreateSiFliTerminalAndCdProject();
        }, 500);

        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => { // 监听器也变为 async
            if (e.affectsConfiguration('sifli-sdk-codekit')) {
                await updateConfiguration(); // 确保配置变化时重新发现 SDK 并更新 UI
            }
        }));

        const CMD_PREFIX = "extension.";
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => executeCompileTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', async () => {
                executeCleanCommand();
                await new Promise(resolve => setTimeout(resolve, 500));
                await executeCompileTask();
            }),
            vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => executeCleanCommand()),
            vscode.commands.registerCommand(CMD_PREFIX + 'download', () => executeDownloadTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => executeMenuconfigTask()),
            vscode.commands.registerCommand(CMD_PREFIX + 'selectChipModule', () => selectChipModule()),
            vscode.commands.registerCommand(CMD_PREFIX + 'selectDownloadPort', () => selectDownloadPort()),
            vscode.commands.registerCommand(CMD_PREFIX + 'manageSiFliSdk', () => createSdkManagementWebview(context)),
            vscode.commands.registerCommand(CMD_PREFIX + 'switchSdkVersion', () => switchSdkVersion()) // 注册新的命令
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
    if (currentSdkVersionStatusItem) currentSdkVersionStatusItem.dispose();
    if (currentBoardStatusItem) currentBoardStatusItem.dispose();
    if (currentSerialPortStatusItem) currentSerialPortStatusItem.dispose();
    if (sdkManageBtn) sdkManageBtn.dispose();

    if (gitOutputChannel) gitOutputChannel.dispose();

    console.log('[SiFli Extension] Extension deactivated.');
}

module.exports = { activate, deactivate };