# One Step for SiFli - VS Code 扩展

旨在简化`SiFli-SDK`的开发工作。提供了多个按钮选项，实现编译、下载、清除、编译并下载、重新编译以及进入 menuconfig 等多种功能。能够根据用户打开的工程文件来判断是否激活功能，在运行按钮选项前会自动保存当前文件，并且支持根据不同用户的终端与脚本安装路径进行配置。

## 当前目录结构

    ```
    one_step_for_sifli

    +---.vscode
    |   |
    |   +---launch.json                     // VS Code 调试配置文件。
    |
    +---images
    |   |
    |   +---vsix_install.png
    |   |     
    |   +---open_setting.png
    |   | 
    |   +---config_path.png
    |   |
    |   +---download.png
    |
    +---extension.js                        // 扩展的主入口文件。
    |
    +---package.json                        // 扩展的清单文件。
    |
    +---one-step-for-sifli-1.0.0.vsix *     // 打包后的 VS Code 扩展文件。
    |
    +---LICENSE.txt                         // 许可证文件。
    |
    +---README.md                           // 项目的说明文档。
    ```

## 功能特性

* **SiFli 工程检测：** 扩展程序会自动检测当前工作区是否为 SiFli 工程。判断依据是工作区根目录下是否存在 `src/SConscript` 文件。
* **一键编译：** 点击状态栏上的“Build”按钮（🛠️ Build）即可编译您的 SiFli 项目。
* **一键下载：** 使用状态栏上的“Download”按钮（💾 Download）即可将编译好的 SiFli 项目下载到您的设备。
* **清理构建产物：** 通过状态栏上的“Clean”按钮（🗑️ Clean），可以删除特定构建目标文件夹 `build_sf32lb52-lchspi-ulp_hcpu`，清理构建输出。
* **重新构建功能：** 使用状态栏上的“Rebuild”按钮（♻️ Rebuild）可以先执行清理操作，然后进行编译。
* **编译并下载：** 使用状态栏上的“Build & Download”按钮（🚀 Build & Download）可以编译您的项目，然后自动启动下载过程。
* **Menuconfig 访问：** 通过状态栏上的“Menuconfig”按钮（⚙️ Menuconfig）打开`SiFli-SDK`的 menuconfig 界面。
* **自动保存文件：** 在执行编译或下载任务之前，所有未保存的文件都会自动保存，以确保您使用的是最新的代码。
* **可配置路径：** 您可以通过 VS Code 设置自定义 PowerShell 可执行文件和`SiFli-SDK`的 `export.ps1` 脚本的路径。

## 入门指南

### 安装

1.  打开 VS Code。
2.  进入扩展视图（快捷键 `Ctrl+Shift+X` 或 `Cmd+Shift+X`）。
3.  点击界面右方的三个点`...`，在弹出的选项卡中选择从VSIX安装。
4.  在弹出的界面中填入`.vsix`文件的下载地址，选中`.vsix`文件安装即可。
5.  ![如何安装插件截图](images\vsix_install.png)
### 配置

在使用扩展之前，您需要配置关于下载`SiFli-SDK`所配置的 PowerShell 可执行文件地址和`SiFli-SDK`的 `export.ps1` 脚本的路径。

1.  打开 VS Code 设置：
    * Windows/Linux: `文件` > `首选项` > `设置`
    * ![如何打开设置截图](images\open_setting.png)
2.  在设置搜索框中输入“One Step for SiFli”，或者导航到“扩展”并找到“One Step for SiFli Configuration”。
3.  **PowerShell 路径 (`one-step-for-sifli.powershellPath`)：**
    * 输入您的 PowerShell 可执行文件的完整路径。
    * 在 Windows 系统上，默认路径通常是 `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`。
4.  **SiFli SDK 导出脚本路径 (`one-step-for-sifli.sifliSdkExportScriptPath`)：**
    * 输入位于您的`SiFli-SDK`安装目录中的 `export.ps1` 脚本的完整路径（例如，`D:\OpenSiFli\SiFli-SDK\export.ps1`）。
    * 此脚本对于设置`SiFli-SDK`命令的正确环境至关重要。
    * ![如何填写SF32终端和export.ps1脚本路径截图](images\config_path.png)
### 使用

一旦配置完成并打开一个 SiFli 工程（即工作区根目录下存在 `src/SConscript` 文件），状态栏上将显示扩展的功能按钮：

* **🛠️ Build：** 编译项目。
* **♻️ Rebuild：** 清理并重新编译项目。
* **🗑️ Clean：** 清理构建产物。
* **💾 Download：** 下载已编译的项目到设备。
* **🚀 Build & Download：** 编译项目并自动下载。
* **⚙️ Menuconfig：** 进入`SiFli-SDK`的配置界面。

点击这些按钮即可执行相应的操作。所有命令的执行情况会在 VS Code 的终端中显示。

## 常见问题

* **问：为什么我安装了扩展却没有看到状态栏按钮？**
    * 答：请确保您打开的工作区是一个 SiFli 工程。扩展会检查工作区根目录下是否存在 `src/SConscript` 文件。如果不是 SiFli 工程，扩展功能将不会被激活。
* **问：我的命令执行失败了，终端显示错误怎么办？**
    * 答：请检查您的扩展设置中的 PowerShell 路径和`SiFli-SDK`导出脚本路径是否正确。确保这些路径指向的文件真实存在且可执行。同时，检查`SiFli-SDK`环境是否已正确配置，以及命令是否在正确的项目目录下执行。
* **问：为什么终端打开后没有自动切换到 `project` 目录？**
    * 答：请确保您的工作区根目录下存在一个名为 `project` 的文件夹。扩展会尝试 `cd` 到这个子文件夹来执行命令。

---