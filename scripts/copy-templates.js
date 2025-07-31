const fs = require('fs');
const path = require('path');

// 获取项目根目录
const projectRoot = path.join(__dirname, '..');

// 确保目标目录存在
const targetDir = path.join(projectRoot, 'out', 'providers', 'templates');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 复制模板文件
const sourceDir = path.join(projectRoot, 'src', 'providers', 'templates');

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const files = fs.readdirSync(sourceDir);

files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${file} to ${targetPath}`);
});

console.log('Templates copied successfully!');
