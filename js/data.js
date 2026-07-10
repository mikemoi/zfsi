/* ============================================================
   内置题库 —— A1-A2 西班牙本土日常真实用语（非游客、非课本）
   题型顺序（难度梯度）：
     chunk_fixed  固定块闪认
     substitution 替换
     expansion    扩展
     transformation 转换
     response     回应
   字段说明：
     id, type, level, tag(可选: contrast_pair)
     context   卡片上方的语境行（base / source / 无）
     prompt    提示词 / 指令 / 中文情境
     canonical 标准答案（显示用，带正确重音）
     accepted  除标准答案外、其它“真正不同”的可接受说法（也要带正确重音）
               —— 不要在这里放“去掉重音”的版本！漏重音由判定器自动降级为
                  “对，但提醒重音”，放进来反而会让漏重音被判成完全正确。
     note      简短纠正提示
     judge     'local' 本地判定即可 / 'ai' 建议交 AI（第2步先都本地兜底）
   ============================================================ */

const DECK = [

  /* ---------- chunk_fixed 固定块闪认（看中文，秒出整块）---------- */
  { id:'chk_01', type:'chunk_fixed', level:'A1', context:'', prompt:'（回应）没关系 / 没事', canonical:'No pasa nada.', accepted:[], note:'万能安慰/回应，西班牙人天天说', judge:'local' },
  { id:'chk_02', type:'chunk_fixed', level:'A1', context:'', prompt:'好的 / 行（口语最常用）', canonical:'Vale.', accepted:[], note:'西班牙特有，比 “de acuerdo” 更日常', judge:'local' },
  { id:'chk_03', type:'chunk_fixed', level:'A1', context:'', prompt:'（问候）怎么样？还好吗？', canonical:'¿Qué tal?', accepted:[], note:'比 ¿Cómo estás? 更随意', judge:'local' },
  { id:'chk_04', type:'chunk_fixed', level:'A2', context:'', prompt:'我无所谓 / 都行', canonical:'Me da igual.', accepted:[], note:'表达不在乎哪个选项', judge:'local' },
  { id:'chk_05', type:'chunk_fixed', level:'A2', context:'', prompt:'马上 / 现在就', canonical:'Ahora mismo.', accepted:[], note:'', judge:'local' },
  { id:'chk_06', type:'chunk_fixed', level:'A2', context:'', prompt:'（解释开头）是这样的… / 问题是…', canonical:'Es que...', accepted:[], note:'找借口/解释时的开场白', judge:'local' },
  { id:'chk_07', type:'chunk_fixed', level:'A2', context:'', prompt:'我完全不知道', canonical:'No tengo ni idea.', accepted:['ni idea'], note:'', judge:'local' },
  { id:'chk_08', type:'chunk_fixed', level:'A2', context:'', prompt:'（接电话）喂？请讲', canonical:'¿Dígame?', accepted:['diga'], note:'西班牙接电话的标准说法', judge:'local' },
  { id:'chk_09', type:'chunk_fixed', level:'A2', context:'', prompt:'真烦 / 真无聊（抱怨）', canonical:'Qué rollo.', accepted:['vaya rollo'], note:'rollo=无聊/麻烦事，很地道', judge:'local' },
  { id:'chk_10', type:'chunk_fixed', level:'A2', context:'', prompt:'我很忙 / 我忙不过来', canonical:'Estoy liado.', accepted:['estoy liada'], note:'liado 比 ocupado 更口语（女性用 liada）', judge:'local' },

  /* ---------- substitution 替换（换一个成分）---------- */
  { id:'sub_01', type:'substitution', level:'A1', context:'Necesito comprar pan.', prompt:'leche', canonical:'Necesito comprar leche.', accepted:[], note:'', judge:'local' },
  { id:'sub_02', type:'substitution', level:'A1', context:'Necesito comprar pan.', prompt:'huevos', canonical:'Necesito comprar huevos.', accepted:[], note:'', judge:'local' },
  { id:'sub_03', type:'substitution', level:'A2', context:'Voy al médico mañana.', prompt:'dentista', canonical:'Voy al dentista mañana.', accepted:[], note:'dentista 阳性 → al', judge:'local', tag:'contrast_pair' },
  { id:'sub_04', type:'substitution', level:'A2', context:'Voy al médico mañana.', prompt:'peluquería', canonical:'Voy a la peluquería mañana.', accepted:[], note:'peluquería 阴性 → a la（不是 al）', judge:'local', tag:'contrast_pair' },
  { id:'sub_05', type:'substitution', level:'A2', context:'Estoy cansado.', prompt:'ella', canonical:'Está cansada.', accepted:['ella está cansada'], note:'ella → está + 阴性 cansada', judge:'local', tag:'contrast_pair' },
  { id:'sub_06', type:'substitution', level:'A2', context:'Estoy cansado.', prompt:'nosotros', canonical:'Estamos cansados.', accepted:['nosotros estamos cansados'], note:'nosotros → estamos + 复数 cansados', judge:'local', tag:'contrast_pair' },
  { id:'sub_07', type:'substitution', level:'A2', context:'¿Me pones una caña?', prompt:'un café', canonical:'¿Me pones un café?', accepted:[], note:'caña=小杯生啤，酒吧点单常用句', judge:'local' },
  { id:'sub_08', type:'substitution', level:'A2', context:'¿Me pones una caña?', prompt:'dos cañas', canonical:'¿Me pones dos cañas?', accepted:[], note:'', judge:'local' },
  { id:'sub_09', type:'substitution', level:'A2', context:'He quedado con Ana.', prompt:'mis amigos', canonical:'He quedado con mis amigos.', accepted:[], note:'quedar con=和…约见面（不是“留下”）', judge:'local' },
  { id:'sub_10', type:'substitution', level:'A2', context:'No me gusta el café.', prompt:'las madrugadas', canonical:'No me gustan las madrugadas.', accepted:[], note:'复数主语 → gustan（动词变复数）', judge:'local', tag:'contrast_pair' },

  /* ---------- expansion 扩展（往框架里加成分）---------- */
  { id:'exp_01', type:'expansion', level:'A1', context:'Quiero un café.', prompt:'+ con leche', canonical:'Quiero un café con leche.', accepted:[], note:'', judge:'local' },
  { id:'exp_02', type:'expansion', level:'A1', context:'Quiero un café con leche.', prompt:'+ por favor', canonical:'Quiero un café con leche, por favor.', accepted:[], note:'', judge:'local' },
  { id:'exp_03', type:'expansion', level:'A2', context:'He quedado con María.', prompt:'+ esta tarde', canonical:'He quedado con María esta tarde.', accepted:[], note:'', judge:'local' },
  { id:'exp_04', type:'expansion', level:'A2', context:'He quedado con María esta tarde.', prompt:'+ para tomar algo', canonical:'He quedado con María esta tarde para tomar algo.', accepted:[], note:'tomar algo=喝一杯/吃点东西', judge:'local' },
  { id:'exp_05', type:'expansion', level:'A2', context:'Voy a casa.', prompt:'+ andando', canonical:'Voy a casa andando.', accepted:[], note:'andando=走路（副动词表方式）', judge:'local' },
  { id:'exp_06', type:'expansion', level:'A2', context:'No puedo ir.', prompt:'+ porque estoy liado', canonical:'No puedo ir porque estoy liado.', accepted:['no puedo ir porque estoy liada'], note:'', judge:'local' },
  { id:'exp_07', type:'expansion', level:'A2', context:'Mañana trabajo.', prompt:'+ hasta las ocho', canonical:'Mañana trabajo hasta las ocho.', accepted:[], note:'', judge:'local' },
  { id:'exp_08', type:'expansion', level:'A2', context:'Mañana trabajo hasta las ocho.', prompt:'+ y luego voy al gimnasio', canonical:'Mañana trabajo hasta las ocho y luego voy al gimnasio.', accepted:[], note:'luego=之后', judge:'local' },

  /* ---------- transformation 转换（改语法结构）---------- */
  { id:'trf_01', type:'transformation', level:'A1', context:'Como carne.', prompt:'变否定句', canonical:'No como carne.', accepted:[], note:'', judge:'local' },
  { id:'trf_02', type:'transformation', level:'A1', context:'Hablas español.', prompt:'变疑问句', canonical:'¿Hablas español?', accepted:[], note:'', judge:'local' },
  { id:'trf_03', type:'transformation', level:'A2', context:'Voy al cine.', prompt:'变现在完成时（he...）', canonical:'He ido al cine.', accepted:[], note:'ir 的分词是 ido', judge:'local' },
  { id:'trf_04', type:'transformation', level:'A2', context:'Compro el pan.', prompt:'把 el pan 换成代词 lo', canonical:'Lo compro.', accepted:[], note:'直接宾语代词提到动词前', judge:'local', tag:'contrast_pair' },
  { id:'trf_05', type:'transformation', level:'A2', context:'Escribo la carta.', prompt:'把 la carta 换成代词 la', canonical:'La escribo.', accepted:[], note:'阴性宾语 → la（对照 lo）', judge:'local', tag:'contrast_pair' },
  { id:'trf_06', type:'transformation', level:'A2', context:'Tengo que trabajar.', prompt:'变否定句', canonical:'No tengo que trabajar.', accepted:[], note:'', judge:'local' },
  { id:'trf_07', type:'transformation', level:'A2', context:'Está lloviendo.', prompt:'变疑问句', canonical:'¿Está lloviendo?', accepted:[], note:'', judge:'local' },
  { id:'trf_08', type:'transformation', level:'A2', context:'Comemos a las dos.', prompt:'变将来（用 ir a）', canonical:'Vamos a comer a las dos.', accepted:[], note:'ir a + 原形 表最近将来', judge:'local' },

  /* ---------- response 回应（情境刺激 → 立刻恰当回应；开放题）---------- */
  { id:'rsp_01', type:'response', level:'A1', context:'', prompt:'有人不小心踩到你，跟你说 “perdón”。你回应“没关系”。', canonical:'No pasa nada.', accepted:['tranquilo','tranquila','nada nada'], note:'', judge:'ai' },
  { id:'rsp_02', type:'response', level:'A1', context:'', prompt:'朋友问你要不要去喝一杯，你答应。', canonical:'Vale, vamos.', accepted:['vale','claro','venga','venga vamos'], note:'venga 也是西班牙很地道的“走吧/来吧”', judge:'ai' },
  { id:'rsp_03', type:'response', level:'A2', context:'', prompt:'服务员问你要点什么，你要一杯加奶咖啡。', canonical:'Un café con leche, por favor.', accepted:['un café con leche','me pones un café con leche'], note:'', judge:'ai' },
  { id:'rsp_04', type:'response', level:'A2', context:'', prompt:'你朋友烟抽得太凶，你叫他“别抽那么多”。', canonical:'No fumes tanto.', accepted:['no fumes tanto tabaco','deja de fumar tanto','no fumes más'], note:'否定命令用虚拟式 fumes', judge:'ai' },
  { id:'rsp_05', type:'response', level:'A2', context:'', prompt:'路人问路，但你不知道怎么走。', canonical:'Lo siento, no lo sé.', accepted:['no lo sé','no tengo ni idea','lo siento, no soy de aquí','no soy de aquí'], note:'“no soy de aquí”=我不是本地人，很自然', judge:'ai' },
  { id:'rsp_06', type:'response', level:'A2', context:'', prompt:'朋友迟到了向你道歉，你让他别担心、没事。', canonical:'No pasa nada, tranquilo.', accepted:['tranquilo','no te preocupes','no pasa nada'], note:'', judge:'ai' },
  { id:'rsp_07', type:'response', level:'A2', context:'', prompt:'你想让对方稍等一下。', canonical:'Espera un momento.', accepted:['un momento','espera','un segundo','dame un segundo'], note:'', judge:'ai' },
  { id:'rsp_08', type:'response', level:'A2', context:'', prompt:'电话响了，你接起来说“喂？”', canonical:'¿Dígame?', accepted:['sí, dígame','diga','¿sí?'], note:'西班牙接电话不说 hola', judge:'ai' },

];

// 题型梯度顺序（用于自动切换）
const DRILL_ORDER = ['chunk_fixed', 'substitution', 'expansion', 'transformation', 'response'];

const DRILL_LABELS = {
  chunk_fixed:   '固定块闪认',
  substitution:  '替换',
  expansion:     '扩展',
  transformation:'转换',
  response:      '回应',
};

// 阶梯步骤用的短标签
const DRILL_SHORT = {
  chunk_fixed:   '闪认',
  substitution:  '替换',
  expansion:     '扩展',
  transformation:'转换',
  response:      '回应',
};
