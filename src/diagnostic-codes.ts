/** 诊断唯一入口：代码、级别和提示模板集中定义，检测器只传位置及局部变量。 */
export type Severity = 'error' | 'warning' | 'information';
export interface IssueLocation {line:number;start:number;end:number}
export interface Issue extends IssueLocation {severity:Severity;code:string;message:string}
export interface DiagnosticDefinition {code:string;severity:Severity;messages:Readonly<Record<string,string>>}

/** 使用 {变量名} 占位。同一码可有多个场景；变量名会自动成为调用处的必填字段。 */
export const DIAGNOSTICS = {
  projectPath:{code:'E1001',severity:'error',messages:{
    notFound:'未找到项目规则目录。请打开含 Stories/Rules 的项目，或设置 astoryx.projectRoot。',
    inaccessible:'项目路径无法访问：{reason}'
  }},
  ruleLoad:{code:'E1002',severity:'error',messages:{
    declaration:'第二行需要 #useRule:规则名，例如 #useRule:BaseRule。',
    invalidName:'规则名应为项目规则文件名，不应包含路径。',
    missing:'在 Rules/ 找不到 {name}。',failed:'规则加载失败：{reason}'
  }},
  catalogLoad:{code:'E1003',severity:'error',messages:{default:'无法加载资源清单“{source}”：{reason}'}},
  resourceIndex:{code:'E1004',severity:'error',messages:{default:'无法建立本地资源索引 {source}：{reason}'}},
  resourceMissing:{code:'E2001',severity:'error',messages:{
    reference:'{category} 资源“{name}”不存在。',
    rawAliasSource:'别名来源“{name}”未在 officialAssets_collections 资源清单中找到。',
    aliasSource:'别名来源“{name}”未在 officialAssets_collections 资源清单或本地资源中找到。'
  }},
  // 保留条目，尚未启用严格差分 Error。
  variantMissing:{code:'E2002',severity:'error',messages:{default:'角色“{character}”的差分“{variant}”不存在。'}},
  protection:{code:'E3001',severity:'error',messages:{default:'保护文段缺少结束符 }。'}},
  extraParameter:{code:'E3002',severity:'error',messages:{default:'可选参数数量超出当前规则的定义。'}},
  unknownParameter:{code:'E3003',severity:'error',messages:{default:'当前控制器规则中不存在此命名参数。'}},
  duplicateParameter:{code:'E3004',severity:'error',messages:{default:'{parameter} 被重复指定。'}},
  required:{code:'E3005',severity:'error',messages:{default:'{parameter} 不能为空。'}},
  parameterType:{code:'E3006',severity:'error',messages:{
    integer:'{parameter}：应为整数。',number:'{parameter}：应为有限数字。',
    range:'{parameter}：取值应在 {min}～{max} 之间。',
    boolean:'{parameter}：应为 true/false（兼容示例中的 0/1）。',
    vector:'{parameter}：应为 {dimensions} 维数字向量，用英文逗号分隔。',expression:'{parameter}：{reason}',
    expressionEmpty:'表达式不能为空。',expressionCharacter:'表达式包含不支持的字符 {character}。',
    expressionSyntax:'表达式缺少操作数、运算符或匹配的括号。',expressionDepth:'表达式嵌套过深。'
  }},
  block:{code:'E3010',severity:'error',messages:{
    nestedBlock:'文块不允许嵌套在其他区块内。',missingBlock:'没有匹配的 #block。',
    unclosedBlock:'置换文块缺少 #endblock。'
  }},
  blockSignature:{code:'E3011',severity:'error',messages:{format:'文块格式应为 #block 名称(参数1,参数2)。',parameters:'文块形参不能为空或重复。'}},
  duplicateBlock:{code:'E3012',severity:'error',messages:{default:'文块 {name} 重复定义。'}},
  blockCall:{code:'E3013',severity:'error',messages:{default:'调用格式应为 #use 名称(实参)。'}},
  blockNotFound:{code:'E3014',severity:'error',messages:{default:'找不到置换文块 {name}。'}},
  blockArity:{code:'E3015',severity:'error',messages:{default:'{name} 需要 {expected} 个参数，实际 {actual} 个。'}},
  alias:{code:'E3020',severity:'error',messages:{cycle:'别名上级存在循环引用，无法解析角色。'}},
  rulePosition:{code:'E3021',severity:'error',messages:{default:'#useRule 声明必须位于第二行。'}},
  duplicateLabel:{code:'E3030',severity:'error',messages:{default:'标记 {name} 重复。'}},
  labelNotFound:{code:'E3031',severity:'error',messages:{default:'找不到当前剧本中的标记 {name}。'}},
  aliasUndeclared:{code:'W1001',severity:'warning',messages:{default:'别名“{name}”未在 userConfigs 中收录，也未在使用前于 #aliases 中声明。'}},
  lineLength:{code:'W1002',severity:'warning',messages:{
    dialogue:'超出{limit}字，显示效果可能会受到影响。',
    narration:'超出{limit}字，显示效果可能会受到影响。'
  }},
  dialogueSpaces:{code:'W1003',severity:'warning',messages:{default:'人物名与台词之间应使用Tab。'}},
  variantUnknown:{code:'W1004',severity:'warning',messages:{default:'差分不存在：“{variant}”未收录在角色“{character}”的 userConfigs.variationNames 值中。'}},
  rawCharacterIncomplete:{code:'W1005',severity:'warning',messages:{default:'正在使用原始ID，差分读取不完整，建议使用收录后的别名。userConfigs 未收录 {rawId}'}},
  characterColon:{code:'W1006',severity:'warning',messages:{default:'角色名与差分之间需要英文冒号 : 。'}},
  aliasStructure:{code:'W1007',severity:'warning',messages:{
    unclosed:'缺少 #endaliases。',
    unmatchedEnd:'上方没有 #aliases。',
    nested:'别名区块不允许嵌套，请先写 #endaliases。',
    inMacro:'别名区块不能声明在置换文块中。'
  }},
  aliasFormat:{code:'W1008',severity:'warning',messages:{
    entry:'别名格式不正确，应为 a->b 或 a->b/c/d。',
    directive:'{directive} 应独占一行，别名映射请另起一行。'
  }},
  aliasDuplicate:{code:'W1009',severity:'warning',messages:{default:'重复指定的别名'}},
  unrecognized:{code:'W3001',severity:'warning',messages:{default:'当前规则无法识别此行。'}},
  ruleMode:{code:'W3002',severity:'warning',messages:{default:'{reason}',prefixMismatch:'{controller}.isAdvanced 与前缀独一性不一致，已按前缀计算解析模式。'}},
  unsupportedDirective:{code:'I3001',severity:'information',messages:{default:'尚未支持预处理器 #{directive}。'}}
} as const satisfies Readonly<Record<string,DiagnosticDefinition>>;

export type DiagnosticKey=keyof typeof DIAGNOSTICS;
type Messages<K extends DiagnosticKey>=(typeof DIAGNOSTICS)[K]['messages'];
type Template<K extends DiagnosticKey,V extends keyof Messages<K>>=Extract<Messages<K>[V],string>;
type Placeholders<S extends string>=S extends `${string}{${infer Name}}${infer Rest}`?Name|Placeholders<Rest>:never;
export type DiagnosticValue=string|number|boolean;
/** 未使用的上下文允许保留，便于删减提示文案；模板实际引用的字段仍然必填。 */
export type DiagnosticParameters<K extends DiagnosticKey,V extends keyof Messages<K>>=Readonly<Record<string,DiagnosticValue>>&{
  [Name in Placeholders<Template<K,V>>]:DiagnosticValue
};
type Arguments<K extends DiagnosticKey,V extends keyof Messages<K>>=
  [Placeholders<Template<K,V>>] extends [never]?[parameters?:DiagnosticParameters<K,V>]:[parameters:DiagnosticParameters<K,V>];

/** 保留旧的比较接口，但实际值始终由定义派生，无需维护第二份错误码。 */
export const CODES=Object.freeze(Object.fromEntries(Object.entries(DIAGNOSTICS).map(([key,value])=>[key,value.code]))) as {
  readonly [K in DiagnosticKey]:(typeof DIAGNOSTICS)[K]['code']
};

export function validateDiagnosticDefinitions(definitions:Readonly<Record<string,DiagnosticDefinition>>):void{
  const codes=new Set<string>(),prefix={error:'E',warning:'W',information:'I'};
  for(const [key,definition]of Object.entries(definitions)){
    if(!new RegExp(`^${prefix[definition.severity]}\\d{4}$`).test(definition.code))throw new Error(`诊断 ${key} 的代码与级别不匹配：${definition.code}`);
    if(codes.has(definition.code))throw new Error(`诊断代码重复：${definition.code}`);
    codes.add(definition.code);
    if(!Object.keys(definition.messages).length||Object.values(definition.messages).some(message=>!message.trim()))throw new Error(`诊断 ${key} 缺少提示模板。`);
    for(const message of Object.values(definition.messages))for(const placeholder of message.matchAll(/\{([^{}]*)\}/g)){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(placeholder[1]))throw new Error(`诊断 ${key} 的变量名无效：${placeholder[1]}；请使用 {name} 形式的具名变量。`);
    }
  }
}
validateDiagnosticDefinitions(DIAGNOSTICS);

/** 单次字面替换：局部变量中的 $、花括号、路径不会被执行或再次展开。 */
function render(key:DiagnosticKey,variant:string,parameters:Record<string,unknown>):string{
  const definition:DiagnosticDefinition=DIAGNOSTICS[key],template=definition.messages[variant];
  if(typeof template!=='string')throw new Error(`诊断 ${key} 不存在场景 ${variant}`);
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g,(_match,name:string)=>{
    if(!Object.prototype.hasOwnProperty.call(parameters,name)||parameters[name]===undefined||parameters[name]===null)throw new Error(`诊断 ${key}.${variant} 缺少变量 ${name}`);
    return String(parameters[name]);
  });
}

export function diagnosticMessage<K extends DiagnosticKey,V extends keyof Messages<K>>(key:K,variant:V,...args:Arguments<K,V>):string{
  return render(key,String(variant),(args[0]??{}) as Record<string,unknown>);
}

export function createIssue<K extends DiagnosticKey,V extends keyof Messages<K>>(key:K,variant:V,location:IssueLocation,...args:Arguments<K,V>):Issue{
  const definition=DIAGNOSTICS[key];
  return {...location,code:definition.code,severity:definition.severity,message:render(key,String(variant),(args[0]??{}) as Record<string,unknown>)};
}
