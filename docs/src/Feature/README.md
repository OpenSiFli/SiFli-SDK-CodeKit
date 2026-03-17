---
title: 进阶功能
icon: fa-solid fa-wrench
---

## SDK 依赖源码浏览

在 VS Code 的**资源管理器**侧边栏中，CodeKit 会新增一个 `SDK 依赖源码` 视图，用来快速查看当前工程实际依赖到的 SDK 文件。

这个视图会直接按目录树显示依赖文件，不再区分“源文件”和“头文件”。整体体验尽量贴近 VS Code 原生资源管理器：

- 按 `main`、`main.bootloader`、`main.ftab` 三个工程分组展示
- 工程下直接按真实 SDK 文件路径展开目录树
- 点击文件即可直接打开对应的 SDK 源码
- 当你切换到某个 SDK 文件标签页时，视图会自动展开并定位到对应路径

### 数据来源

依赖关系来自当前板卡构建目录下生成的 `codebase_index.json`：

```text
project/build_<board>_hcpu/codebase_index.json
```

如果 `codebase_index.json` 中保存的是旧机器上的 SDK 绝对路径，CodeKit 会自动尝试映射到当前已激活 SDK 的真实路径。

### 索引生成

CodeKit 支持两种方式生成 `codebase_index.json`：

1. 在命令面板或视图标题栏中执行 `Generate codebase_index.json`
2. 手动在工程终端中执行：

```bash
scons --board=<board> --target=json
```

### 自动重建触发时机

为了尽量减少手工操作，CodeKit 会在以下情况下自动尝试重建 `codebase_index.json`：

- 当前板卡对应的 `codebase_index.json` 不存在
- 当前 `codebase_index.json` 解析失败或读取失败
- `compile_commands.json` 比 `codebase_index.json` 更新，说明构建信息已经变化，索引可能过期

以下操作会触发这套自动检查：

- 切换板卡
- 切换 SDK
- 打开或显示 `SDK 依赖源码` 视图
- 手动点击视图刷新
- `codebase_index.json` 或 `compile_commands.json` 被创建、修改或删除

### 使用建议

- 第一次使用时，建议先完成一次正常编译，确保构建目录和 `compile_commands.json` 已生成
- 如果依赖视图为空，可以先手动执行一次 `Generate codebase_index.json`
- 如果某些文件无法映射到当前 SDK，会显示在 `Unresolved` 分组中，通常意味着当前 SDK 版本与生成索引时使用的 SDK 差异较大
