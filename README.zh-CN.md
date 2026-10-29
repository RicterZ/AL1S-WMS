<div align="center">
  
# AL1S WMS

[English](README.md) | [中文](README.zh-CN.md)

面向家庭储物的轻量级、自托管仓库管理系统。

<a href="https://github.com/RicterZ/AL1S-WMS/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/RicterZ/AL1S-WMS?display_name=tag" /></a>
<a href="LICENSE"><img alt="许可证" src="https://img.shields.io/github/license/RicterZ/AL1S-WMS" /></a>

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=RicterZ&repository=AL1S-WMS&category=integration"><img alt="通过 HACS 安装" src="https://my.home-assistant.io/badges/hacs_repository.svg" /></a>

<img width="1600" height="448" alt="AL1S-WMS-README-banner" src="https://github.com/user-attachments/assets/1aeb25ec-4633-4d3b-9655-8b1a7ce13350" />
</div>

它帮助家庭了解有什么、放在哪里、何时需要补货、哪些东西即将过期，以及这个月已经花了多少钱。

它把盘点、采购和财务放在同一条数据链路中：采购完成后入库会生成批次与库存流水；录入成本后，这笔实际支出、物品价格历史和库存价值会自动更新。系统也提供 MCP 接口，方便 AI Agent 在明确授权范围内协助管理家庭库存。

## 适合谁

- 想整理食品、日用品、药品、耗材或储物间库存的家庭。
- 需要区分多个房间、柜子、冰箱区域，并记录同一物品在不同地点存量的人。
- 希望把采购计划、实际花费和月度预算联系起来，而不是分别维护表格的人。
- 想把重复的查询、补货建议、过期检查交给 AI Agent，但仍保留人工确认的人。

<img width="1585" height="986" alt="AL1S WMS 总览" src="https://github.com/user-attachments/assets/00117ee5-ac0e-41e2-8045-b5356c5bbe11" />

## 功能对比

| 功能 | AL1S WMS | [Grocy](https://grocy.info/) | [HomeBox](https://homebox.software/) |
| --- | --- | --- | --- |
| 可爱 | 天童爱丽丝的可爱毋庸置疑 | - | - |
| 核心对象 | 家庭消耗品 | 食品与家庭事务 | 家庭耐用资产 |
| 库存模型 | 批次与库存流水 | 完整、可配置的库存系统 | 物品数量属性 |
| 消耗管理 | 领用、开封与用尽 | 消耗与开封 | 手动修改数量 |
| 到期管理 | 批次临期与 FEFO | 到期规则与优先消耗 | - |
| 补货采购 | 库存预警、采购计划与收货 | 采购清单与自动补货 | - |
| 家庭财务 | 预算、计划与实际支出 | 价格历史与支出报表 | 资产购买价值 |
| 扩展范围 | 聚焦库存、采购与支出 | 菜谱、膳食、家务与任务 | 文档、保修与维护 |
| Agent 集成 | 内置 MCP | REST API、社区 MCP | REST API |

## 功能

### 库存与批次

- 管理物品名称、条码、单位、默认地点、补货阈值和补货数量。
- 按多级地点和多级分类组织家庭物品，并以树状结构浏览和维护。
- 每次入库都会创建独立批次，可记录生产日期、到期日期、实际成本、购买日期与购买渠道。
- 同一批次可分布在多个地点；领用时可指定批次，也可按照 FEFO（优先到期优先）自动扣减。
- 支持入库、领用、调拨、盘点校正、批次编辑等操作，完整保留库存变动记录。
- 物品详情集中展示库存、批次、购买记录、价格趋势和可分页的变动历史。

<img width="1585" height="986" alt="AL1S WMS 库存盘点" src="https://github.com/user-attachments/assets/a9b3002f-b90a-4393-a5e8-da09e5e201cf" />

### 预警与盘点

- 根据库存与补货阈值区分不足、临界和耗尽状态。
- 提示已过期和临期批次，帮助优先处理或领用。
- 支持按物资、地点、状态和到期情况筛选库存明细，并可按入库时间或紧急程度排序。
- 实物盘点直接录入实数；差异会自动记录为入库或领用，并保留盘点原因。

### 采购

- 创建可安排日期、地点、渠道、预计金额的采购清单，并在采购日历中查看计划。
- 已关联物资的采购项会带出分类、单位和默认地点；选择购买渠道后可用该渠道最近价格估算金额。
- 库存低于阈值时动态给出自动补货建议。建议不会直接入库，确认采购后才会转为实际采购项。
- 采购阈值按同一家庭、同一商品在所有位置的总库存计算；位置筛选不改变采购判断。库存列表同时展示本位置数量和家庭总量。
- 在库存页的“位置调拨提醒”中可为商品和位置设置独立最低量，包括当前没有库存的位置。位置不足只产生调拨提醒，不增加采购量；设为 0 可移除规则。
- 收货时填写实际数量、成本与日期即可生成新批次并完成入库；已完成采购项从活动清单移除，采购和财务历史仍可追溯。
- 支持购买渠道与条码查询。条码查询优先使用本地数据与缓存，再回退到公共商品数据源。

<img width="1585" height="986" alt="AL1S WMS 采购清单" src="https://github.com/user-attachments/assets/9876cb1f-9f54-47e5-b3de-fcbe1aadfc79" />

### 财务

- 以月度总预算与分类预算管理家庭采购支出，后续月份可沿用最近一次已保存预算。
- 同时展示实际支出、待采购预计、预测支出、剩余预算和预算执行状态。
- 分类预算支持父子层级：父分类额度可覆盖其子分类，同时保留更细的子分类预算。
- 提供月度支出趋势、预算对比、分类/渠道支出排行、采购流水分页和库存价值统计。
- 实际支出以批次入库时间归属月份；计划金额只计入待采购预测，不会替代已发生金额。
- 物品详情保留按渠道查看的价格历史，便于比较最近价格、最低价和平均价。

<img width="1585" height="986" alt="AL1S WMS 财务" src="https://github.com/user-attachments/assets/835318bd-0119-4588-8040-da61be1e0f7d" />

### 多家庭与 AI Agent

- 一个账户可创建和切换多个家庭，物品、地点、采购和财务数据相互隔离。
- 支持家庭级 MCP Token：Agent 可只管理被授权的单个家庭；账户级 Token 可在授权范围内选择家庭。
- MCP 覆盖库存概览、物品/地点/分类维护、批次、收货、领用、调拨、盘点、采购、价格历史与财务分析。
- 预算修改和删除等有业务影响的操作应由 Agent 在执行前取得用户明确确认；所有库存写入均需要幂等键，便于安全重试。

<img width="1196" height="875" alt="image" src="https://github.com/user-attachments/assets/1d966aa9-2f0e-4e80-8695-6bcb57c75046" />


## 不适合什么

- 企业、工作室、门店或需要多人审批、供应商合同、订单履约和复杂权限模型的专业商用场景。
- 需要银行账户同步、收入管理、发票/报销、税费拆分、运费分摊、优惠券拆分、复式记账或多币种换算的专业财务系统。
- 需要 ERP、WMS、POS 或供应链系统级别的批量作业、仓位策略、波次拣货与审计合规能力的场景。
- 只是在冰箱里发现一根放了三个月的黄瓜，就决定把整个家庭运营成物流中心的场景。虽然它确实能帮你先处理那根黄瓜。

## TODO

- [ ] 多用户支持，包括家庭成员与基于角色的访问控制（RBAC）。
- [ ] 家庭数据的导入、导出、备份与恢复。
- [ ] 面向高频采购物品的周期采购模板与补货规则。
- [ ] 可配置的临期和库存提醒，通过 MCP 交给 AI Agent 或外部自动化发送。

## Home Assistant

接入家庭库存后，可在 HA 仪表盘分别查看库存提醒和使用中物资，也可在自动化中使用库存状态。通过 HACS 安装 AL1S WMS 自定义集成，再从**设置 → 设备与服务**添加集成并填写 AL1S 地址和访问令牌。最后在仪表盘的**添加卡片**中按需添加 **库存提醒** 和 **使用中**。

安装步骤、卡片内容和 YAML 仪表盘配置见 [Home Assistant 使用说明](docs/home-assistant.zh-CN.md)。

## 部署

### Docker

需要安装 Docker 与 Compose。以下命令会构建镜像、启动服务，并把 SQLite 数据持久化到 Docker volume：

```bash
git clone https://github.com/RicterZ/AL1S-WMS.git
cd AL1S-WMS
docker compose up -d --build
```

打开 `http://localhost:8080`，按页面引导完成首次初始化。应用的 SQLite 数据库位于容器内 `/data/al1s-wms.db`；`/data` 必须持久化，否则重建容器会丢失所有家庭数据。

也可以使用宿主机目录，便于纳入自己的备份策略：

```bash
mkdir -p /srv/al1s-wms/data
docker run -d \
  --name al1s-wms \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /srv/al1s-wms/data:/data \
  al1s-wms:local
```

建议停服后整体备份 `/data`，同时保留 SQLite 数据库和 `uploads/` 照片目录。仅恢复数据库无法恢复照片。对外网部署时，请在反向代理后提供 HTTPS，并限制管理入口访问范围。

### 照片与存储目录

商品详情支持一张实物参考照片，批次 dialog 支持最多六张照片；同一批次在不同位置共用照片。选择、更换和删除照片会立即生效，与“保存批次”的资料保存相互独立。库存列表继续使用原有 icon。

支持 JPEG、PNG、WebP，每张不超过 10 MiB。服务端解码图片、校正方向、去除内嵌元数据，生成最长边不超过 2000 px 的 WebP 图片和最长边不超过 400 px 的缩略图，不保留上传原文件。读取照片需要通过家庭范围内的鉴权接口。

```text
/data/
  al1s-wms.db                 # 保存照片归属、名称等记录
  uploads/
    <家庭 UUID>/
      <照片 UUID>.webp
      <照片 UUID>.thumb.webp
```

首次上传自动创建目录。Compose 已通过 `/data` 卷同时持久化数据库与照片；本地开发默认在实际打开的数据库旁创建 `uploads/`。修改 `UPLOADS_DIR` 后需将已有文件迁移到新目录。替换或删除照片会删除相应文件；库存调拨保留批次照片关联。

### 可选环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `8080` | HTTP 服务端口。 |
| `BIND_ADDRESS` | `0.0.0.0` | 服务监听地址。 |
| `DATABASE_URL` | `/data/al1s-wms.db`（镜像内） | SQLite 数据库路径。 |
| `UPLOADS_DIR` | 镜像内为 `/data/uploads`；本地默认在数据库旁的 `uploads/` | 私有照片目录，与数据库一起持久化，不应配置为公开静态目录。 |
| `APIZERO_API_KEY` | 无 | 启用 ApiZero 的认证条码查询；未设置时使用匿名免费额度与公共数据源。 |

## MCP 与 AI Agent

AL1S WMS 暴露 Streamable HTTP MCP 端点：

```text
https://your-domain.example/mcp
```

在 **设置 → MCP 访问令牌** 创建 Token，再在 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "al1s-wms": {
      "url": "https://your-domain.example/mcp",
      "headers": {
        "Authorization": "Bearer al1s_REPLACE_WITH_YOUR_TOKEN"
      }
    }
  }
}
```

推荐的 Agent 工作方式是先调用 `get_home_context` 与 `get_home_overview`，再根据任务查询物品、地点、批次或采购计划。`get_agent_guide` 会返回收货、采购、临期处理与盘点的完整工具流程。

- 家庭级 Token 仅能操作一个家庭，工具调用中无需传入 `homeId`。
- 账户级 Token 可操作多个家庭，Agent 必须先选择并传入 `homeId`。
- 预算、删除、领用和入库等写入操作应在执行前确认目标与金额；库存写入必须携带唯一的 `idempotencyKey`，仅在重试同一操作时复用。

## 开发与验证

项目使用 pnpm workspace。安装依赖后可运行：

```bash
pnpm install
pnpm dev
```

完整验证：

```bash
pnpm typecheck
pnpm test
pnpm build
```
