const RESEARCH_REPORT = {
  id: 'research-report',
  version: 1,
  label: '研究报告验收',
  summary: '核验结论证据、引用来源、数据口径、方法限制和复现信息；检查由审阅者完成，不代表自动事实核查。',
  checks: [
    {
      id: 'claims-evidence', label: '核心结论有对应证据', required: true,
      requirement: '逐条核对核心结论，记录能支持结论的正文位置、数据或原始来源。',
      placeholder: '例：结论 1 见第 3 节表 2；样本数据与结论一致。',
    },
    {
      id: 'citations-accessible', label: '引用来源可复核', required: true,
      requirement: '引用能定位到作者或机构、标题、日期及 URL/DOI，并且来源确实支持对应论断。',
      placeholder: '例：抽查引用 [1] [3] [5]，链接可访问，原文段落与报告表述一致。',
    },
    {
      id: 'data-scope', label: '数据时间与统计口径明确', required: true,
      requirement: '核对统计区间、时区、单位、样本范围和比较基线，避免把不同口径的数据直接比较。',
      placeholder: '例：数据截至 2026-10-31，UTC；金额均为人民币，同比基线一致。',
    },
    {
      id: 'method-limitations', label: '方法与限制已披露', required: true,
      requirement: '检查检索或实验方法、纳入排除标准、局限性和重要相反证据。',
      placeholder: '例：检索式与数据库已记录；仅覆盖公开中文资料的限制已说明。',
    },
    {
      id: 'reproduction', label: '复现材料可定位', required: false,
      requirement: '需要复现的报告应提供脚本、数据、环境和步骤；不适用时记录原因。',
      placeholder: '例：附录包含运行命令与依赖版本；或本次为文献综述，不涉及脚本复现。',
    },
  ],
}

const DATA_DELIVERY = {
  id: 'data-delivery',
  version: 1,
  label: '数据交付验收',
  summary: '核验数据来源与统计口径、字段与单位说明、抽样核对结果；检查由审阅者完成，不代表自动校验。',
  checks: [
    {
      id: 'source-and-scope', label: '来源与口径写清', required: true,
      requirement: '记录数据来源（系统、接口或导出人）、统计区间、时区与过滤条件。',
      placeholder: '例：来源为订单库导出，区间 2026-07-01 至 09-30 UTC，已剔除退款单。',
    },
    {
      id: 'fields-and-units', label: '字段与单位可解释', required: true,
      requirement: '关键字段的含义、单位与空值处理方式能对上，金额与比率的分母写清。',
      placeholder: '例：金额为含税人民币；复购率分母为本季有成交客户数。',
    },
    {
      id: 'sample-spotcheck', label: '抽样核对过', required: true,
      requirement: '抽取若干行回到源系统或原始记录核对，记录抽了哪几行、结论如何。',
      placeholder: '例：抽第 3、57、102 行回源一致；第 57 行差额 0.02 为四舍五入。',
    },
    {
      id: 'reproduction', label: '复现或更新路径可定位', required: false,
      requirement: '给出重跑脚本、导出查询或更新频率；不适用时写清原因。',
      placeholder: '例：导出 SQL 见附录 A，每日 06:00 自动更新。',
    },
  ],
}

const PACKS = [RESEARCH_REPORT, DATA_DELIVERY]

export function listPacks() {
  return PACKS.map(pack => ({ ...pack, checks: pack.checks.map(check => ({ ...check })) }))
}

export function getPack(id) {
  const pack = PACKS.find(candidate => candidate.id === id)
  return pack ? { ...pack, checks: pack.checks.map(check => ({ ...check })) } : null
}

export function initialReviewPack(pack) {
  return {
    id: pack.id,
    version: pack.version,
    checks: Object.fromEntries(pack.checks.map(check => [check.id, { checked: false, detail: '' }])),
  }
}

export function reviewProgress(item) {
  const pack = getPack(item?.reviewPack?.id)
  if (!pack) return null
  const states = item.reviewPack?.checks || {}
  const required = pack.checks.filter(check => check.required)
  const complete = check => states[check.id]?.checked === true && String(states[check.id]?.detail || '').trim().length > 0
  const requiredCompleted = required.filter(complete).length
  return {
    completed: pack.checks.filter(complete).length,
    total: pack.checks.length,
    requiredCompleted,
    requiredTotal: required.length,
    complete: requiredCompleted === required.length,
    incomplete: required.filter(check => !complete(check)).map(check => check.id),
  }
}

export function assertReviewReady(item, action) {
  if (action !== 'approve' || !item?.reviewPack) return
  const pack = getPack(item.reviewPack.id)
  const progress = reviewProgress(item)
  if (pack && progress && !progress.complete) {
    const missing = pack.checks.filter(check => progress.incomplete.includes(check.id)).map(check => check.label).join('、')
    throw new Error(`完成必填检查并填写证据后才能通过：${missing}`)
  }
}

const SHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xlsx', 'xls'])

/** Pack id suggested by a delivered path, or null when no scenario applies. */
export function suggestedPackId(path) {
  const name = String(path || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return SHEET_EXTENSIONS.has(name.slice(dot + 1).toLowerCase()) ? 'data-delivery' : null
}
