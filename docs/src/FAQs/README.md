---
title: 常见问题
icon: fa-solid fa-wrench
---

## 常见问题

### 为什么插件没有激活？

- 请确认项目根目录是否存在 `src/SConscript` 文件。

### 命令执行失败怎么办？
- 检查 PowerShell 路径、SDK 脚本路径是否正确。
- 确认 SDK 环境和依赖（如 scons、sftool）是否正常。

### 终端没有自动进入 project 文件夹？
- 请确保根目录中存在名为 `project` 的子文件夹。

### 串口设备未识别？

- 打开设备管理器，检查串口驱动、连接状态、PowerShell 执行权限。

### 出现类似`无法加载文件 D:\SiFli\SiFli-SDK\export.ps1，因为在此系统上禁止运行脚本`的错误

点击菜单栏中的`终端` -> `新建终端`，在打开的终端中输入以下命令并回车：

```powershell
Set-ExecutionPolicy RemoteSigned
```

然后选择`A`（全部）并回车。之后重启 VSCode 即可。

### 还有其他未知问题？

- 欢迎提交 issue，这对插件的后续开发很有帮助：[GitHub 仓库](https://github.com/OpenSiFli/SiFli-SDK-CodeKit)
