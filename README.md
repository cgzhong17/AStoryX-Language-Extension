# AStoryX Language Tools

AStoryX 剧本的 VS Code 编辑辅助工具，提供规则驱动补全、静态检查与 ASER 调试启动。

语言参考：[ASER 知识库与参数文档](https://www.yuque.com/tsingyayin/aser)。

## 仓库结构

README 位于仓库根目录，其他内容按用途归档：

```text
AstoryX Language Extension/
├─ README.md     项目介绍与使用说明
├─ CHANGELOG.md  版本更新记录
├─ LICENSE       MIT 许可证
├─ .vscode/      F5 调试和构建任务
├─ src/          TypeScript 源码
├─ test/         测试、夹具、临时文件和独立配置
├─ log/          host/ 宿主日志、results/ 测试结果
├─ docs/         ERROR_MESSAGES.md 错误码与提示消息表
├─ extension/    扩展清单、依赖、运行资源和编译输出
├─ examples/     开发示例项目
├─ config/       共享 TypeScript 配置
├─ tools/        构建、打包和宿主测试脚本
└─ dist/         VSIX 安装包
```

扩展根目录为 `extension`，其 `package.json` 是 VS Code 使用的清单。公开文档为根目录 README、[更新记录](CHANGELOG.md) 和 [错误码与提示消息表](docs/ERROR_MESSAGES.md)，编译时自动复制到扩展目录用于打包。许可文件位于 `LICENSE`；`dist` 中的 VSIX 纳入版本管理，生成副本、依赖和日志由 `.gitignore` 排除。

## 安装和开始使用

需要 VS Code 1.96 或更新版本，可选择以下任一安装方式：

1. **扩展市场安装**：在 VS Code 扩展面板搜索 **AStoryX Language Tools** 并安装，也可搜索 `@id:cgzhong17.astoryx-language-tools` 精确定位。
2. **VSIX 安装**：下载本仓库 [dist](dist) 中的最新 VSIX，在扩展面板点击右上角 `…` → **从 VSIX 安装…**，选择下载的安装包。

安装后打开包含 `Stories`、`Rules` 和 `Resources` 的 ASER 项目，或直接打开项目内的 `.astoryx` 文件。第二行使用 `#useRule:BaseRule` 或项目实际规则名，规则从项目的 `Rules` 目录读取。

编辑时提供补全、参数提示、悬停说明和错误波浪线；按 `Ctrl+Space` 手动补全，按 `Ctrl+Shift+Space` 查看参数提示。右上角 ▶ 启动 ASER 调试；点击状态栏或执行 **AStoryX: 检查项目**，扫描项目内的全部剧本。

检查结果在 Problems 面板（`Ctrl+Shift+M`）显示，详细日志通过 **AStoryX: 查看检查日志** 打开。

`examples/demo` 是官方演示项目，F5 默认打开 `Stories/00_基础示例上.astoryx`。`test/fixtures/language-demo` 提供 BaseRule/AdvanceRule 测试素材。

demo 用于本地 F5 调试，`examples` 和 `test` 均排除在 VSIX 安装包之外。

## 新建项目

在VS Code资源管理器中右键目录，选择 **AStoryX: 新建 AStoryX 项目**，输入项目名称；也可以从命令面板执行，先选择存放目录。扩展会新建同名文件夹并生成：

```text
项目名/
├─ .vscode/
│  └─ settings.json
├─ Configs/
├─ Resources/
│  ├─ Background/
│  ├─ Char_Picture/
│  ├─ Char_Spine/
│  ├─ Music/
│  ├─ SoundEffect/
│  └─ VisualEffect/
├─ Rules/
│  ├─ BaseRule.json
│  └─ AdvanceRule.json
└─ Stories/
   └─ main.astoryx
```

入口剧本使用下方模板，创建后自动打开。项目自动生成 `.vscode/settings.json`，对 AStoryX 关闭空格缩进与缩进检测；在 VS Code 中打开该项目文件夹后，Tab 使用真实制表符。资源与配置目录初始为空，含用于保留目录的 `.gitkeep`。已有同名文件夹（包括空文件夹）或文件时会阻止创建。完成提示中可选择在新窗口打开项目。

项目所需的两份规则位于扩展的 `templates/project/Rules`，随 VSIX 分发，安装到其他电脑后同样可用。

## 新建剧本

在 VS Code 资源管理器中右键文件夹或文件，选择 **AStoryX: 新建 AStoryX 文件**，输入文件名即可。省略后缀时自动补上 `.astoryx`；右键文件时在其所在目录创建。同名文件不会被覆盖。也可以从命令面板执行此命令。

新文件会保存并自动打开，初始内容为：

```text
由VSCode Extension编辑
#useRule:BaseRule
#version:2

#aliases
#endaliases
```

## 功能

- 按项目规则识别全部 21 类控制器，支持自定义行首、参数顺序和前缀。
- 提供控制器、预处理器、规则名、参数、标记、变量及资源候选。
- 支持 BaseRule 顺序参数与 AdvanceRule 命名参数。
- 提供参数说明、悬停、动态配色和参数名内联提示。
- 读取官方资源配置，提供角色名与差分候选。
- 支持标记跳转、文块候选和参数签名。
- 识别保护文段，支持 VS Code 构建任务。
- 支持 ASER 调试启动：右上角 ▶ 加载当前项目并播放当前剧本，运行时可点击 ■ 停止。

项目 `Configs/override_userConfigs.json` 和 `Configs/override_aliases.json` 按资源条目覆盖原配置，未指定的条目继续保留。

### 静态检查

支持未保存文档的实时检查和全项目手动检查。错误使用红色波浪线，警告使用黄色波浪线；Problems 面板显示原因与位置，修复后自动更新。

- **语法检查**：参数缺失、重复、未知，类型或范围不符，以及表达式不合法时报告错误；规则无法识别的语句或解析模式配置不一致时报告警告。
- **路径检查**：项目、规则或资源配置不可用，或引用的资源不存在时报告错误。资源按类别查找本地目录及子目录，再匹配官方收录和配置别名；支持资源包的 manifest 清单。
- **别名检查**：人物别名既未收录也未提前声明，或别名区块未闭合、顺序错误、嵌套、格式不合法、重复指定时报告警告；循环引用或来源资源不存在时报告错误。人物名中的富文本标签不参与别名匹配，多人发言逐个检查。
- **差分检查**：已收录角色引用不存在的差分，或原始 ID 的差分资料不完整时报告警告。
- **标记与文块检查**：重复定义、引用目标不存在，或文块定义及调用不合法时报告错误。
- **写作规范检查**：对话用空格代替 Tab，或角色与差分之间误用中文冒号时报告警告。
- **字数检查**：正文超过 60 个可见字符时报告警告，并标记整行。

对话中的人物和台词仍使用真实 Tab。扩展不全局改绑 Tab；补全框打开时按原生行为接受候选，片段中跳转占位符，普通编辑时输入制表符。提供 `dialog` / `duihua` 对话片段。语言默认关闭空格缩进，但显式的用户设置优先；请勿将人物与台词之间的 Tab 转换为空格。

## 人物、对话与旁白配色

根据项目规则区分人物名、对话正文、角色声明、控制器和旁白。默认深色主题中，人物名为蓝色、对话正文为橙色，角色声明和控制器行首为黄色；旁白与普通参数跟随主题前景色，布尔参数保留关键字配色。

支持自定义规则、实时编辑及深色、浅色和高对比主题切换。可通过 `astoryx.highlighting.enabled` 开关配色，通过 `workbench.colorCustomizations` 自定义颜色。

AStoryX 默认关闭全角标点的 Unicode 歧义字符提醒。`.astoryx` 文件默认使用真实 Tab，并关闭自动缩进检测；新建项目会生成相应设置。BaseRule 中，人物名与台词使用真实 Tab 分隔。

## 启动 ASER 调试

打开项目内的剧本，点击编辑器右上角 ▶。首次使用时选择 `ASE-Remake.exe`，扩展会保存路径；随后按 YSS 的方式启动 ASER、加载当前项目并播放当前剧本。运行期间点击 ■ 停止，剧情退出后关闭本次启动的 ASER。

启动前保存当前项目内已打开且修改过的剧本与 JSON 配置。可在设置中修改 `astoryx.aser.executablePath` 和窗口大小 `astoryx.aser.windowSize`；窗口默认 1280×720。此功能使用 Windows 调试管道。

## 项目布局与设置

```text
MyProject/
  Configs/
  Stories/
    main.astoryx
  Rules/
    BaseRule.json
    AdvanceRule.json
  Resources/
    Background/
    Char_Picture/
    Char_Spine/
    Music/
    SoundEffect/
    VisualEffect/
```

打开的工作区可以是多个项目的上级目录；编辑文件时从其所在位置向上查找项目。全项目检查只扫描选中项目的 Stories，不扫描整个游戏安装目录。

若自动识别不适用，可在工作区设置中指定：

```json
{
  "astoryx.projectRoot": "./MyProject",
  "astoryx.validation.enabled": true,
  "astoryx.validation.delay": 350,
  "astoryx.validation.resourceChecks": true,
  "astoryx.validation.maxLineLength": 60,
  "astoryx.validation.maxFiles": 5000
}
```

`projectRoot` 支持绝对路径或相对工作区的路径。规则修改或未保存规则编辑会重新分析已打开的剧本。找不到规则、JSON 无效或前缀存在无法可靠解析的重叠时会明确报错，不静默回退 BaseRule。

手动检查启动前会保存当前项目内打开的剧本和 JSON 文件；保存失败时停止检查。检查过程中再修改文件会让该次结果过期。

## Ctrl+Shift+B 构建任务

在项目 `.vscode/tasks.json` 添加：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AStoryX: 检查项目",
      "type": "astoryx",
      "group": { "kind": "build", "isDefault": true },
      "problemMatcher": []
    }
  ]
}
```

项目不是工作区根目录时，任务中可以添加 `"project": "./MyProject"`。诊断由扩展直接写入 Problems 面板，不需要输出正则匹配器。退出码 0 表示范围内检查完成且无错误，1 表示语言错误，2 表示工具失败、取消或检查不完整。

构建任务遵循 VS Code 的工作区信任要求；受限模式下可使用编辑功能和静态检查。

## 状态与当前限制

- `✓ Complete`：项目基础检查完成，无错误、警告或已识别的覆盖缺口。绿色勾号使用主题的测试通过颜色。
- `N 个错误` / `N 个警告`：查看 Problems 面板或检查日志。
- `检查不完整`：存在尚未展开的置换文块、不支持的预处理器/语义资料、文件数超限、资源尚未验证或结果过期。
- `检查失败`：规则、文件或项目加载失败。
- 编辑后显示“未检查”，表示原来的全项目结论已过期。

Complete 的范围是基础静态检查。它不证明演出效果正确，也不验证官方资源连接、完整 TMP 富文本语义或分支运行结果。

## 参数名内联提示

在参数值旁显示参数名称，帮助识别参数含义与顺序，并随项目规则和编辑内容实时更新。提示不会写入剧本，默认开启，可通过 `astoryx.inlayHints.enabled` 开关。

## 开发

| 位置 | 用途 |
| --- | --- |
| `src/extension.ts` | VS Code 功能与命令接入 |
| `src/core.ts`、`src/project.ts` | 语法解析、项目与规则读取 |
| `src/aliases.ts`、`src/writing-checks.ts`、`src/rich-text.ts` | 别名、富文本人物名与写作规范检查 |
| `src/resources.ts`、`src/official-assets.ts` | 本地资源索引与官方配置读取 |
| `src/aser-runner.ts` | ASER 启动、管道播放与停止 |
| `src/diagnostic-codes.ts` | 错误码和消息模板；修改后同步[错误消息表](docs/ERROR_MESSAGES.md) |
| `src/highlighting.ts`、`src/inlay-hints.ts` | 配色与参数名内联提示 |
| `src/new-*.ts`、`src/*-template.ts` | 新建文件、项目及模板生成 |
| `test/` | 单元测试、宿主验证与测试素材 |
| `config/tsconfig.json`、`tools/` | 编译配置及构建、测试、打包脚本 |

在仓库根目录执行依赖安装、测试和打包：

```sh
npm --prefix extension ci
npm --prefix extension test
npm --prefix extension run package
```

打开仓库根目录按 F5 调试。编译输出位于 `extension/out/`，安装包位于 `dist/`，测试日志与结果位于 `log/`。

## 许可

扩展实现采用 [MIT 许可](LICENSE)。本地规则文件为用户提供的 ASER 配置示例，其原始归属不因本扩展而改变；未打包游戏图片或音频。
