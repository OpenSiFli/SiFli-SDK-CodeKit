// media/sdk_manager.js
(function() {
    const vscode = acquireVsCodeApi();

    const sdkSourceSelect = document.getElementById('sdkSource');
    const downloadTypeSelect = document.getElementById('downloadType');
    const releaseSection = document.getElementById('releaseSection');
    const branchSection = document.getElementById('branchSection');

    const sdkVersionSelect = document.getElementById('sdkVersion');
    const sdkBranchSelect = document.getElementById('sdkBranch');

    const installPathInput = document.getElementById('installPath');
    const browsePathButton = document.getElementById('browsePath');
    const installSdkButton = document.getElementById('installSdk');
    // const logContainer = document.getElementById('logContainer'); // <<<<<< 移除此行

    let availableReleases = [];
    let availableBranches = [];

    // function log(message, level = 'info') { // <<<<<< 移除整个 log 函数
    //     const p = document.createElement('p');
    //     p.className = `log-${level}`;
    //     p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    //     logContainer.appendChild(p);
    //     logContainer.scrollTop = logContainer.scrollHeight; // 滚动到底部
    // }

    // 初始化：获取并显示 SDK 版本/分支
    function fetchAndDisplayOptions() {
        const selectedSource = sdkSourceSelect.value;
        const selectedDownloadType = downloadTypeSelect.value;

        sdkVersionSelect.innerHTML = '<option value="">正在加载版本...</option>';
        sdkVersionSelect.disabled = true;
        sdkBranchSelect.innerHTML = '<option value="">正在加载分支...</option>';
        sdkBranchSelect.disabled = true;

        if (selectedDownloadType === 'release') {
            releaseSection.style.display = 'block';
            branchSection.style.display = 'none';
            // log('正在从服务器获取 SDK 发布版本...', 'info'); // <<<<<< 移除此行
            vscode.postMessage({
                command: 'fetchReleases',
                source: selectedSource
            });
        } else { // 'branch'
            releaseSection.style.display = 'none';
            branchSection.style.display = 'block';
            // log('正在从服务器获取 SDK 分支列表...', 'info'); // <<<<<< 移除此行
            vscode.postMessage({
                command: 'fetchBranches',
                source: selectedSource
            });
        }
    }

    // 处理来自扩展程序的消息
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'installPathSelected':
                installPathInput.value = message.path;
                // log(`已选择安装路径: ${message.path}`, 'info'); // <<<<<< 移除此行
                break;
            case 'displayReleases':
                availableReleases = message.releases;
                sdkVersionSelect.innerHTML = '<option value="">请选择一个版本</option>';
                availableReleases.forEach(release => {
                    const option = document.createElement('option');
                    option.value = release.tagName;
                    option.textContent = `${release.name} (${release.tagName})`;
                    sdkVersionSelect.appendChild(option);
                });
                sdkVersionSelect.disabled = false;
                // log('SDK 发布版本加载完成。', 'info'); // <<<<<< 移除此行
                if (availableReleases.length > 0) {
                    sdkVersionSelect.value = availableReleases[0].tagName;
                }
                break;
            case 'displayBranches':
                availableBranches = message.branches;
                sdkBranchSelect.innerHTML = '<option value="">请选择一个分支</option>';
                availableBranches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name;
                    sdkBranchSelect.appendChild(option);
                });
                sdkBranchSelect.disabled = false;
                // log('SDK 分支列表加载完成。', 'info'); // <<<<<< 移除此行
                if (availableBranches.length > 0) {
                    const defaultBranch = availableBranches.find(b => b.name === 'main' || b.name === 'master');
                    sdkBranchSelect.value = defaultBranch ? defaultBranch.name : availableBranches[0].name;
                }
                break;
            // case 'logMessage': // <<<<<< 移除此整个 case 块
            //     log(message.message, message.level);
            //     break;
            case 'installationComplete':
                installSdkButton.disabled = false;
                // log('SDK 安装流程已完成。', 'info'); // <<<<<< 移除此行
                break;
            case 'installationError':
                installSdkButton.disabled = false;
                // log(`SDK 安装失败: ${message.error}`, 'error'); // <<<<<< 移除此行
                break;
        }
    });

    // 事件监听器
    browsePathButton.addEventListener('click', () => {
        vscode.postMessage({
            command: 'browseInstallPath'
        });
    });

    sdkSourceSelect.addEventListener('change', fetchAndDisplayOptions);

    downloadTypeSelect.addEventListener('change', fetchAndDisplayOptions);

    installSdkButton.addEventListener('click', () => {
        const source = sdkSourceSelect.value;
        const installPath = installPathInput.value;
        const downloadType = downloadTypeSelect.value;

        let selectedName = '';
        let typeParam = '';

        if (downloadType === 'release') {
            selectedName = sdkVersionSelect.value;
            typeParam = 'tag';
        } else {
            selectedName = sdkBranchSelect.value;
            typeParam = 'branch';
        }

        if (!selectedName) {
            // log(`请选择一个 SDK ${downloadType === 'release' ? '版本' : '分支'}。`, 'error'); // <<<<<< 移除此行，使用 VS Code 弹窗提示
            vscode.window.showErrorMessage(`请选择一个 SDK ${downloadType === 'release' ? '版本' : '分支'}。`); // 使用 VS Code 弹窗
            return;
        }
        if (!installPath) {
            // log('请选择 SDK 的安装路径。', 'error'); // <<<<<< 移除此行，使用 VS Code 弹窗提示
            vscode.window.showErrorMessage('请选择 SDK 的安装路径。'); // 使用 VS Code 弹窗
            return;
        }

        installSdkButton.disabled = true;
        // log('开始发送安装请求...', 'info'); // <<<<<< 移除此行
        vscode.postMessage({
            command: 'startSdkInstallation',
            source: source,
            type: typeParam,
            name: selectedName,
            installPath: installPath
        });
    });

    fetchAndDisplayOptions();

})();