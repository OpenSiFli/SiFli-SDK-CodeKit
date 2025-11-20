---
title: 快速入门
icon: lightbulb
---

## 适用于 VS Code 的 SiFli-SDK-CodeKit 扩展
SiFli-SDK-CodeKit 是一款用于简化 SiFli-SDK 项目开发的 Visual Studio Code 插件。它提供了基于SiFli SDK的一系列便捷的操作入口，帮助用户高效完成项目管理、编译、下载及配置等工作。

## 功能

- **自动识别 SiFli 工程**
- **状态栏功能按钮**
  - SDK管理器入口
  - SDK版本切换
  - 选择开发芯片模组与编译线程数
  - 选择串口设备
  - 编译
  - 清除并重新编译
  - 清理构建产物
  - 烧录下载
  - 进入menuconfig设置界面
  - 串口监视器
- **串口自动识别机制**
  - 自动检测串口设备
  - 单个设备自动选择
  - 多设备弹窗选择
  - 无设备提示用户
- **SDK管理器**
  - 新增SDK管理器，实现SDK和工具链的一键下载，通过SDK管理器下载的SDK无需额外配置终端地址和SDK脚本路径
  - 增加SDK版本切换功能，点击即可迅速完成不同SDK版本之间的切换

- **对自定义板子的指令支持**
  - 在与project同级目录下创建boards存放板子，插件可自动识别，点击SiFli Board即可切换
  - 对于在其他路径(非SDK\customer\boards，非project同级目录下的boards)，在设备中搜索`Sifli-sdk-codekit: Custom Board Search Path`填入板子路径即可完成


