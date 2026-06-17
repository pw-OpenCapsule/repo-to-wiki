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

const cfg = args || {}
const repoPath = cfg.repoPath
const spaceId = cfg.spaceId
const parentNode = cfg.parentNodeToken
const imagegen = cfg.imagegen || '~/.claude/skills/chatgpt-imagegen/chatgpt-imagegen'
const backend = cfg.imageBackend || 'codex'

if (!repoPath || !spaceId || !parentNode) {
  log('缺少必需 args：{ repoPath, spaceId, parentNodeToken }。中止。')
  return { error: 'missing args: repoPath / spaceId / parentNodeToken' }
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

// —— 2+3. 每页：写正文 -> 出图（pipeline，各页独立流动，无 barrier）——
phase('写子页')
const pages = await pipeline(
  plan.pages,
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
      `用 chatgpt-imagegen 出一张「${prev.title}」的概念图，内容要对、风格要烂。\n` +
      `运行（短英文标签，结构要准）：\n` +
      `${imagegen} "${STYLE} Subject: ${prev.diagram || prev.title + ' diagram with correct labeled boxes and arrows'}" ` +
      `-o ${repoPath}/.understand-anything/wiki-assets/wf-${prev.key}.png --size 1536x1024 --backend ${backend} --quiet\n` +
      `生成后返回 {imagePath}。`,
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
  `space_id=${spaceId}，父节点=${parentNode}。\n` +
  `步骤：\n` +
  `1) 先用 pages 里 isIndex 的那页建「${plan.projectName} 源码理解」索引节点（wiki +node-create --parent-node-token ${parentNode}）。\n` +
  `2) 其余每页在索引节点下建子节点；正文用 docs +update append --doc-format markdown 写入（obj_token 当 --doc）。\n` +
  `3) 每页插图：docs +media-insert（落末尾）后 block_move_after 到标题正下方；--file 用相对路径。\n` +
  `4) 正文里的 \`\`\`mermaid 代码块用 block_replace 换成 <whiteboard type="mermaid">…</whiteboard>。\n` +
  `5) 索引页目录里把「业务理解」用高亮框置顶；最后把索引页链接回填到各子页/归档。\n` +
  `坑：overwrite 会把标题冲成 Untitled（别用，用增量编辑）；node-list 要带 --space-id 且数据在 nodes 键。\n` +
  `页面数据（含 markdown 与 imagePath）：\n${JSON.stringify(ready)}\n` +
  `返回 {indexUrl, pages:[{title,url}]}。`,
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
