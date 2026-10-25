# 错误码与提示消息对照表

根据当前 [diagnostic-codes.ts](../src/diagnostic-codes.ts) 的 `DIAGNOSTICS` 整理，更新日期：2026-10-24。

当前包含 34 个诊断定义、58 个消息场景。W1007、W1008、W1009 分别处理别名区块结构、闭合后的映射格式和重复指定。

同一错误码的不同消息场景分别列出。`{name}`、`{reason}` 等为占位符，实际提示会填入检测位置的局部变量；表内保留模板原文。E2002 为预留项，部分表达式消息为组合提示的原因片段，详见说明列。

本表是当前源码的文档快照，不参与诊断执行。修改提示时编辑 `src/diagnostic-codes.ts` 中对应定义的 `messages`，并同步更新本表。模板中的 `{变量名}` 由检测代码通过 `createIssue` 显式传入；新增检查还需实现相应的检测条件和定位范围。

## Error（红色波浪线）

| 错误号 | 定义 / 场景 | Error message | 说明 |
| --- | --- | --- | --- |
| `E1001` | `projectPath.notFound` | `未找到项目规则目录。请打开含 Stories/Rules 的项目，或设置 astoryx.projectRoot。` | 已启用 |
| `E1001` | `projectPath.inaccessible` | `项目路径无法访问：{reason}` | 已启用 |
| `E1002` | `ruleLoad.declaration` | `第二行需要 #useRule:规则名，例如 #useRule:BaseRule。` | 已启用 |
| `E1002` | `ruleLoad.invalidName` | `规则名应为项目规则文件名，不应包含路径。` | 已启用 |
| `E1002` | `ruleLoad.missing` | `在 Rules/ 找不到 {name}。` | 已启用，name 为含 .json 后缀的文件名 |
| `E1002` | `ruleLoad.failed` | `规则加载失败：{reason}` | 已启用 |
| `E1003` | `catalogLoad.default` | `无法加载资源清单“{source}”：{reason}` | 已启用 |
| `E1004` | `resourceIndex.default` | `无法建立本地资源索引 {source}：{reason}` | 已启用 |
| `E2001` | `resourceMissing.reference` | `{category} 资源“{name}”不存在。` | 已启用 |
| `E2001` | `resourceMissing.rawAliasSource` | `别名来源“{name}”未在 officialAssets_collections 资源清单中找到。` | 已启用 |
| `E2001` | `resourceMissing.aliasSource` | `别名来源“{name}”未在 officialAssets_collections 资源清单或本地资源中找到。` | 已启用 |
| `E2002` | `variantMissing.default` | `角色“{character}”的差分“{variant}”不存在。` | 预留，尚未启用 |
| `E3001` | `protection.default` | `保护文段缺少结束符 }。` | 已启用 |
| `E3002` | `extraParameter.default` | `可选参数数量超出当前规则的定义。` | 已启用 |
| `E3003` | `unknownParameter.default` | `当前控制器规则中不存在此命名参数。` | 已启用 |
| `E3004` | `duplicateParameter.default` | `{parameter} 被重复指定。` | 已启用 |
| `E3005` | `required.default` | `{parameter} 不能为空。` | 已启用 |
| `E3006` | `parameterType.integer` | `{parameter}：应为整数。` | 已启用 |
| `E3006` | `parameterType.number` | `{parameter}：应为有限数字。` | 已启用 |
| `E3006` | `parameterType.range` | `{parameter}：取值应在 {min}～{max} 之间。` | 已启用 |
| `E3006` | `parameterType.boolean` | `{parameter}：应为 true/false（兼容示例中的 0/1）。` | 已启用 |
| `E3006` | `parameterType.vector` | `{parameter}：应为 {dimensions} 维数字向量，用英文逗号分隔。` | 已启用 |
| `E3006` | `parameterType.expression` | `{parameter}：{reason}` | 已启用 |
| `E3006` | `parameterType.expressionEmpty` | `表达式不能为空。` | 表达式原因片段，由 expression 场景组合 |
| `E3006` | `parameterType.expressionCharacter` | `表达式包含不支持的字符 {character}。` | 表达式原因片段，由 expression 场景组合 |
| `E3006` | `parameterType.expressionSyntax` | `表达式缺少操作数、运算符或匹配的括号。` | 表达式原因片段，由 expression 场景组合 |
| `E3006` | `parameterType.expressionDepth` | `表达式嵌套过深。` | 表达式原因片段，由 expression 场景组合 |
| `E3010` | `block.nestedBlock` | `文块不允许嵌套在其他区块内。` | 已启用 |
| `E3010` | `block.missingBlock` | `没有匹配的 #block。` | 已启用 |
| `E3010` | `block.unclosedBlock` | `置换文块缺少 #endblock。` | 已启用 |
| `E3011` | `blockSignature.format` | `文块格式应为 #block 名称(参数1,参数2)。` | 已启用 |
| `E3011` | `blockSignature.parameters` | `文块形参不能为空或重复。` | 已启用 |
| `E3012` | `duplicateBlock.default` | `文块 {name} 重复定义。` | 已启用 |
| `E3013` | `blockCall.default` | `调用格式应为 #use 名称(实参)。` | 已启用 |
| `E3014` | `blockNotFound.default` | `找不到置换文块 {name}。` | 已启用 |
| `E3015` | `blockArity.default` | `{name} 需要 {expected} 个参数，实际 {actual} 个。` | 已启用 |
| `E3020` | `alias.cycle` | `别名上级存在循环引用，无法解析角色。` | 已启用 |
| `E3021` | `rulePosition.default` | `#useRule 声明必须位于第二行。` | 已启用 |
| `E3030` | `duplicateLabel.default` | `标记 {name} 重复。` | 已启用 |
| `E3031` | `labelNotFound.default` | `找不到当前剧本中的标记 {name}。` | 已启用 |

## Warning（黄色波浪线）

| 错误号 | 定义 / 场景 | Error message | 说明 |
| --- | --- | --- | --- |
| `W1001` | `aliasUndeclared.default` | `别名“{name}”未在 userConfigs 中收录，也未在使用前于 #aliases 中声明。` | 已启用 |
| `W1002` | `lineLength.dialogue` | `超出{limit}字，显示效果可能会受到影响。` | 默认 60 字，超出时整行标记 |
| `W1002` | `lineLength.narration` | `超出{limit}字，显示效果可能会受到影响。` | 默认 60 字，超出时整行标记 |
| `W1003` | `dialogueSpaces.default` | `人物名与台词之间应使用Tab。` | 已启用 |
| `W1004` | `variantUnknown.default` | `差分不存在：“{variant}”未收录在角色“{character}”的 userConfigs.variationNames 值中。` | 已启用 |
| `W1005` | `rawCharacterIncomplete.default` | `正在使用原始ID，差分读取不完整，建议使用收录后的别名。userConfigs 未收录 {rawId}` | 已启用 |
| `W1006` | `characterColon.default` | `角色名与差分之间需要英文冒号 : 。` | 已启用 |
| `W1007` | `aliasStructure.unclosed` | `缺少 #endaliases。` | 连续合法别名后第一条非别名行；EOF 时标末尾 |
| `W1007` | `aliasStructure.unmatchedEnd` | `上方没有 #aliases。` | 整行黄色波浪线 |
| `W1007` | `aliasStructure.nested` | `别名区块不允许嵌套，请先写 #endaliases。` | 整行黄色波浪线 |
| `W1007` | `aliasStructure.inMacro` | `别名区块不能声明在置换文块中。` | 整行黄色波浪线 |
| `W1008` | `aliasFormat.entry` | `别名格式不正确，应为 a->b 或 a->b/c/d。` | 仅配对区块内检查，整行黄色波浪线 |
| `W1008` | `aliasFormat.directive` | `{directive} 应独占一行，别名映射请另起一行。` | 整行黄色波浪线 |
| `W1009` | `aliasDuplicate.default` | `重复指定的别名` | 整行黄色波浪线 |
| `W3001` | `unrecognized.default` | `当前规则无法识别此行。` | 已启用 |
| `W3002` | `ruleMode.default` | `{reason}` | 已启用 |
| `W3002` | `ruleMode.prefixMismatch` | `{controller}.isAdvanced 与前缀独一性不一致，已按前缀计算解析模式。` | 解析原因，最终通过 default 场景发布 |

## Information（补充）

| 错误号 | 定义 / 场景 | Error message | 说明 |
| --- | --- | --- | --- |
| `I3001` | `unsupportedDirective.default` | `尚未支持预处理器 #{directive}。` | 已启用 |
