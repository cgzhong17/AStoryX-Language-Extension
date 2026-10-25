# AStoryX Language Tools

AStoryX 剧本的 VS Code 编辑辅助工具

## 仓库结构

README 位于仓库根目录，其他内容按用途归档：

```text
YSS-VSCode-Extension/
├─ README.md     项目介绍与使用说明
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

扩展根目录为 `extension`，其 `package.json` 是 VS Code 使用的清单。公开文档为根目录 README 和 [错误码与提示消息表](docs/ERROR_MESSAGES.md)，编译时自动复制到扩展目录用于打包。许可文件位于 `LICENSE`；生成副本、依赖和日志均由 `.gitignore` 排除。

## 安装和开始使用

1. VS Code 需要 1.96 或更新版本。
2. 打开扩展面板，点击右上角 `…` → **从 VSIX 安装…**，选择 `dist` 目录生成的 `astoryx-language-tools-0.1.0.vsix`。
3. 打开你的 ASER 项目目录，建议目录中同时有 `Stories`、`Rules` 和 `Resources`。也可以直接打开项目中的 `.astoryx` 文件。
4. 确认第二行是 `#useRule:BaseRule` 或项目实际使用的规则名。规则来自该项目的 `Rules/规则名.json`，不会用内置版本覆盖。
5. 编辑文件时会出现候选、参数提示、悬停说明和错误波浪线。按 `Ctrl+Space` 手动打开候选，按 `Ctrl+Shift+Space` 手动打开参数提示。
6. 点击编辑器右上角 ▶，或执行 **AStoryX: 检查项目**，扫描项目 `Stories` 下全部 `.astoryx`。

右上角按钮只执行基础静态检查，不播放或实际运行剧情。发现问题后，在 Problems 面板（`Ctrl+Shift+M`）点击对应条目跳转到行列；详细日志通过 **AStoryX: 查看检查日志** 打开。

`examples/demo` 是 F5 调试示例项目，入口为 `Stories/main.astoryx`。`test/fixtures/language-demo` 提供 BaseRule/AdvanceRule 测试素材。

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
由VSCode Extention编辑
#useRule:BaseRule
#version:2

#aliases
#endaliases
```

## 第一版功能

- 按项目规则识别全部 21 类控制器，支持修改过的行首、参数顺序和前缀。
- 控制器候选可按中文或英文 ID 检索；支持预处理器、规则名、布尔值、曲线候选、命名参数、标记、变量和部分本地资源候选。
- BaseRule 的顺序参数、连续斜杠省略和 AdvanceRule 的命名参数乱序。
- 参数提示、中文说明、参数类型、默认值说明、悬停及动态语法着色；参数值前默认显示 Java 风格的参数名内联提示。
- 当前文档实时检查（包含未保存内容），全项目手动检查。
- Error 以红色波浪线显示，Warning 以黄色波浪线显示，Problems 面板提供 E/W 错误码及定位；修复后自动更新。
- 资源引用不存在时报告 E2001；对话名字既未在 userConfigs 收录、也未在使用前声明时报告 W1001；已知人物名后用空格代替 Tab 报告 W1003，并提供局部快速修复。W1002 正文字数检查默认以 60 个可见字符为阈值，超出时提示显示效果可能会受到影响。
- 自动接入官方 collections/aliases/userConfigs：角色差分候选取 `variationNames` 的值，差分不存在报 W1004，原始 ID 差分未收录报 W1005；映射为剧本别名后仍保留相同检查。
- 检查有限数字、整数、布尔值、已核实范围及向量维度；支持表达式括号、四则运算和随机运算语法。
- 检查当前文件标记引用和重复标记，支持跳转到分支目标。
- 检查别名和置换文块的区块结构、文块引用及实参数量，支持文块候选和签名。
- 别名区块未闭合、结束标记在前或嵌套时报 W1007；映射及标记格式错误报 W1008；后续重复指定右侧别名时报 W1009。均以黄色波浪线标记对应整行。
- 识别 `&{...}` 保护文段，避免其中的斜杠和富文本结束标签被误当作参数。
- 通过 VS Code Task Provider 提供构建任务，无需外部脚本。

对话中的人物和台词仍使用真实 Tab。扩展不全局改绑 Tab；补全框打开时按原生行为接受候选，片段中跳转占位符，普通编辑时输入制表符。提供 `dialog` / `duihua` 对话片段。语言默认关闭空格缩进，但显式的用户设置优先；请勿将人物与台词之间的 Tab 转换为空格。

## 人物、对话与旁白配色

默认深色主题中，人物名为蓝色（`#569CD6`），有名人物的台词为橙色（`#CE9178`）。例如 `凯尔希<Tab>你好` 的“凯尔希”是蓝色，“你好”是橙色，其中 `<Tab>` 表示真实制表符。

`--mon3tr:疑惑/1` 中，`--mon3tr:疑惑` 为黄色（默认深色主题 `#DCDCAA`），与 `背景：` 等控制器行首共用颜色；`/1` 使用主题正文前景色。角色、对话和旁白的其他可选参数采用主题前景色，但布尔参数 `true` / `false` 保留主题关键字配色，默认深色主题中呈紫色。台词中的普通单词 true/false 仍属于台词，不作为布尔参数染色。无人物名的普通文本、`自由文本：...` 和 `*旁白` 使用主题前景色；默认深色主题中呈白色或浅灰色。

颜色依据当前项目的控制器、首项内部分隔符和可选参数前缀计算，支持自定义规则和 `&{...}`。注释和预处理器保留原有语法配色。悬停说明和参数提示仅显示当前规则名；诊断不附加规则文件链接，避免在错误提示上方重复显示规则。

切换深色、浅色或高对比主题时，配色自动更新。浅色主题使用更深的蓝色和橙色，旁白和参数跟随主题文字颜色，避免白字落在浅色背景上。配色独立于即时诊断开关；可通过 `astoryx.highlighting.enabled` 单独关闭。

可以在 VS Code 的 `workbench.colorCustomizations` 中修改以下颜色；也支持 `[主题名称]` 下的单主题覆盖，无需修改全局语法颜色：

```json
{
  "workbench.colorCustomizations": {
    "astoryx.speakerForeground": "#569CD6",
    "astoryx.dialogueForeground": "#CE9178",
    "astoryx.characterForeground": "#DCDCAA",
    "astoryx.narrationForeground": "#D4D4D4",
    "astoryx.parameterForeground": "#D4D4D4"
  }
}
```

以上是深色主题示例；保留默认值即可自动适配其他主题。`astoryx.characterForeground` 同时控制角色图片声明主体和一般控制器行首，使两者同步；对话人物名仍为蓝色。旁白与普通参数默认跟随 `editor.foreground`，布尔参数保留主题语法颜色。

AStoryX 默认关闭 VS Code 对中文全角标点的 Unicode 歧义字符黄色边框及提示（`editor.unicodeHighlight.ambiguousCharacters: false`）。参数说明和实际错误诊断的提示仍保留。若用户或工作区显式覆盖此设置，以显式设置为准。

安装扩展后，`.astoryx` 文件默认使用真实 Tab。新建项目还会写入以下项目设置；已有项目也可将其合并到 `.vscode/settings.json`，只针对 AStoryX 生效：

```json
{
  "[astoryx]": {
    "editor.insertSpaces": false,
    "editor.detectIndentation": false
  }
}
```

BaseRule 中，人物名和台词之间必须是真实 **Tab**，例如 `凯尔希〈Tab〉你好`。`凯尔希  你好` 使用空格，或只输入 `凯尔希`，都属于旁白，显示为主题前景色。选择人物候选后，如需继续写台词，再按一次 Tab 插入分隔符。扩展默认关闭本语言的缩进检测，并设置 `editor.insertSpaces: false`，避免 VS Code 根据文件缩进把 Tab 自动改成空格；用户显式覆盖这些设置时以用户设置为准。已输入的空格不会自动转换。

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

构建任务遵循 VS Code 的工作区信任要求；受限模式下可先使用编辑功能和扩展自己的检查按钮。

## 状态与当前限制

- `✓ Complete`：项目基础检查完成，无错误、警告或已识别的覆盖缺口。绿色勾号使用主题的测试通过颜色。
- `N 个错误` / `N 个警告`：查看 Problems 面板或检查日志。
- `检查不完整`：存在尚未展开的置换文块、不支持的预处理器/语义资料、文件数超限、资源尚未验证或结果过期。
- `检查失败`：规则、文件或项目加载失败。
- 编辑后显示“未检查”，表示原来的全项目结论已过期。

Complete 的范围是基础静态检查。它不证明演出效果正确，也不验证官方资源连接、完整 TMP 富文本语义或分支运行结果。

第一版暂不展开置换文块，因此包含宏的文件会报告覆盖不足；这类文件可能来自宏展开的标记不会被直接判为缺失。变量可以首次使用时自动创建，不报“变量未声明”。同名跨文件标记不视为冲突。

本地资源存在性默认检查。背景、角色、音乐、音效及特效引用在可用来源均不存在时报告 E2001（红色波浪线）；角色需要有效配置或素材，空文件夹不算资源。候选与诊断使用同一资源索引，资源文件增删、角色配置的未保存编辑会触发重新检查。`无` / `none` 仅在支持清空的参数中豁免；无法静态求值的资源名标为未验证。

官方资源现已读取 `officialAssets_collections.json`、`officialAssets_aliases.json` 和 `officialAssets_userConfigs.json`。Windows 默认目录为用户的 `AppData/LocalLow/Gradus/ASE-Remake/Configs`；也可用 `astoryx.resources.officialConfigDirectory` 指定目录。项目 `Configs` 内的同名 aliases/userConfigs 文件优先于全局文件，按整份文件选择。JSON 无效报告 E1003，并停止相关推断，避免连锁误报。可用 `astoryx.resources.officialAssetsEnabled` 单独关闭官方索引。

角色名称采用 userConfigs 的 `name`，差分候选采用对应 `variationNames` 的**值**，例如 `--mon3tr:` 后提示“疑惑”，而非已被重命名的编号 `#5$1`。值本身保留原始编号的项目（如 `#1$2`）仍会出现在候选中。配置已收录的角色使用未列出的差分时，在差分值上显示 W1004“差分不存在”；原始 ID 在 userConfigs 未完整收录时，在角色名上显示 W1005“正在使用原始ID，差分读取不完整，建议使用收录后的别名。userConfigs 未收录 {rawId}”。已完整收录的原始 ID 仍可取得同一份差分候选。

角色名称补全在名字与差分之间插入英文冒号 `:`，不会改变 `背景：` 等其他控制器。手动写成 `--mon3tr：疑惑` 时，仅在中文冒号上报告 W1006，并提供单处替换的快速修复；解析仍识别角色与差分，避免连锁误报缺失资源。

编辑差分时，只有使用正确的英文冒号才显示差分候选；误用中文冒号时，差分候选和该位置的参数签名都不显示，保留 W1006 及修复操作。当前名字或沿 #aliases 找到的上级在 userConfigs 已收录，则只显示对应 variationNames 候选，不叠加完整参数签名窗口。未收录时保留完整参数提示；输入后续 `/` 参数时照常提供签名提示。

`#aliases` 允许 `avg_003_kalts_1->凯尔希`。官方原始 ID（avg_、dyn_、sp_dyn_ 前缀）在 collections 中不存在时，声明左侧报告 E2001；其他来源允许使用有效本地资源名或官方名称，找不到同样在声明处报错。同一声明的多个别名不重复报错。未收录差分的原始 ID 映射为 `凯尔希alts_1` 等剧本别名后，使用该别名也会收到相同 W1005，不会因改名而虚构差分候选。这两类差分诊断都是 Warning，不启用预留的 E2002。

直接使用的角色名先查 userConfigs 的 `name`，命中即为有效别名，不必再写 `#aliases`；未命中时再沿使用位置之前已闭合的 `#aliases` 逐级寻找上级，每一级仍先查 userConfigs。同名脚本别名和本地文件不覆盖已收录名称的差分；循环引用报 E3020。userConfigs 中已有名称即使暂缺 collections 条目也可直接使用，但 `#aliases` 左侧的官方原始 ID 仍必须通过 collections 检查。

本地或官方索引任一命中即可满足普通资源存在性检查。源文件修改（包括工作区之外的官方 JSON）及未保存的项目 JSON 编辑都会刷新候选与诊断。

W1001 先接受 userConfigs 已收录名称，其他名字按使用位置之前已经闭合的 `#aliases` 块检查，不以设置过角色图片代替声明。关闭资源存在性检查也不改变已收录名称的有效性。W1003 仅在能识别人物名边界时提示，不把普通旁白中的空格当成错误。W1002 的 `astoryx.validation.maxLineLength` 默认是 60，超过 60 个可见字符时统一提示“超出60字，显示效果可能会受到影响。”；恰好 60 字不报警；超长文本所在的整行使用黄色波浪线标记，包含该行人物名、控制器和参数，但计数仍只统计正文。对白正文、旁白和自由文本使用同一阈值，人物名、参数及富文本标签不计入；中文字符各计一字，emoji 按可见字素计数。可按项目调整阈值，显式设为 null 可关闭。项目检查摘要注明未启用的检查。

## 参数名内联提示

源码 `--mon3tr:疑惑/1/true` 只在可选参数前显示 `SlotIndex:`、`IsBlocker:` 标签，例如 `SlotIndex: 1`；Character 和 Variant 不参与预览。标签由 VS Code 显示，不写入文件，也不参与复制、保存或解析。名称及位置跟随当前项目 Rules 和未保存编辑实时更新；省略的参数不显示标签，已在源码写出名称的 AdvanceRule 参数不重复标注，普通对白的人物和正文保持原样。

默认启用，可用 `astoryx.inlayHints.enabled` 关闭。预览文字统一为白色，背景继续跟随主题。扩展只为 VS Code 原生 `editorInlayHint.parameterForeground` 提供白色默认值，不修改背景色；该原生颜色也适用于其他语言的参数内联提示，用户显式设置仍优先。如个人设置关闭过内联提示，请检查 AStoryX 的 `editor.inlayHints.enabled` 是否为 `on`。

兼容策略：布尔值接受 true/false 与本地示例中的 0/1；曲线枚举提供候选但不强制拒绝扩展值；别名方向沿用本地示例，暂不校验映射的运行时含义。判断表达式列表按参数文档和示例使用分号。浮点分支边界、嵌套保护语义等尚未对 ASER 运行时作完整验证。

规则加载根据第二行 `#useRule:` 的值分支选择：`BaseRule` 加载项目 BaseRule.json，`AdvanceRule` 加载 AdvanceRule.json，其他名称继续加载同名自定义 JSON。规则不存在沿用 E1002，提示使用相对目录，例如 `在 Rules/ 找不到 MissingRule.json。`，不退回另一份规则。BaseRule 顺序参数按 `/` 解析，AdvanceRule 命名参数按 `,@参数名=` 解析；各控制器仍遵循所加载 JSON 的实际定义。

F5 仍然是 VS Code 的调试入口，本版使用独立的检查按钮和构建任务。

## 开发

```sh
npm --prefix extension ci
npm --prefix extension test
npm --prefix extension run package
```

用 VS Code 打开 `YSS-VSCode-Extension` 仓库根目录，按 F5 启动开发宿主，会打开 `examples/demo` 项目及其 `Stories/main.astoryx`。编译配置位于 `config/tsconfig.json`，输出位于 `extension/out`；安装包输出到 `dist`。核心分析位于 `src/core.ts`，不依赖 VS Code；文件与规则加载位于 `src/project.ts`，编辑器接口位于 `src/extension.ts`。

诊断码、级别及带 `{变量名}` 的提示模板集中定义在 `src/diagnostic-codes.ts`，检测器通过 `createIssue` 传入局部变量与范围。各错误码与消息模板见 [错误码与提示消息表](docs/ERROR_MESSAGES.md)。修改已有提示时编辑 `DIAGNOSTICS` 中对应的 `messages`；模板中的 `{变量名}` 由检测器显式传值。新增检查时还需实现检测条件，并同步更新错误表。模板变量由 TypeScript 检查，`CODES` 自动派生；`test/diagnostic-codes.test.ts` 验证格式化、校验和类型契约。

F5 使用仓库目录下 `test/profiles/development` 的独立开发配置，并暂时禁用已安装的其他扩展，以减少启动冲突。请在标题含 **[Extension Development Host]** 的新窗口观察源码修改；原来的源码窗口可能仍使用已安装的旧版本。开发宿主启动失败时，原窗口不会因此自动加载源码版。编辑器会在每次 F5 前自动编译，修改后可停止并重新按 F5。

`test/core.test.ts` 包含语法、规则隔离和真实示例回归；真实 ASER 示例测试在本地素材目录不存在时跳过。`test/smoke.ts` 可用 VS Code 的 `--extensionDevelopmentPath` 和 `--extensionTestsPath` 在 demo 工作区运行。测试宿主的结果写入 `log/results/smoke-result.json`，不包含在 VSIX 中。

`test/live-highlighting.ts` 在 `test/fixtures/language-demo` 工作区内验证真实编辑事件、`type`/`tab` 命令和撤销重做；它观察实际调用 `setDecorations` 后发出的事件及文档版本，不手动触发刷新。结果写入 `log/results/live-result.json`，临时剧本在测试结束时清理。可将 `--extensionTestsPath` 指向编译后的 `extension/out/test/live-highlighting.js` 运行此组测试。

`test/reporting.test.ts` 检查资源集合、别名声明顺序、空格和字数判定；`test/live-diagnostics.ts` 在独立宿主中验证实际诊断级别和范围、未保存文本、资源热更新、Tab 快速修复、规则错误及项目退出码，结果写入 `log/results/diagnostics-result.json`。

`test/official-assets.test.ts` 检查官方数据适配、差分值、原始身份及别名传播；`test/live-official.ts` 验证实际候选、W1004/W1005/E2001、项目优先级、外部 JSON 热更新和未保存 JSON。结果写入 `log/results/official-result.json`，所有模拟数据在临时目录中清理。

`test/inlay-hints.test.ts` 覆盖参数名、空参数位、命名参数、规则分隔符及 UTF-16 范围；真实宿主测试同时验证 userConfigs 名称优先、别名链、内联提示开关与未保存文本/规则更新。

可以使用统一入口运行宿主测试，日志自动写入 `log`：

```powershell
npm --prefix extension run test:host -- diagnostics --vscode "C:\path\to\Code.exe"
```

将可执行文件路径替换为本机路径；测试组还支持 `highlighting`、`official`、`new-file`、`project-tab` 和 `smoke`。

扩展宿主测试需要信任 demo 工作区。自动测试可以在专用 `--user-data-dir` 下使用 `--disable-workspace-trust`，仅用于仓库内的自建示例，不修改日常编辑器配置。测试结果保存在本地 `log/results/`，宿主输出保存在 `log/host/`。

扩展实现采用 [MIT 许可](LICENSE)。本地规则文件为用户提供的 ASER 配置示例，其原始归属不因本扩展而改变；未打包游戏图片或音频。

全部 Error/Warning 的错误号、提示模板、占位符和启用状态见 [错误码与提示消息表](docs/ERROR_MESSAGES.md)。

语言参考：[ASER 知识库与参数文档](https://www.yuque.com/tsingyayin/aser)。

