# 发布到飞书 wiki：lark-cli 命令配方

实际写 wiki 走 `lark-wiki` / `lark-doc` skill。下面是这条链路里反复用到的命令，已踩过坑。全程 `--as user`。

## 0. 定位父节点

按 portwind-wiki 路由，项目理解归到「各项目知识库 / 对应项目组」下。先列空间顶层节点拿父节点 token：

```bash
lark-cli wiki +node-list --as user --space-id <SPACE_ID> --parent-node-token <PARENT> --format json
# 返回数据在 data.nodes（不是 items）；--parent-node-token 必须同时带 --space-id
```

给某个 wiki URL 解析 space_id / obj_token：

```bash
lark-cli wiki spaces get_node --params '{"token":"<wiki_token>"}' --as user --format json
# data.node.space_id / data.node.obj_token（obj_token 才是 docx document_id）
```

## 1. 建节点（索引页 + 各子页）

```bash
lark-cli wiki +node-create --as user --parent-node-token <PARENT> --title "<标题>" --format json
# 返回 node_token（wiki 树 token，拼 URL：.../wiki/<node_token>）、obj_token（docx document_id，写正文用）
```

先建索引页，再在索引页 node_token 下建各子页。

## 2. 写正文（Markdown 追加）

```bash
lark-cli docs +update --api-version v2 --doc <obj_token> --command append \
  --doc-format markdown --content - < body.md
```

- 子页正文用 markdown 追加最省事；表格、列表都支持。
- 节点标题已经是页面标题，**正文里别再写 H1**，发布前把草稿首个 `# ...` 行删掉。
- 图片行 `![..](..)` 也删掉，图走 media-insert（见下）。

## 3. 插图并置顶

`media-insert` 落在文档**末尾**，再 `block_move_after` 移到标题正下方：

```bash
NEW=$(lark-cli docs +media-insert --doc <obj_token> --file <相对路径>.png --width 560 --align center --format json | jq -r '.data.block_id')
lark-cli docs +update --api-version v2 --doc <obj_token> --command block_move_after \
  --block-id <obj_token> --src-block-ids "$NEW"   # 锚点用 obj_token(=title 块) → 移到标题下
```

`--file` 只接受 cwd 下的**相对路径**（传绝对路径报 unsafe）。

## 4. 流程图用原生画板（不要代码块）

`<whiteboard type="mermaid">` 直接作为 block 内容插入/替换：

```bash
# 把一个 <pre> 代码块替换成画板
lark-cli docs +update --api-version v2 --doc <obj_token> --command block_replace \
  --block-id <pre_block_id> --content - <<'EOF'
<whiteboard type="mermaid">
flowchart TD
  A[入口] --> B{判断}
  B -->|是| C[分支1]
  B -->|否| D[分支2]
</whiteboard>
EOF
```

- mermaid 节点标签里**别用引号/斜杠**包特殊字符（`/health`、`{"x"}` 会渲染失败）；写成 `health` / `{x}`。
- 已有画板内容不能用 `docs +update` 改，要用 `lark-cli whiteboard +update --whiteboard-token <block_token> --input_format mermaid --source @rel.mmd --overwrite`。

## 5. 整篇重写的坑（重要）

`docs +update --command overwrite` 会清空文档**并把标题冲成 `Untitled`**（连 wiki 树标题一起）。重写后必须改回：

```bash
lark-cli docs +update --api-version v2 --doc <obj_token> --command str_replace \
  --pattern "Untitled" --content "<正确标题>"
```

能用增量编辑（`block_insert_after` / `block_replace` / `str_replace`）就别 overwrite。

## 6. 索引页 / 归档表加一行

```bash
lark-cli docs +update --api-version v2 --doc <index_obj> --command str_replace --doc-format markdown \
  --pattern "<已有的最后一行>" --content "<已有的最后一行>
<新行>"
```

## 7. 就地替换插图（换风格/换版本）

上传新图 → 移到旧图位置 → 删旧图：

```bash
NEW=$(lark-cli docs +media-insert --doc <obj> --file new.png --width 560 --format json | jq -r '.data.block_id')
lark-cli docs +update --api-version v2 --doc <obj> --command block_move_after --block-id <title_or_anchor> --src-block-ids "$NEW"
lark-cli docs +update --api-version v2 --doc <obj> --command block_delete --block-id <old_img_block_id>
```

旧图 block_id 用 `docs +fetch --api-version v2 --doc <obj> --detail with-ids` 里第一个 `<img id="...">` 拿。
