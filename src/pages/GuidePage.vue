<script setup lang="ts">
import SafetyBanner from '@/components/SafetyBanner.vue'
import {
  CLOSE_MODE_LABELS,
  DELIVERY_SLA_HOURS,
  EXPIRY_DANGER_DAYS,
  EXPIRY_PRIORITY_DAYS,
  EXPIRY_WARN_DAYS,
  NEAR_EXPIRY_FOLLOWUP_HOURS,
  NEAR_EXPIRY_OWNER_NOTICE_DAYS,
  PICKUP_WINDOW_HOURS,
} from '@/rules'
</script>

<template>
  <SafetyBanner />

  <div class="card">
    <h2>邻里药箱互助边界与运行规则</h2>
    <p>
      “邻里药箱”是小区居民之间<strong>未拆封常备非处方耗材</strong>的临时周转工具。把边界讲清楚，才能让邻里好意不变成安全风险。
    </p>

    <h3>一、社区做什么、不做什么</h3>
    <ul>
      <li>✅ <strong>做</strong>：物品登记信息留存、志愿者形式审核、借用/候补/交接/归还的流程记录、效期与超时提醒、风险反馈与隔离。</li>
      <li>❌ <strong>不做</strong>：不诊断病情、不推荐或提供任何药品、不判断“该用什么”、不对物品疗效作担保。</li>
      <li>任何健康问题请咨询医生；紧急情况立即就医或拨打 120。</li>
    </ul>

    <h3>二、哪些物品不能进入共享</h3>
    <div class="banner banner-danger">
      <strong>以下四类一律禁入，登记时系统拦截、审核时驳回：</strong>
      ① 处方药及任何口服/注射药品（退烧止痛药、抗生素、降压降糖药等）；② 已拆封、散装或封签破损物品；
      ③ 需冷藏/冷链的药品；④ 过期、临近效期（≤{{ EXPIRY_DANGER_DAYS }} 天）或包装破损物品。
    </div>
    <p class="muted">允许共享的典型品类：未拆封的退热贴、碘伏棉片/棉签、无菌纱布、创可贴、口罩、体温计纽扣电池等。</p>

    <h3>三、借用前必须看到的四件事</h3>
    <ol>
      <li><strong>来源</strong>：哪位邻居共享、哪位志愿者审核；社区仅做流转记录。</li>
      <li><strong>效期</strong>：明确有效期；{{ EXPIRY_WARN_DAYS }} 天内黄色提示、{{ EXPIRY_DANGER_DAYS }} 天内红色提示、<strong>{{ EXPIRY_PRIORITY_DAYS }} 天内进入“临期优先流转”</strong>，过期物品大厅自动禁借。</li>
      <li><strong>包装状态</strong>：整盒/整包未开封、封签完好；交接时当场检查，破损立即拒收并拍照反馈。</li>
      <li><strong>适用限制</strong>：仅用于对应场景临时辅助（物理降温、浅表小伤口、口罩应急、护理耗材周转），不替代就医。</li>
    </ol>

    <h3>三（补）、临期物品（≤{{ EXPIRY_PRIORITY_DAYS }} 天）怎么优先流转</h3>
    <ol>
      <li><strong>工作人员清单盯办</strong>：到期前 {{ EXPIRY_PRIORITY_DAYS }} 天自动进入社区工作台“临期优先流转”清单，写明<strong>可使用场景</strong>与<strong>建议优先推荐范围</strong>（登记过急用场景的家庭、同场景候补邻居、24–48 小时内确定要用的人；不推荐“先囤着”）。</li>
      <li><strong>有人借用</strong>：交接页用红字标明到期日，借用人必须逐项勾选<strong>核对效期 → 检查封签 → 检查外观（受潮/变色/渗漏/破损/异味）→ 承诺到期日前使用</strong>，确认记录连同交接照片一并留痕；志愿者代送时当面核对，记录仍记在借用人名下。</li>
      <li><strong>借出后回访</strong>：交接完成即约定 {{ NEAR_EXPIRY_FOLLOWUP_HOURS }} 小时后回访，系统提醒借用人反馈<strong>是否使用、是否剩余、是否需要社区回收</strong>；逾期未反馈工作人员电话催收并可代登记。</li>
      <li><strong>剩余回收</strong>：未用完/未使用的未拆封剩余，可约志愿者上门取或自行送到共享柜，工作人员确认回收后闭环，<strong>回收物品不再流通</strong>；已全部使用则回访后自动核销。</li>
      <li><strong>无人借用</strong>：到期前 {{ NEAR_EXPIRY_OWNER_NOTICE_DAYS }} 天仍无借用/候补，系统提醒共享人<strong>取回在到期日前自行使用，或交社区报废</strong>，避免过期滞留在共享柜。</li>
    </ol>

    <h3>四、一次借用是怎么连起来的</h3>
    <ol>
      <li><strong>登记</strong>：居民填写品名、规格、有效期、存放条件、是否整盒未开封、可借数量、取用地点。</li>
      <li><strong>审核发布</strong>：志愿者核验包装与效期后发布；“其他耗材”需社区工作人员二次复核。</li>
      <li><strong>申请/候补</strong>：按场景筛选后申请；余量不足自动排队，<strong>先确认者先得，确认即锁定库存</strong>，避免一件物品被多人同时拿走。</li>
      <li><strong>交接</strong>：自取 / 志愿者代送 / 邻居门口无接触交接三选一；完成后必须拍照确认。</li>
      <li><strong>归还/补充</strong>：{{ CLOSE_MODE_LABELS.return_sealed }}、{{ CLOSE_MODE_LABELS.restock_new }}，或共享人同意按{{ CLOSE_MODE_LABELS.mutual_aid }}处理。</li>
      <li><strong>报废</strong>：过期、破损或核查不合格的物品由工作人员报废，全程留痕。</li>
    </ol>

    <h3>五、异常情况怎么处理</h3>
    <dl class="kv" style="grid-template-columns: 150px 1fr">
      <dt>效期临近</dt>
      <dd>60/30 天分级提示；≤{{ EXPIRY_PRIORITY_DAYS }} 天进入临期优先流转：工作人员按场景定向推荐、交接强制使用前检查确认、借出后 {{ NEAR_EXPIRY_FOLLOWUP_HOURS }} 小时回访使用/剩余/回收；无人借用于到期前 {{ NEAR_EXPIRY_OWNER_NOTICE_DAYS }} 天提醒共享人取回或报废；过期即自动禁借并等待报废。</dd>
      <dt>多人同时申请</dt>
      <dd>确认时锁定库存，余量不足进入候补队列；取消或归还后按顺序递补。</dd>
      <dt>迟迟未取</dt>
      <dd>确认后超过 {{ PICKUP_WINDOW_HOURS }} 小时未完成交接即标红，志愿者催办后可取消、释放给候补。</dd>
      <dt>配送延误</dt>
      <dd>志愿者代送超过 {{ DELIVERY_SLA_HOURS }} 小时未送达自动标红，志愿者报备原因，工作人员可改派兜底。</dd>
      <dt>共享人撤回</dt>
      <dd>候补申请自动取消；已确认/交接中的借用继续履行，物品不再接受新申请。</dd>
      <dt>包装破损</dt>
      <dd>任何人可反馈，物品立即隔离、进行中的交接暂停，工作人员核查后报废或解封。</dd>
      <dt>疑似不适反应</dt>
      <dd>立即停止使用、就医并反馈；同批次隔离，工作人员回访并按要求上报，社区不提供诊断结论。</dd>
    </dl>

    <h3>六、三类角色各自看什么</h3>
    <ul>
      <li><strong>居民</strong>：按场景找物品、登记共享、申请/候补、交接拍照、归还补充、问题反馈。</li>
      <li><strong>志愿者</strong>：审核物品、代送与改派、催办超时未取、协调候补递补。</li>
      <li><strong>社区工作人员</strong>：风险反馈处置、隔离/报废决策、二次复核、效期清理、全链路追溯与统计。</li>
    </ul>

    <div class="banner banner-info">
      同一件物品的登记、审核、借出、交接、归还、报废与反馈记录在同一条时间线上，三种角色看到的重点不同，但信息互相对得上、可追溯。
    </div>
  </div>
</template>
