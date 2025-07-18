// media/sdk_manager.js
(function() {
    const vscode = acquireVsCodeApi();

    const sdkSourceSelect = document.getElementById('sdkSource');
    const sdkVersionSelect = document.getElementById('sdkVersion');
    const manualVersionInput = document.getElementById('manualVersion');
    const installPathInput = document.getElementById('installPath');
    const browsePathButton = document.getElementById('browsePath');
    const installSdkButton = document.getElementById('installSdk');
    const logContainer = document.getElementById('logContainer');

    let availableReleases = [];

    function log(message, level = 'info') {
        const p = document.createElement('p');
        p.className = `log-${level}`;
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight; // 滚动到底部
    }

    // 初始化：获取并显示 SDK 版本
    function fetchAndDisplayReleases() {
        log('正在从服务器获取 SDK 发布版本...', 'info');
        sdkVersionSelect.innerHTML = '<option value="">正在加载版本...</option>';
        sdkVersionSelect.disabled = true;
        vscode.postMessage({
            command: 'fetchReleases',
            source: sdkSourceSelect.value
        });
    }

    // 处理来自扩展程序的消息
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'installPathSelected':
                installPathInput.value = message.path;
                log(`已选择安装路径: ${message.path}`, 'info');
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
                log('SDK 发布版本加载完成。', 'info');
                if (availableReleases.length > 0) {
                    sdkVersionSelect.value = availableReleases[0].tagName; // 默认选择最新版本
                }
                break;
            case 'logMessage':
                log(message.message, message.level);
                break;
            case 'installationComplete':
                installSdkButton.disabled = false;
                log('SDK 安装流程已完成。', 'info');
                break;
            case 'installationError':
                installSdkButton.disabled = false;
                log(`SDK 安装失败: ${message.error}`, 'error');
                break;
        }
    });

    // 事件监听器
    browsePathButton.addEventListener('click', () => {
        vscode.postMessage({
            command: 'browseInstallPath'
        });
    });

    sdkSourceSelect.addEventListener('change', fetchAndDisplayReleases);

    manualVersionInput.addEventListener('input', () => {
        // 如果手动输入了版本，禁用选择框
        sdkVersionSelect.disabled = manualVersionInput.value !== '';
        if (manualVersionInput.value !== '') {
            sdkVersionSelect.value = ''; // 清空选择框的选择
        }
    });

    sdkVersionSelect.addEventListener('change', () => {
        // 如果从选择框选择了版本，清空手动输入框
        if (sdkVersionSelect.value !== '') {
            manualVersionInput.value = '';
        }
    });


    installSdkButton.addEventListener('click', () => {
        let version = sdkVersionSelect.value;
        if (manualVersionInput.value) {
            version = manualVersionInput.value;
        }

        const source = sdkSourceSelect.value;
        const installPath = installPathInput.value;

        if (!version) {
            log('请选择或输入一个 SDK 版本。', 'error');
            return;
        }
        if (!installPath) {
            log('请选择 SDK 的安装路径。', 'error');
            return;
        }

        installSdkButton.disabled = true;
        log('开始发送安装请求...', 'info');
        vscode.postMessage({
            command: 'startSdkInstallation',
            source: source,
            version: version,
            installPath: installPath
        });
    });

    // 页面加载完成后立即获取版本信息
    fetchAndDisplayReleases();

    // 尝试从 VS Code 的状态中恢复安装路径，如果用户之前设置过
    // 这需要你在扩展程序保存 WebView 状态时进行设置
    // const previousState = vscode.getState();
    // if (previousState && previousState.installPath) {
    //     installPathInput.value = previousState.installPath;
    // }

    // 每次更新 UI 时保存状态，例如当 installPathInput.value 改变时
    // installPathInput.addEventListener('change', () => {
    //     vscode.setState({ installPath: installPathInput.value });
    // });

})();