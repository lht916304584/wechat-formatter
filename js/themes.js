/**
 * 微信公众号排版 · 元件库
 * 严格遵循 SKILL.md 技术笔记规范，所有样式内联
 * 使用 <div> 标签，微信编辑器兼容
 */

// ===== 主题色板 =====
const PALETTES = {
  tech: {
    label: '科技深蓝',
    primary:   '#1B3A5C',
    accent:    '#2E7DAF',
    pop:       '#5BA4CF',
    bgLight:   '#F0F6FB',
    bgCard:    '#E8F2FA',
    textMain:  '#1A1A2E',
    textSub:   '#4A5568',
    textMute:  '#718096',
    white:     '#FFFFFF',
    border:    '#C5DCF0',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'TECH NOTES · 技术笔记',
    signatureLabel: '技术笔记',
  },
  elegant: {
    label: '文艺雅致',
    primary:   '#5B3A29',
    accent:    '#8B6F47',
    pop:       '#C4A882',
    bgLight:   '#FBF8F4',
    bgCard:    '#F5EDE3',
    textMain:  '#3D2B1F',
    textSub:   '#6B5744',
    textMute:  '#9B8B7A',
    white:     '#FFFFFF',
    border:    '#E0D5C5',
    fontStack: '"Noto Serif SC",Georgia,"PingFang SC",serif',
    coverLabel: 'LITERARY · 文艺雅致',
    signatureLabel: '文艺雅致',
  },
  business: {
    label: '商务简约',
    primary:   '#1A202C',
    accent:    '#2D3748',
    pop:       '#718096',
    bgLight:   '#F7FAFC',
    bgCard:    '#EDF2F7',
    textMain:  '#1A202C',
    textSub:   '#4A5568',
    textMute:  '#A0AEC0',
    white:     '#FFFFFF',
    border:    '#E2E8F0',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'BUSINESS · 商务简约',
    signatureLabel: '商务简约',
  },
  fresh: {
    label: '清新自然',
    primary:   '#276749',
    accent:    '#38A169',
    pop:       '#68D391',
    bgLight:   '#F0FFF4',
    bgCard:    '#E6FFED',
    textMain:  '#1C4532',
    textSub:   '#2D6A4F',
    textMute:  '#6B8F7B',
    white:     '#FFFFFF',
    border:    '#C6F6D5',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'FRESH · 清新自然',
    signatureLabel: '清新自然',
  },
  romantic: {
    label: '浪漫粉紫',
    primary:   '#7B2D5E',
    accent:    '#A8557C',
    pop:       '#D491B8',
    bgLight:   '#FDF2F8',
    bgCard:    '#FCE7F3',
    textMain:  '#4A1D3A',
    textSub:   '#7B4A66',
    textMute:  '#A67E96',
    white:     '#FFFFFF',
    border:    '#E8C8DA',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'ROMANTIC · 浪漫粉紫',
    signatureLabel: '浪漫粉紫',
  },
  vibrant: {
    label: '活力橙黄',
    primary:   '#C05621',
    accent:    '#DD6B20',
    pop:       '#F6AD55',
    bgLight:   '#FFF7ED',
    bgCard:    '#FFEDD5',
    textMain:  '#7C2D12',
    textSub:   '#9C4221',
    textMute:  '#C05621',
    white:     '#FFFFFF',
    border:    '#FBD38D',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'VIBRANT · 活力橙黄',
    signatureLabel: '活力橙黄',
  },
  classic: {
    label: '古典墨绿',
    primary:   '#234E52',
    accent:    '#2C7A7B',
    pop:       '#81E6D9',
    bgLight:   '#E6FFFA',
    bgCard:    '#B2F5EA',
    textMain:  '#1A4044',
    textSub:   '#385C5F',
    textMute:  '#5F8A8D',
    white:     '#FFFFFF',
    border:    '#A7D4D4',
    fontStack: '"Noto Serif SC",Georgia,"PingFang SC",serif',
    coverLabel: 'CLASSIC · 古典墨绿',
    signatureLabel: '古典墨绿',
  },
  minimal: {
    label: '极简黑白',
    primary:   '#171717',
    accent:    '#404040',
    pop:       '#737373',
    bgLight:   '#FAFAFA',
    bgCard:    '#F5F5F5',
    textMain:  '#0A0A0A',
    textSub:   '#525252',
    textMute:  '#A3A3A3',
    white:     '#FFFFFF',
    border:    '#E5E5E5',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'MINIMAL · 极简黑白',
    signatureLabel: '极简黑白',
  },
  warm: {
    label: '温暖焦糖',
    primary:   '#92400E',
    accent:    '#B45309',
    pop:       '#D97706',
    bgLight:   '#FFFBEB',
    bgCard:    '#FEF3C7',
    textMain:  '#451A03',
    textSub:   '#78350F',
    textMute:  '#A16207',
    white:     '#FFFFFF',
    border:    '#FDE68A',
    fontStack: '-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif',
    coverLabel: 'WARM · 温暖焦糖',
    signatureLabel: '温暖焦糖',
  },
};

const RAPHAEL_THEME_SEEDS = [
  ["raphael-apple","Mac","纯净现代的极致留白，适合日常记录的万能首选","#111","#0066cc","#000","#ffffff","#f5f5f7","#1d1d1f","#f5f5f7","#666","#e0e0e0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-claude","Claude","温润的燕麦卡其色底，适合深度长文或文学哲思","#b75c3d","#b75c3d","#b75c3d","#f8f6f0","#f0ece4","#2b2b2b","#2b2b2b","#666","#e0ddd6","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-wechat","微信公众号原生","原汁原味的官方绿底纹，满足传统阅读习惯的稳妥之选","#111","#07c160","#07c160","#ffffff","#f0f7f2","#333333","#f0f7f2","#666","#d8e8dc","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-media","NYT","经典米黄色新闻纸，极强的严肃深度报道专业感","#111","#326891","#000","#fdfaf6","#f0ede8","#000000","#f0ede8","#666","#d5cfc5","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-medium","Medium","简约柔和的西式博客排版，适合生活志与随笔沉淀","#111","#1a8917","#000","#fcfcfc","#f2f3f5","#242424","#242424","#666","#e0e0e0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-stripe","Stripe","前沿的硅谷极客商务风，高悬浮感与高亮视觉系","#111","#635bff","#0a2540","#f6f9fc","#eef0ff","#425466","#eef0ff","#666","#dde0f0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-workspace","飞书效率","沉稳严谨的深蓝配色，适合职场效率与管理方法论","#111","#3370ff","#000","#f7f8fa","#edf1ff","#1f2329","#edf1ff","#666","#dee0e3","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-linear","Linear","纯正的暗夜赛博极客风，编程教程与开发日志的终极归宿","#eee","#5e6ad2","#fff","#101114","#1a1a1a","#f1f1f2","#1a1a1a","#bbb","#333","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-retro","Retro","做旧羊皮纸搭配火漆红，适合人文历史与艺术鉴赏","#8c2211","#8c2211","#8c2211","#f4ecd8","#efe5cc","#2b2621","#efe5cc","#666","#d4c9ae","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-bloomberg","Bloomberg","还原华尔街古老金融终端机，硬派科技代码展示专属","#eee","#ff8c00","#15fa52","#000000","#0a0a0a","#15fa52","#0a0a0a","#bbb","#333","\"SF Mono\", \"Courier New\", Courier, monospace"],
  ["raphael-notion","Notion","极致克制的黑白灰，纯粹信息密度与无干扰写作","#37352f","#37352f","#37352f","#ffffff","#f7f6f3","#37352f","#37352f","#37352f","#e9e9e7","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-github","GitHub","开发者最熟悉的阅读界面，README 即视感","#1f2328","#0969da","#1f2328","#ffffff","#f5f5f5","#1f2328","#1f2328","#1f2328","#d1d9e0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif"],
  ["raphael-sspai","少数派","中文数字媒体标杆，经典红色标识与精致排版","#333333","#d71a1b","#d71a1b","#ffffff","#fef7f7","#333333","#fef7f7","#666","#f0e0e0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-dracula","Dracula","暗紫色赛博吸血鬼美学，粉青撞色的视觉冲击","#ff79c6","#8be9fd","#ffb86c","#282a36","#44475a","#f8f8f2","#44475a","#8be9fd","#6272a4","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-nord","Nord","北欧极地冰霜蓝，冷静克制的极光美学","#81a1c1","#88c0d0","#eceff4","#2e3440","#3b4252","#d8dee9","#3b4252","#a3be8c","#4c566a","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-sakura","樱花","柔粉色系日式美学，温柔感性的少女心表达","#c44569","#c44569","#c44569","#fef7f9","#fceef2","#4a3f4f","#fceef2","#9b7fa7","#f0d4dd","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-ocean","深海","午夜深蓝配珊瑚橘，沉浸式的海洋系叙事感","#feca57","#ff6b6b","#feca57","#0c2233","#152d42","#c8d6e5","#152d42","#78e0a0","#1e3a52","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-mint","薄荷","清凉薄荷绿底色，适合生活方式与健康类内容","#1a7a5a","#1a7a5a","#1a7a5a","#f0faf5","#e0f5ec","#2d4a3e","#e0f5ec","#5a8a72","#c8e6d8","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-sunset","日落","暖琥珀色调的黄昏意境，散文游记与情感表达","#c0582a","#c0582a","#c0582a","#fdf6ee","#f8ead6","#3d2c1e","#f8ead6","#8a6d4b","#e8d4b8","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-monokai","Monokai","经典代码编辑器配色，程序员的终极浪漫","#a6e22e","#66d9ef","#f92672","#272822","#3e3d32","#f8f8f2","#3e3d32","#e6db74","#49483e","\"SF Mono\", \"Fira Code\", Consolas, monospace"],
  ["raphael-solarized","Solarized","经典暖色调开发者配色，柔和护眼的阅读体验","#268bd2","#268bd2","#cb4b16","#fdf6e3","#eee8d5","#657b83","#eee8d5","#93a1a1","#ddd6c1","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-cyberpunk","Cyberpunk","霓虹闪烁的赛博朋克世界，品红与青的极致碰撞","#05d9e8","#05d9e8","#ff2a6d","#0d0221","#1a0a3e","#e0e0ff","#1a0a3e","#05d9e8","#2a1a4e","\"SF Mono\", \"Fira Code\", Consolas, monospace"],
  ["raphael-ink","水墨","纯粹的黑白水墨风，零色彩干扰的极简阅读","#000000","#111111","#000000","#ffffff","#f0f0f0","#111111","#111111","#555555","#cccccc","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-lavender","薰衣草","梦幻紫色调的浪漫氛围，诗意与灵感的温柔表达","#7c5cad","#6b4c9a","#6b4c9a","#f5f0ff","#ece4ff","#3d3155","#ece4ff","#8a6dba","#ddd0f0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-forest","密林","深邃的暗绿色丛林，自然与神秘感的沉浸式叙事","#a8d8a8","#7dce82","#7dce82","#1a2e1a","#243824","#c8dcc8","#243824","#a0c8a0","#3a5a3a","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-glacier","冰川","清冽的冰蓝色调，冷静理性的科技分析与报告","#1976d2","#1976d2","#1565c0","#eef4fa","#e1eef6","#2c3e50","#e1eef6","#5a7a9a","#c8dce8","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
  ["raphael-coffee","咖啡","醇厚巧克力棕色调，午后咖啡馆的温暖书卷气","#5d4037","#6d4c41","#4e342e","#f5efe6","#ece2d4","#3e2723","#ece2d4","#795548","#d7ccc8","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-bauhaus","Bauhaus","包豪斯三原色风格，红蓝黄碰撞的现代主义先锋","#004d9f","#004d9f","#e30613","#ffffff","#fff4d6","#1a1a1a","#fff4d6","#555","#1a1a1a","\"Helvetica Neue\", Helvetica, Arial, sans-serif"],
  ["raphael-copper","赤铜","暗夜中的青铜古韵，深沉温暖的金属质感暗色调","#c49070","#e8a87c","#e8a87c","#1c1410","#2a1e16","#d4b896","#2a1e16","#b89878","#3a2a1e","Georgia, \"Times New Roman\", Times, serif"],
  ["raphael-pastel","彩虹糖","多彩柔和的马卡龙色系，活泼甜美的少年感表达","#7ab8d0","#7ab8d0","#e07a94","#fefcf8","#f0ecff","#4a4a5a","#f0ecff","#9b8ec4","#e8e0f0","-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"],
];

RAPHAEL_THEME_SEEDS.forEach(([id, label, description, primary, accent, pop, bgLight, bgCard, textMain, textSub, textMute, border, fontStack]) => {
  PALETTES[id] = {
    label,
    description,
    source: 'Raphael',
    primary,
    accent,
    pop,
    bgLight,
    bgCard,
    textMain,
    textSub,
    textMute,
    white: '#FFFFFF',
    border,
    fontStack,
    coverLabel: `${label.toUpperCase()} · RAPHAEL`,
    signatureLabel: label,
  };
});

let TECH_PALETTE = PALETTES.tech;

function setActivePalette(name) {
  if (PALETTES[name]) TECH_PALETTE = PALETTES[name];
}

/**
 * 根据文本内容自动匹配主题色板
 */
function detectContentPalette(content) {
  const text = (content || '').substring(0, 3000);
  const scores = { tech: 0, growth: 0, business: 0, lifestyle: 0, romantic: 0, vibrant: 0, classic: 0, minimal: 0, warm: 0 };

  const wordSets = {
    tech: ['编程','AI','人工智能','代码','技术','开发','程序','API','算法','软件',
      'Python','Java','前端','后端','数据库','服务器','架构','框架','机器学习','深度学习',
      'ChatGPT','GPT','大模型','提示词','prompt','函数','变量','接口','部署','调试',
      'HTML','CSS','JavaScript','React','Vue','开源','GitHub','自动化','工具','数据整理',
      'OpenClaw','科技','程序员','产品经理','迭代','测试','运维'],
    growth: ['成长','认知','觉醒','自律','习惯','思维','复盘','人生','哲学','独立',
      '自由','突破','改变','进步','提升','努力','坚持','目标','梦想','勇气','焦虑','情绪',
      '心态','压力','内耗','自我','灵魂','修行','感悟','反思','智慧','女性','她力量',
      '独立女性','自信','赋能','蜕变','精进','格局','境界','力量','活出','成为',
      '接纳','和解','原生家庭','创伤','治愈','温柔','坚强','姐妹','女神'],
    business: ['管理','营销','团队','战略','增长','商业','创业','市场','品牌','客户',
      '销售','投资','财富','赚钱','副业','变现','利润','运营','流量','转化','融资',
      '产品','用户','竞争','行业','趋势','估值','商业模式','CEO','领导力','职场'],
    lifestyle: ['旅行','生活','故事','散文','诗意','电影','音乐',
      '穿搭','护肤','健身','瑜伽','冥想','养生','宠物',
      '周末','下午茶','记录','日常','小确幸','慢生活'],
    romantic: ['爱情','浪漫','情感','婚姻','恋爱','心动','约会','礼物','仪式感','幸福感',
      '闺蜜','告白','情侣','玫瑰','甜蜜','告白','情书','陪伴','相守','缘分','相思','唯美'],
    vibrant: ['干货','知识','学习','效率','技能','方法论','经验','总结','指南','攻略',
      '必看','强烈推荐','揭秘','重磅','福利','优惠','抢购','限时','速成','逆袭','爆款'],
    classic: ['历史','文化','经典','传统','古风','诗词','哲学','思考','深度','洞察',
      '沉淀','国学','人文','艺术','鉴赏','传承','古籍','典故','文明','遗产','书法','水墨'],
    minimal: ['设计','摄影','极简','美学','建筑','灵感','创意','作品集','排版','视觉',
      '空间','光影','黑白','线条','几何','色调','构图','留白','质感','高级','简约'],
    warm: ['美食','烘焙','咖啡','家居','厨房','晚餐','早餐','食谱','味道',
      '手绘','手工','花','下厨','料理','甜点','奶茶','餐桌','温馨','治愈','烟火气'],
  };

  function countHits(words) {
    return words.reduce((n, w) => {
      const m = text.match(new RegExp(w, 'gi'));
      return n + (m ? m.length : 0);
    }, 0);
  }

  for (const cat of Object.keys(wordSets)) scores[cat] = countHits(wordSets[cat]);

  const max = Math.max(...Object.values(scores));
  if (max === 0) return 'elegant';

  const winner = Object.keys(scores).find(k => scores[k] === max);
  const map = {
    tech: 'tech', growth: 'elegant', business: 'business', lifestyle: 'fresh',
    romantic: 'romantic', vibrant: 'vibrant', classic: 'classic', minimal: 'minimal', warm: 'warm'
  };
  return map[winner] || 'elegant';
}

// ===== 样式辅助函数 =====
const Style = {
  // 通用卡片外壳（标题栏 + 内容区）
  card(p, headerHtml, bodyHtml, bodyBg = p.white) {
    return `<div style="margin:20px 0;border:1px solid ${p.border};border-radius:8px;overflow:hidden;">
  ${headerHtml ? `<div style="background:${p.primary};padding:10px 16px;font-size:12px;font-weight:600;color:${p.white};letter-spacing:1px;">${headerHtml}</div>` : ''}
  <div style="background:${bodyBg};">${bodyHtml}</div>
</div>`;
  },

  // 代码块外壳（深色背景）
  codeBox(p, lang, codeHtml) {
    return `<div style="margin:20px 0;border-radius:8px;overflow:hidden;">
  <div style="background:${p.primary};padding:8px 16px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:12px;color:${p.pop};letter-spacing:1px;">${lang || 'CODE'}</span>
  </div>
  <div style="background:#0D1F33;padding:20px;overflow-x:auto;">
    <pre style="margin:0;font-size:13px;line-height:1.7;font-family:'Courier New',Courier,monospace;white-space:pre-wrap;word-break:break-all;">${codeHtml}</pre>
  </div>
</div>`;
  },

  // 文本行
  row(text, color, size = '13px', lineHeight = '1.7') {
    return `<div style="font-size:${size};color:${color};line-height:${lineHeight};">${text}</div>`;
  },

  // 提示框（信息 / 警告 / 技巧）
  callout(bg, borderColor, titleColor, title, content, textColor) {
    return `<div style="background:${bg};border-left:4px solid ${borderColor};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
  <div style="font-size:12px;font-weight:600;color:${titleColor};letter-spacing:1px;margin-bottom:6px;">${title}</div>
  <div style="font-size:14px;line-height:1.8;color:${textColor};">${content}</div>
</div>`;
  },

  // 数字徽章（步骤序号）
  numberBadge(num, bg, color, size = '32px', fontSize = '13px', radius = '50%') {
    return `<div style="width:${size};height:${size};background:${bg};border-radius:${radius};display:flex;align-items:center;justify-content:center;font-size:${fontSize};font-weight:700;color:${color};flex-shrink:0;">${num}</div>`;
  },

  // 圆点列表项
  dotItem(dotColor, content, textColor) {
    return `<div style="display:flex;align-items:flex-start;margin-bottom:10px;">
  <div style="width:6px;height:6px;background:${dotColor};border-radius:50%;margin-top:7px;margin-right:10px;flex-shrink:0;"></div>
  <div style="font-size:14px;color:${textColor};line-height:1.7;">${content}</div>
</div>`;
  },

  // 列容器（对比卡等）
  col(content, border, bg, padding = '16px', flex = '1', marginRight = '') {
    const mr = marginRight ? `margin-right:${marginRight};` : '';
    return `<div style="flex:${flex};border:${border};border-radius:8px;padding:${padding};background:${bg};${mr}">${content}</div>`;
  }
};

// ===== 元件 HTML 生成器 =====
const Components = {

  // ---------- B 系 · 基础元件 ----------

  // B01 · 封面
  cover(title, subtitle, date, author) {
    const p = TECH_PALETTE;
    return `<div style="background:linear-gradient(135deg,${p.primary} 0%,${p.accent} 100%);padding:48px 32px 40px;text-align:center;border-radius:0;">
  <div style="font-size:28px;font-weight:700;color:${p.white};line-height:1.4;margin-bottom:12px;">${title}</div>
  ${subtitle ? `<div style="font-size:13px;color:${p.pop};margin-bottom:8px;">${subtitle}</div>` : ''}
</div>`;
  },

  // B02 · 正文段落
  paragraph(content) {
    const p = TECH_PALETTE;
    const fs = p._fontSize || 15;
    const lh = p._lineHeight || 1.9;
    const gap = p._paraSpacing || 20;
    return `<p style="font-size:${fs}px;line-height:${lh};color:${p.textMain};margin:0 0 ${gap}px;padding:0 4px;">${content}</p>`;
  },

  // B03 · h2 二级标题
  h2(title) {
    const p = TECH_PALETTE;
    const h2s = p._h2Size || 18;
    return `<div style="margin:32px 0 16px;">
  <div style="display:flex;align-items:center;">
    <div style="width:4px;height:22px;background:${p.primary};border-radius:2px;flex-shrink:0;margin-right:10px;"></div>
    <div style="font-size:${h2s}px;font-weight:700;color:${p.primary};">${title}</div>
  </div>
</div>`;
  },

  // B04 · h3 三级标题
  h3(title) {
    const p = TECH_PALETTE;
    const h3s = p._h3Size || 15;
    return `<div style="margin:24px 0 12px;">
  <span style="font-size:${h3s}px;font-weight:600;color:${p.accent};border-bottom:2px solid ${p.pop};padding-bottom:2px;">${title}</span>
</div>`;
  },

  // B05 · callout-info 信息提示框
  calloutInfo(content) {
    const p = TECH_PALETTE;
    return Style.callout(p.bgCard, p.accent, p.accent, '💡 NOTE', content, p.textMain);
  },

  // B06 · callout-warning 警告框
  calloutWarning(content) {
    const p = TECH_PALETTE;
    return Style.callout('#FFF8E6', '#E6A817', '#B8860B', '⚠️ 注意', content, p.textMain);
  },

  // B07 · callout-tip 技巧框
  calloutTip(content) {
    const p = TECH_PALETTE;
    return Style.callout('#F0FBF4', '#38A169', '#276749', '✅ TIP', content, p.textMain);
  },

  // callout-success 成功框
  calloutSuccess(content) {
    const p = TECH_PALETTE;
    return Style.callout('#F0FFF4', '#2F855A', '#22543D', '🎉 成功', content, p.textMain);
  },

  // callout-error 错误区
  calloutError(content) {
    const p = TECH_PALETTE;
    return Style.callout('#FFF5F5', '#C53030', '#742A2A', '❌ 错误', content, p.textMain);
  },

  // B08 · tag-list 标签组
  tagList(tags) {
    const p = TECH_PALETTE;
    const tagsHtml = tags.map(tag =>
      `<span style="background:${p.bgCard};color:${p.accent};font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid ${p.border};margin-right:8px;margin-bottom:8px;display:inline-block;">${tag}</span>`
    ).join('');
    return `<div style="margin:16px 0;">${tagsHtml}</div>`;
  },

  // B09 · divider 分割线
  divider(label) {
    const p = TECH_PALETTE;
    if (label) {
      return `<div style="margin:32px 0;display:flex;align-items:center;">
  <div style="flex:1;height:1px;background:${p.border};"></div>
  <div style="font-size:11px;color:${p.textMute};letter-spacing:2px;margin-left:12px;margin-right:12px;">${label}</div>
  <div style="flex:1;height:1px;background:${p.border};"></div>
</div>`;
    }
    return `<div style="margin:28px 0;height:1px;background:${p.border};"></div>`;
  },

  // B10 · quote 引用块
  quote(quote, source) {
    const p = TECH_PALETTE;
    return `<div style="margin:24px 0;padding:20px 24px;background:${p.bgLight};border-radius:8px;">
  <div style="font-size:32px;color:${p.border};line-height:1;margin-bottom:8px;">\u201C</div>
  <div style="font-size:15px;line-height:1.8;color:${p.textMain};font-style:italic;">${quote}</div>
  ${source ? `<div style="margin-top:12px;font-size:12px;color:${p.textMute};">\u2014 ${source}</div>` : ''}
</div>`;
  },

  // B11 · outro 结语
  outro(message, date) {
    const p = TECH_PALETTE;
    return `<div style="background:${p.primary};padding:32px;text-align:center;border-radius:8px;margin-top:40px;">
  <div style="font-size:13px;color:#A8C8E8;line-height:1.8;margin-bottom:16px;">${message}</div>
  <div style="width:40px;height:1px;background:${p.pop};margin:0 auto 16px;"></div>
  <div style="font-size:11px;color:${p.pop};letter-spacing:2px;">${p.coverLabel.split(' · ')[0]}${date ? ' · ' + date : ''}</div>
</div>`;
  },

  // B12 · signature 签名档
  signature(author, date) {
    const p = TECH_PALETTE;
    return `<div style="margin-top:32px;padding:16px 0;border-top:1px solid ${p.border};text-align:center;">
  <div style="display:inline-block;width:40px;height:3px;background:${p.accent};border-radius:2px;"></div>
</div>`;
  },

  // ---------- S 系 · 结构元件 ----------

  // S01 · framework-card 框架卡
  frameworkCard(title, rows) {
    const p = TECH_PALETTE;
    const bodyHtml = rows.map(row =>
      `<div style="padding:10px 20px;border-bottom:1px solid ${p.bgCard};font-size:14px;color:${p.textMain};line-height:1.7;">${row}</div>`
    ).join('');
    return Style.card(p, title, bodyHtml);
  },

  // S02 · process-flow 流程图（竖向时间线）
  processFlow(steps) {
    const p = TECH_PALETTE;
    return steps.map((step, i) =>
      `<div style="display:flex;margin-bottom:4px;">
  <div style="display:flex;flex-direction:column;align-items:center;margin-right:16px;">
    ${Style.numberBadge(i + 1, p.accent, p.white)}
    ${i < steps.length - 1 ? `<div style="width:2px;flex:1;background:${p.border};margin-top:4px;"></div>` : ''}
  </div>
  <div style="padding-top:6px;padding-bottom:20px;">
    <div style="font-size:14px;font-weight:600;color:${p.primary};margin-bottom:4px;">${step.title || ''}</div>
    <div style="font-size:13px;color:${p.textSub};line-height:1.7;">${step.desc || step}</div>
  </div>
</div>`
    ).join('');
  },

  // S03 · comparison-cards 对比卡
  comparisonCards(leftTitle, leftItems, rightTitle, rightItems) {
    const p = TECH_PALETTE;
    const itemsHtml = (items) => items.map(item =>
      `<div style="font-size:13px;color:${p.textMain};padding:4px 0;border-bottom:1px solid #E2EDF7;">${item}</div>`
    ).join('');
    const header = (title) => `<div style="font-size:12px;font-weight:600;color:${p.accent};margin-bottom:10px;letter-spacing:1px;">${title}</div>`;
    const leftContent = header(leftTitle) + itemsHtml(leftItems);
    const rightContent = header(rightTitle) + itemsHtml(rightItems);
    return `<div style="display:flex;margin:20px 0;">
  ${Style.col(leftContent, `1px solid ${p.border}`, p.bgLight, '16px', '1', '12px')}
  ${Style.col(rightContent, `1px solid ${p.border}`, p.bgLight)}
</div>`;
  },

  // ---------- T 系 · 教程元件 ----------

  // T01 · goal-list 目标清单（📌 本文你将学到）
  goalList(items) {
    const p = TECH_PALETTE;
    const itemsHtml = items.map(item => Style.dotItem(p.accent, item, p.textMain)).join('');
    return `<div style="background:${p.bgCard};border-radius:10px;padding:20px 24px;margin:20px 0;">
  <div style="font-size:12px;font-weight:600;color:${p.accent};letter-spacing:2px;margin-bottom:14px;">📌 本文你将学到</div>
  ${itemsHtml}
</div>`;
  },

  // T02 · code-block 代码块（带语法高亮）
  codeBlock(code, lang, filename) {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return Style.codeBox(TECH_PALETTE, lang, `<code style="color:#A8C8E8;">${escaped}</code>`);
  },

  // T02 with highlight.js · 语法高亮代码块
  codeBlockHighlighted(code, lang) {
    let highlighted;
    try {
      if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(code, { language: lang }).value;
      } else if (typeof hljs !== 'undefined') {
        highlighted = hljs.highlightAuto(code).value;
      } else {
        highlighted = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
    } catch (e) {
      highlighted = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return Style.codeBox(TECH_PALETTE, lang, `<code class="hljs">${highlighted}</code>`);
  },

  // 行内代码
  codespan(text) {
    const p = TECH_PALETTE;
    return `<code style="background:${p.bgCard};padding:2px 6px;border-radius:3px;font-size:90%;font-family:'Courier New',Courier,monospace;color:${p.accent};">${text}</code>`;
  },

  // ---------- W 系 · 工作流元件 ----------

  // W01 · step-card 步骤卡（横向卡片，浅蓝底色）
  stepCards(steps) {
    const p = TECH_PALETTE;
    return steps.map((step, i) =>
      `<div style="display:flex;margin:16px 0;padding:16px;background:${p.bgLight};border-radius:8px;">
  ${Style.numberBadge(i + 1, p.primary, p.white, '36px', '14px', '6px')}
  <div style="margin-left:16px;">
    <div style="font-size:14px;font-weight:600;color:${p.primary};margin-bottom:4px;">${step.title || ''}</div>
    <div style="font-size:13px;color:${p.textSub};line-height:1.7;">${step.desc || step}</div>
  </div>
</div>`
    ).join('');
  },

  // ---------- R 系 · 测评元件 ----------

  // R01 · spec-table 参数表
  specTable(title, rows) {
    const p = TECH_PALETTE;
    const rowsHtml = rows.map((row, i) => {
      const bg = i % 2 === 0 ? p.bgLight : p.white;
      return `<div style="display:flex;background:${bg};">
  <div style="width:35%;padding:10px 16px;font-size:13px;color:${p.textSub};border-right:1px solid ${p.border};">${row.key}</div>
  <div style="flex:1;padding:10px 16px;font-size:13px;color:${p.textMain};">${row.value}</div>
</div>`;
    }).join('');
    return Style.card(p, title, rowsHtml);
  },

  // 通用表格（从 markdown table 渲染）
  table(headerCells, bodyRows) {
    const p = TECH_PALETTE;
    const headerHtml = headerCells.map(cell =>
      `<div style="flex:1;padding:10px 12px;font-size:13px;font-weight:600;color:${p.white};">${cell}</div>`
    ).join('');
    const bodyHtml = bodyRows.map((row, ri) => {
      const bg = ri % 2 === 0 ? p.bgLight : p.white;
      const rowHtml = row.map(cell =>
        `<div style="flex:1;padding:10px 12px;font-size:13px;color:${p.textMain};">${cell}</div>`
      ).join('');
      return `<div style="display:flex;background:${bg};border-top:1px solid ${p.border};">${rowHtml}</div>`;
    }).join('');
    return Style.card(p, `<div style="display:flex;">${headerHtml}</div>`, bodyHtml);
  },

  // ---------- 列表 ----------

  // 任务列表 (- [ ] / - [x])
  taskList(items) {
    const p = TECH_PALETTE;
    const itemsHtml = items.map(item => {
      const checked = item.checked;
      const icon = checked
        ? `<div style="width:18px;height:18px;background:${p.primary};border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:#fff;font-size:12px;">✓</span></div>`
        : `<div style="width:18px;height:18px;border:2px solid ${p.border};border-radius:4px;flex-shrink:0;"></div>`;
      const textStyle = checked
        ? `font-size:14px;color:${p.textMute};line-height:1.8;text-decoration:line-through;`
        : `font-size:14px;color:${p.textMain};line-height:1.8;`;
      return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        ${icon}
        <div style="${textStyle}">${item.text}</div>
      </div>`;
    }).join('');
    return `<div style="margin:16px 0;padding:16px 20px;background:${p.bgLight};border-radius:8px;">${itemsHtml}</div>`;
  },

  // 有序/无序列表
  list(items, ordered) {
    const p = TECH_PALETTE;
    const tag = ordered ? 'ol' : 'ul';
    const itemsHtml = items.map(item =>
      `<li style="margin-bottom:8px;line-height:1.8;font-size:14px;color:${p.textMain};">${item}</li>`
    ).join('');
    return `<${tag} style="padding-left:24px;margin-bottom:16px;">${itemsHtml}</${tag}>`;
  },

  // S05 · nested-list 层级列表
  nestedList(items) {
    const p = TECH_PALETTE;
    return `<div style="margin:16px 0;padding:16px 20px;background:${p.bgLight};border-radius:8px;">
  ${items.map(item => {
    if (typeof item === 'string') {
      return `<div style="font-size:14px;font-weight:600;color:${p.primary};padding:6px 0;">${item}</div>`;
    }
    const html = `<div style="font-size:14px;font-weight:600;color:${p.primary};padding:6px 0;">${item.text}</div>`;
    const childrenHtml = (item.children || []).map(child =>
      `<div style="font-size:13px;color:${p.textSub};padding:4px 0;">${child}</div>`
    ).join('');
    return html + (childrenHtml ? `<div style="padding-left:16px;border-left:2px solid ${p.border};margin:4px 0 4px 8px;">${childrenHtml}</div>` : '');
  }).join('')}
</div>`;
  },

  // ---------- 文本样式 ----------

  strong(text) {
    return `<strong style="font-weight:bold;color:${TECH_PALETTE.primary};">${text}</strong>`;
  },

  em(text) {
    return `<em style="font-style:italic;color:${TECH_PALETTE.accent};">${text}</em>`;
  },

  del(text) {
    return `<del style="text-decoration:line-through;color:${TECH_PALETTE.textMute};">${text}</del>`;
  },

  link(text) {
    return `<span style="color:${TECH_PALETTE.accent};border-bottom:1px solid ${TECH_PALETTE.accent};">${text}</span>`;
  },

  image(src, alt) {
    const p = TECH_PALETTE;
    let html = `<img src="${src}" alt="${alt || ''}" style="width:100%;display:block;margin:16px 0;border-radius:4px;" />`;
    if (alt) {
      html += `<p style="text-align:center;font-size:12px;color:${p.textMute};margin:0 0 16px;">${alt}</p>`;
    }
    return html;
  },

  // ---------- N 系 · 笔记本元件 ----------

  // N04 · section-divider 章节分割
  sectionDivider(label) {
    return `<div style="margin:36px 0 24px;text-align:center;">
  <div style="font-size:11px;letter-spacing:4px;color:${TECH_PALETTE.accent};text-transform:uppercase;">\u2014 ${label} \u2014</div>
</div>`;
  },

  // N02 · sticky-note 便签
  stickyNote(content) {
    return `<div style="background:#FFF9E6;border-left:3px solid #E6A817;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;font-size:13px;color:#744210;line-height:1.7;">${content}</div>`;
  },

  // ---------- E 系 · 散文元件 ----------

  // E02 · motto-card 格言卡
  mottoCard(motto, author) {
    const p = TECH_PALETTE;
    return `<div style="margin:28px 0;padding:24px 32px;border-top:3px solid ${p.primary};border-bottom:1px solid ${p.border};background:${p.bgLight};">
  <div style="font-size:17px;font-weight:600;color:${p.primary};line-height:1.7;letter-spacing:0.5px;">${motto}</div>
  ${author ? `<div style="margin-top:10px;font-size:12px;color:${p.textMute};">${author}</div>` : ''}
</div>`;
  },

  // ---------- D 系 · 数据元件 ----------

  // D03 · before-after 前后对比
  beforeAfter(beforeDesc, beforeValue, afterDesc, afterValue) {
    return `<div style="margin:20px 0;border:1px solid ${TECH_PALETTE.border};border-radius:10px;overflow:hidden;">
  <div style="display:flex;">
    <div style="flex:1;padding:20px;background:#FFF5F5;border-right:1px solid ${TECH_PALETTE.border};">
      <div style="font-size:11px;font-weight:600;color:#9B2C2C;letter-spacing:2px;margin-bottom:12px;">BEFORE · 之前</div>
      <div style="font-size:13px;color:${TECH_PALETTE.textMain};line-height:1.7;">${beforeDesc}</div>
      ${beforeValue ? `<div style="margin-top:12px;font-size:20px;font-weight:700;color:#9B2C2C;">${beforeValue}</div>` : ''}
    </div>
    <div style="flex:1;padding:20px;background:#F0FBF4;">
      <div style="font-size:11px;font-weight:600;color:#276749;letter-spacing:2px;margin-bottom:12px;">AFTER · 之后</div>
      <div style="font-size:13px;color:${TECH_PALETTE.textMain};line-height:1.7;">${afterDesc}</div>
      ${afterValue ? `<div style="margin-top:12px;font-size:20px;font-weight:700;color:#276749;">${afterValue}</div>` : ''}
    </div>
  </div>
</div>`;
  },
};
