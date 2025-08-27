#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const EXTENSIONS_DIR = path.join(__dirname, '..', '.debug-extensions');
const REQUIRED_EXTENSIONS = [
    'eclipse-cdt.serial-monitor'
];

async function setupDebugExtensions() {
    // 确保扩展目录存在
    if (!fs.existsSync(EXTENSIONS_DIR)) {
        fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
    }

    // 安装每个必需的扩展
    for (const extensionId of REQUIRED_EXTENSIONS) {
        try {
            console.log(`install extension: ${extensionId}`);
            const command = `code --extensions-dir "${EXTENSIONS_DIR}" --install-extension ${extensionId}`;
            const { stdout, stderr } = await execPromise(command);
            
            if (stderr && !stderr.includes('successfully installed')) {
                console.warn(`error: ${stderr}`);
            }
            console.log(`install ${extensionId} success`);
        } catch (error) {
            console.error(`install ${extensionId} error:`, error.message);
        }
    }
}

// 运行脚本
if (require.main === module) {
    setupDebugExtensions().catch(console.error);
}

module.exports = { setupDebugExtensions };
