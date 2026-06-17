// repo-to-wiki —— Claude Code Workflow 编排脚本
//
// 跑法（在 Claude Code 里用 Workflow 工具）：
//   Workflow({ scriptPath: "<本文件路径>", args: {
//     repoPath: "/abs/path/to/repo",
//     spaceId: "7642234757744496151",          // 飞书 wiki 空间 id
//     parentNodeToken: "<各项目知识库/项目组 的 node_token>",
//     imagegen: "/Users/<you>/.claude/skills/chatgpt-imagegen/chatgpt-imagegen", // 可选
//     imageBackend: "codex"                       // 可选：codex 可并行；web 串行(=1) 但不耗 Codex 额度
//   }})
//
// 也可放到 .claude/workflows/ 后用 Workflow({ name: "repo-to-wiki", args:{...} })。
// 注意：发布阶段会真往飞书 wiki 写多子页 —— 先确认 parentNodeToken 是你要的目标。

export const meta = {
  name: 'repo-to-wiki',
  description: '理解一个仓库并发布成飞书 wiki 多子页（业务理解+源码理解+固定烂图风插图）',
  phases: [
    { title: '理解与规划' },
    { title: '写子页' },
    { title: '配图' },
    { title: '发布' },
  ],
}

// —— 固定生图风格（烂的是风格，内容必须对）——
const STYLE = 'Deliberately UGLY, low-resolution, mouse-drawn-in-an-old-MS-Paint look on a plain WHITE background. Use the BIGGEST crude flat COLOR blocks, heavy childish scribble/graffiti crayon fills spilling outside the lines, wobbly shaky hand outlines, jagged one-pixel-at-a-time aliased edges, wonky lopsided shapes — pathetic and absurdly badly drawn, almost-recognizable but everything slightly off and confusing. BUT the CONTENT must be CORRECT: the boxes, arrows, order and short ENGLISH labels must be accurate and readable.'

// args 经 Workflow 工具传入时到这里是 JSON 字符串（不是对象），必须先 parse。
let cfg = args
if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch (e) { cfg = {} } }
cfg = cfg || {}
const repoPath = cfg.repoPath
const spaceId = cfg.spaceId
const parentNode = cfg.parentNodeToken
const imagegen = cfg.imagegen || '~/.claude/skills/chatgpt-imagegen/chatgpt-imagegen'
const backend = cfg.imageBackend || 'codex'
// 增量控制：only=只处理这些 page key（补充模式）；force=即使已存在也重做（图/正文）
const only = Array.isArray(cfg.only) && cfg.only.length ? cfg.only : null
const force = !!cfg.force

if (!repoPath || !spaceId || !parentNode) {
  log('缺少必需 args（repoPath / spaceId / parentNodeToken）。收到：' + JSON.stringify(args))
  return { error: 'missing args: repoPath / spaceId / parentNodeToken', received: cfg }
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['projectName', 'oneLiner', 'pages'],
  properties: {
    projectName: { type: 'string' },
    oneLiner: { type: 'string' },
    keyNumbers: { type: 'array', items: { type: 'string' } },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'title', 'brief'],
        properties: {
          key: { type: 'string', description: 'kebab，唯一，如 01-architecture' },
          title: { type: 'string' },
          brief: { type: 'string', description: '这页讲什么' },
          isIndex: { type: 'boolean', description: 'true=索引页(全貌)，应为 pages[0]' },
          sourceHints: { type: 'string', description: '相关代码路径/符号提示' },
          diagram: { type: 'string', description: '这页主图要画的正确结构(短英文)' },
        },
      },
    },
  },
}

// —— 1. 理解 + 规划 ——（必须先完成）
phase('理解与规划')
const plan = await agent(
  `在仓库 ${repoPath} 上做项目理解并规划 wiki 子页树。\n` +
  `1) 跑 understand-anything 的 /understand --language zh 拿分层+导览+知识图谱；没有就直接读核心文件。\n` +
  `2) 跑 understand-domain 的 domain-analyzer 拿业务域/业务流。\n` +
  `3) 需要跨仓上下游时用 code-search，仓内结构用 codegraph。\n` +
  `规划页面：pages[0] 必须是 isIndex=true 的索引/全貌页；其后是「业务理解」（置顶推荐）、「架构总览」、「核心流程」，再按子系统补。\n` +
  `每页给 key/title/brief/sourceHints/diagram。diagram 用短英文描述该页主图的正确结构。`,
  { schema: PLAN_SCHEMA, label: 'understand+plan' }
)
if (!plan || !plan.pages || !plan.pages.length) {
  return { error: '规划失败', plan }
}
log(`规划完成：${plan.projectName} · ${plan.pages.length} 页`)

// 补充模式：只处理 only 指定的页（索引页始终保留，用于 find-or-create + 目录更新）
const targetPages = only ? plan.pages.filter((p) => p.isIndex || only.includes(p.key)) : plan.pages
if (only) log(`补充模式：只处理 ${targetPages.map((p) => p.key).join(', ')}（其余页不动）`)

// —— 2+3. 每页：写正文 -> 出图（pipeline，各页独立流动，无 barrier）——
phase('写子页')
const pages = await pipeline(
  targetPages,
  // stage 1：写这一页的中文 markdown 正文
  (p) =>
    agent(
      `读 ${repoPath} 里与「${p.title}」相关的代码（提示：${p.sourceHints || '自行定位'}），写这一页的中文 markdown 正文。\n` +
      `要求：人话优先、表格优先、标注真实「现状坑」；关键流程用 \`\`\`mermaid 代码块（发布时会转成飞书原生画板）；mermaid 标签别用引号/斜杠包特殊字符。\n` +
      `不要写 H1 标题、不要写图片行。${p.isIndex ? '这是索引页：写一句话定位 + 关键数字表 + 子页目录占位。' : ''}`,
      {
        label: `write:${p.key}`,
        phase: '写子页',
        schema: { type: 'object', required: ['markdown'], properties: { markdown: { type: 'string' } } },
      }
    ).then((r) => ({ ...p, markdown: r ? r.markdown : '' })),
  // stage 2：用 chatgpt-imagegen 出固定烂图风的概念图（内容正确）
  (prev) =>
    agent(
      `给「${prev.title}」准备概念图，内容要对、风格要烂。目标文件：${repoPath}/.understand-anything/wiki-assets/wf-${prev.key}.png\n` +
      `先 \`test -f\` 看文件在不在：${force ? '（force=true，无论在不在都重生成）' : '若已存在就【跳过生成】、直接返回该路径（省 quota）。'}\n` +
      `需要生成时运行（短英文标签，结构要准）：\n` +
      `${imagegen} "${STYLE} Subject: ${prev.diagram || prev.title + ' diagram with correct labeled boxes and arrows'}" ` +
      `-o ${repoPath}/.understand-anything/wiki-assets/wf-${prev.key}.png --size 1536x1024 --backend ${backend} --quiet\n` +
      `返回 {imagePath, generated:true|false}。`,
      {
        label: `img:${prev.key}`,
        phase: '配图',
        schema: { type: 'object', required: ['imagePath'], properties: { imagePath: { type: 'string' } } },
      }
    ).then((r) => ({ ...prev, imagePath: r ? r.imagePath : '' }))
)

const ready = pages.filter(Boolean)
log(`内容+插图就绪：${ready.length}/${plan.pages.length} 页`)

// —— 4. 发布到飞书 wiki（顺序，状态相关：先索引后子页）——
phase('发布')
const published = await agent(
  `把规划好的页面发布成飞书 wiki 多子页，走 lark-wiki / lark-doc skill（全程 --as user）。\n` +
  `space_id=${spaceId}，父节点=${parentNode}。${only ? '【补充模式】只动下面给的页，其余已有子页不要碰。' : ''}\n` +
  `**幂等铁律：先查后建，绝不无脑 node-create（否则建出重复子页）。**\n` +
  `0) 用 \`lark-cli wiki +node-list --as user --space-id ${spaceId} --parent-node-token ${parentNode}\`（数据在 data.nodes）查父节点下是否已有标题=「${plan.projectName} 源码理解」的索引节点：有就复用其 node_token/obj_token，没有才 +node-create。\n` +
  `1) 对每一页：在索引节点下 +node-list 查是否已有同标题子节点。\n` +
  `   - 已存在 → **更新**：用增量编辑覆盖正文（block 级 block_replace / 先 block_delete 旧正文块再 append；**不要用 overwrite**，它会把标题冲成 Untitled），图只在 ${force ? 'force=true 时' : '本次重新生成了(generated=true) 或该页还没有图时'} 替换（media-insert 新图→block_move_after 置顶→block_delete 旧图）。\n` +
  `   - 不存在 → +node-create 建子节点，append markdown 正文，media-insert 图并 block_move_after 置顶。\n` +
  `2) 正文里的 \`\`\`mermaid 代码块用 block_replace 换成 <whiteboard type="mermaid">…</whiteboard>（标签别带引号/斜杠特殊字符）。\n` +
  `3) 索引页目录：把本次涉及的子页链接补进目录（已存在的行别重复加），「业务理解」用高亮框置顶。\n` +
  `坑：node-list 必须带 --space-id；overwrite 会冲标题（被冲了就 str_replace "Untitled" 改回）。\n` +
  `页面数据（含 markdown 与 imagePath；generated 表示本次是否重新生成了图）：\n${JSON.stringify(ready)}\n` +
  `返回 {indexUrl, pages:[{title,url,action:"created"|"updated"}]}。`,
  {
    label: 'publish',
    schema: {
      type: 'object',
      required: ['indexUrl'],
      properties: {
        indexUrl: { type: 'string' },
        pages: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } } } },
      },
    },
  }
)

return { project: plan.projectName, pageCount: ready.length, ...(published || {}) }
