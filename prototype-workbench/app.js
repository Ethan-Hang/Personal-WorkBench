const variants = {
  A: { name: '周历指挥台', render: renderA },
  B: { name: '今日执行舱', render: renderB },
  C: { name: '规划画布', render: renderC },
};

const nav = (active, compact = false) => `
  <aside class="sidebar">
    <div class="brand"><span class="brand-mark">序</span><span><strong>个人工作台</strong><small>把计划变成行动</small></span></div>
    <div class="nav-group"><div class="nav-label">工作</div>
      ${navItem('⌂', '工作台', active === 'dashboard', compact)}
      ${navItem('□', '收集箱', active === 'inbox', compact, '4')}
      ${navItem('▦', '周日历', active === 'calendar', compact)}
    </div>
    <div class="nav-group"><div class="nav-label">成长</div>
      ${navItem('◎', '目标', active === 'goals', compact)}
      ${navItem('✓', '习惯', active === 'habits', compact)}
      ${navItem('◇', '总结', active === 'reviews', compact)}
    </div>
    <div class="sidebar-footer">本地数据已保存<br>上次备份：3 天前</div>
  </aside>`;

function navItem(icon, label, active, compact, badge = '') {
  return `<div class="nav-item ${active ? 'active' : ''}" title="${label}"><span class="nav-icon">${icon}</span><span>${label}</span>${badge && !compact ? `<span class="badge">${badge}</span>` : ''}</div>`;
}

const topbar = (eyebrow, title, action = '+ 新建任务') => `
  <header class="topbar">
    <div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>
    <div class="top-actions"><button class="ghost-button">搜索 ⌘ K</button><button class="primary-button">${action}</button><div class="avatar">我</div></div>
  </header>`;

const task = (title, meta, chip = '', chipClass = '') => `
  <div class="task-row"><button class="check" aria-label="完成任务"></button><div><div class="task-title">${title}</div><div class="task-meta">${meta}</div></div>${chip ? `<span class="chip ${chipClass}">${chip}</span>` : ''}</div>`;

function renderA() {
  const days = ['周一 3', '周二 4', '周三 5', '周四 6', '周五 7', '周六 8', '周日 9'];
  const heads = days.map((d, i) => `<div class="day-head ${i === 0 ? 'today' : ''}"><small>${d.split(' ')[0]}</small><strong>${d.split(' ')[1]}</strong></div>`).join('');
  const allDay = [0,1,2,3,4,5,6].map(i => `<div class="day-cell">${i === 3 ? '<div class="all-day-task">⚑ 报告截止</div>' : ''}</div>`).join('');
  const columns = [
    '<div class="event done" style="top:18px;height:54px">晨间规划<br>09:00</div><div class="event goal-event" style="top:126px;height:80px">工作台原型<br>11:00 · 90 分钟</div>',
    '<div class="event" style="top:72px;height:54px">项目例会<br>10:00</div>',
    '<div class="event goal-event" style="top:234px;height:108px">完成数据模型<br>13:00 · 2 小时</div>',
    '<div class="event" style="top:126px;height:54px">周中回顾<br>11:00</div>',
    '<div class="event goal-event" style="top:288px;height:80px">撰写周总结<br>14:00</div>', '', ''
  ];
  return `<div class="app-shell variant-a">${nav('calendar')}<main class="main">
    ${topbar('2026 年 8 月', '本周计划 · 周历指挥台')}
    <div class="a-layout"><section class="panel week-grid">
      <div class="panel-header">
        <div class="week-toolbar">
          <button class="icon-button" title="上一周">‹</button>
          <strong>2026 年 第 32 周 (8 月 3 日—9 日)</strong>
          <button class="icon-button" title="下一周">›</button>
          <button class="ghost-button">今天</button>
          <button class="ghost-button" title="快速切换年份和周次">2026年 第32周 ▾</button>
          <button class="ghost-button" title="选择具体日期锁定周">🎯 定位日期</button>
        </div>
        <div><span class="chip">7 个计划 · 2 已完成</span></div>
      </div>
      <div class="days"><div></div>${heads}</div>
      <div class="all-day"><div class="time-label">全天</div>${allDay}</div>
      <div class="calendar-body"><div>${['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map(x=>`<div class="time-label" style="height:54px">${x}</div>`).join('')}</div>${columns.map(x=>`<div class="day-cell">${x}</div>`).join('')}</div>
    </section>
    <aside class="side-stack">
      <section class="panel"><div class="panel-header"><div><h2>待排程抽屉</h2><small>4 项待安排</small></div><button class="text-button">整理</button></div><div class="side-content">
        ${task('预约年度体检','录入于今天', '未安排')}${task('更新读书清单','个人事务')}${task('购买显示器支架','生活')}
        <button class="inbox-add">＋ 快速记录一件事 (待排程)</button>
      </div></section>
      <section class="panel"><div class="panel-header"><div><h2>今日习惯</h2><small>2 / 3 已完成</small></div><span class="chip good">67%</span></div><div class="side-content">
        <div class="habit-row"><span class="habit-icon">✓</span><span>阅读 30 分钟</span><span class="chip good">完成</span></div>
        <div class="habit-row"><span class="habit-icon">✓</span><span>运动</span><span class="chip good">完成</span></div>
        <div class="habit-row"><span class="habit-icon">○</span><span>晚间复盘</span><span class="chip">待完成</span></div>
      </div></section>
    </aside></div>
  </main></div>`;
}

function renderB() {
  return `<div class="app-shell variant-b">${nav('dashboard', true)}<main class="main">
    <div class="focus-shell"><section>
      <header><div class="focus-date">8 月 3 日 · 星期一</div><h1 class="focus-title">上午好，今天专注三件事。</h1><p class="focus-sub">你有 5 个计划任务，预计需要 5 小时 20 分钟。</p></header>
      <div class="panel focus-card"><div class="focus-card-header"><div><h2>今日时间线</h2><small>按计划执行时间排列</small></div><button class="primary-button">＋ 添加</button></div><div class="focus-list">
        ${focusTask('09:00','晨间规划','已完成 · 30 分钟','完成')}
        ${focusTask('10:00','完成工作台界面原型','进行中 · 预计 90 分钟','当前', true)}
        ${focusTask('13:30','整理产品需求决策','目标：个人工作台 MVP','待开始')}
        ${focusTask('15:00','运动 45 分钟','习惯 · 本周 1 / 3','习惯')}
        ${focusTask('20:30','晚间复盘','习惯 · 每日','习惯')}
      </div><div class="unscheduled"><h3>快速收集</h3><div class="quick-add"><input placeholder="想到什么，先记下来……"><button class="primary-button">加入收集箱</button></div></div></div>
    </section><aside class="focus-aside">
      <section class="panel daily-score"><small>今日执行度</small><div class="score">42%</div><p>已完成 2 项，当前任务已进行 35 分钟。保持节奏，不必追赶。</p><div class="rings"><div class="ring">任务<br>2/5</div><div class="ring">习惯<br>1/3</div><div class="ring">时间<br>2.1h</div></div></section>
      <section class="panel"><div class="panel-header"><h2>目标推进</h2><button class="text-button">全部</button></div><div class="aside-content">
        ${goalBrief('发布个人工作台 MVP', '38%')}${goalBrief('建立稳定运动习惯', '61%')}
      </div></section>
      <section class="panel review-prompt"><span class="chip warning">周总结 · 待填写</span><h2 style="margin-top:12px">这一周，什么最值得保留？</h2><p>系统已汇总 18 个完成任务和 76% 的习惯完成率。</p><button class="ghost-button">开始 10 分钟复盘 →</button></section>
    </aside></div>
  </main></div>`;
}

function focusTask(time, title, meta, chip, current = false) {
  return `<div class="focus-task ${current ? 'current' : ''}"><div class="focus-time">${time}${current ? '<div class="now-marker">现在</div>' : ''}</div><button class="check"></button><div><div class="task-title">${title}</div><div class="task-meta">${meta}</div></div><span class="chip ${chip === '完成' ? 'good' : ''}">${chip}</span></div>`;
}
function goalBrief(title, value) {
  return `<div class="goal-brief"><div class="goal-brief-top"><strong>${title}</strong><span>${value}</span></div><div class="progress"><span style="width:${value}"></span></div></div>`;
}

function renderC() {
  return `<div class="app-shell variant-c">${nav('goals')}<main class="main">
    <header class="planning-header"><div><div class="eyebrow">目标周期 · 7 月 15 日—9 月 30 日</div><h1>从目标，看见本周行动</h1></div><div class="planning-tabs"><button>全部目标</button><button class="active">进行中</button><button>已归档</button></div></header>
    <div class="kpi-row"><div class="panel kpi"><div class="kpi-label">活跃目标</div><div class="kpi-value">3</div><small>本周 2 个有进展</small></div><div class="panel kpi"><div class="kpi-label">里程碑完成</div><div class="kpi-value">4 / 11</div><small>本周新增 1 个</small></div><div class="panel kpi"><div class="kpi-label">关联任务</div><div class="kpi-value">18</div><small>7 项已完成</small></div><div class="panel kpi"><div class="kpi-label">习惯完成率</div><div class="kpi-value">76%</div><small>较上周 +8%</small></div></div>
    <div class="plan-layout"><section class="panel goal-canvas">
      <div class="goal-overview"><div><span class="chip">核心目标</span><h2>发布个人工作台 MVP</h2><p>在 9 月底前完成可持续使用的本地个人工作台</p></div><div style="text-align:right"><div class="goal-number">38%</div><small style="color:var(--muted)">剩余 58 天</small></div></div>
      <div class="milestones">
        ${milestone('明确产品需求','已完成 · 7 月 30 日',['定义核心闭环','冻结 MVP 范围'],100)}
        ${milestone('验证交互与视觉','进行中 · 目标 8 月 9 日',['比较三种工作台布局','确认周历交互','确定视觉方向'],55)}
        ${milestone('建立基础应用','未开始 · 目标 8 月 23 日',['初始化项目','本地数据层','任务 CRUD'],0,true)}
        ${milestone('完成执行闭环','未开始 · 目标 9 月 15 日',['周日历','习惯打卡','周月总结'],0,true)}
      </div>
    </section><aside class="plan-side">
      <section class="panel week-strip"><div style="display:flex;justify-content:space-between"><div><h2>本周投入</h2><small style="color:var(--muted)">目标关联任务</small></div><span class="chip">7 项</span></div><div class="week-days">${['一','二','三','四','五','六','日'].map((x,i)=>`<div class="week-day ${i===0?'today':''}"><small>周${x}</small><strong>${i+3}</strong><div>${Array.from({length:[2,1,2,1,1,0,0][i]},()=>'<span class="task-pip"></span>').join('')}</div></div>`).join('')}</div><button class="ghost-button" style="width:100%;margin-top:13px">打开周日历 →</button></section>
      <section class="panel"><div class="panel-header"><div><h2>今日习惯</h2><small>建立稳定节奏</small></div><strong>2 / 3</strong></div><div class="aside-content"><div class="habit-row"><span class="habit-icon">✓</span><span>阅读</span><span class="chip good">完成</span></div><div class="habit-row"><span class="habit-icon">✓</span><span>运动</span><span class="chip good">完成</span></div><div class="habit-row"><span class="habit-icon">○</span><span>晚间复盘</span><span class="chip">待完成</span></div></div></section>
      <section class="panel reflection"><div style="display:flex;justify-content:space-between"><h2>上周留下的话</h2><span class="chip">周总结</span></div><blockquote>“少规划功能，多完成一次真实的使用闭环。先让每天的安排足够顺手。”</blockquote><div class="reflection-meta"><span>7 月 27 日—8 月 2 日</span><button class="text-button">查看总结</button></div></section>
    </aside></div>
  </main></div>`;
}

function milestone(title, meta, tasks, progress, future = false) {
  return `<div class="milestone ${future ? 'future' : ''}"><div class="milestone-head"><h3>${title}</h3><span class="chip ${progress === 100 ? 'good' : ''}">${progress}%</span></div><p>${meta}</p><div class="milestone-tasks">${tasks.map((x,i)=>`<span class="mini-task ${progress===100 || (progress>0&&i===0) ? 'done' : ''}">${progress===100 || (progress>0&&i===0) ? '✓ ' : ''}${x}</span>`).join('')}</div></div>`;
}

const keys = Object.keys(variants);
let current = new URLSearchParams(location.search).get('variant')?.toUpperCase();
if (!variants[current]) current = 'A';
function show(key) {
  current = key;
  document.getElementById('app').innerHTML = variants[key].render();
  document.getElementById('variant-label').textContent = `${key} — ${variants[key].name}`;
  const url = new URL(location.href); url.searchParams.set('variant', key); history.replaceState({}, '', url);
}
function cycle(direction) { show(keys[(keys.indexOf(current) + direction + keys.length) % keys.length]); }
document.getElementById('previous').addEventListener('click', () => cycle(-1));
document.getElementById('next').addEventListener('click', () => cycle(1));
document.addEventListener('keydown', event => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  if (event.key === 'ArrowLeft') cycle(-1);
  if (event.key === 'ArrowRight') cycle(1);
});
show(current);
