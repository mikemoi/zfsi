/* ZFSI 训练界面：低决策首页 → 专注训练 → 就地反馈。 */
const App = (() => {
  const $ = s => document.querySelector(s);
  const el = {};
  const state = { typeIndex:0,current:null,lastId:null,shownAt:0,inputMode:'typed',groupN:0,groupTimes:[],answered:false,lastResult:null,inSession:false };
  let speedTimer = null, recog = null, lastAudioUrl = null;

  function cacheDom(){ Object.assign(el,{
    header:$('#appHeader'),bottomNav:$('#bottomNav'),home:$('#practiceHome'),session:$('#practiceSession'),
    greeting:$('#greeting'),todayCount:$('#todayCount'),homeToday:$('#homeToday'),homeDue:$('#homeDue'),homeAvg:$('#homeAvg'),homeProgress:$('#homeProgress'),recommendTitle:$('#recommendTitle'),recommendMeta:$('#recommendMeta'),
    typeBadge:$('#typeBadge'),levelBadge:$('#levelBadge'),tagBadge:$('#tagBadge'),questionLabel:$('#questionLabel'),context:$('#context'),prompt:$('#prompt'),
    input:$('#answer'),submit:$('#submitBtn'),mic:$('#micBtn'),answerArea:$('#answerArea'),feedback:$('#feedback'),verdict:$('#verdict'),canonical:$('#canonical'),note:$('#note'),
    actuallyRight:$('#actuallyRightBtn'),listen:$('#listenBtn'),groupCount:$('#groupCount'),groupAvg:$('#groupAvg'),progress:$('#progressFill'),speedHint:$('#speedHint'),responseTime:$('#responseTime'),
    typeSwitch:$('#typeSwitch'),typeDialog:$('#typeDialog')
  }); }
  function groupSize(){return Settings.get().groupSize} function currentType(){return DRILL_ORDER[state.typeIndex]} function poolOf(t){return DECK.filter(d=>d.type===t)}

  function homeStats(){
    const attempts=Store.allAttempts(), today=Store.todayCount(), elapsed=attempts.map(a=>a.elapsed_ms).filter(Boolean);
    const avg=elapsed.length?elapsed.reduce((a,b)=>a+b,0)/elapsed.length/1000:null;
    el.todayCount.textContent=`今天 ${today} 题`; el.homeToday.textContent=today; el.homeDue.textContent=attempts.length;
    el.homeAvg.textContent=avg?`${avg.toFixed(1)} 秒`:'—'; el.homeProgress.textContent=`${groupSize()} 题`;
    el.recommendTitle.textContent=`继续练习「${DRILL_LABELS[currentType()]}」`; el.recommendMeta.textContent=`约 ${Math.max(5,Math.round(groupSize()*.6))} 分钟 · 专注完成一组`;
    const h=new Date().getHours(); el.greeting.textContent=h<11?'早上好':h<18?'下午好':'晚上好';
  }
  function startSession(){ state.inSession=true;el.home.hidden=true;el.session.hidden=false;el.header.hidden=true;el.bottomNav.hidden=true;nextQuestion(); }
  function exitSession(){ clearTimeout(speedTimer);state.inSession=false;el.session.hidden=true;el.home.hidden=false;el.header.hidden=false;el.bottomNav.hidden=false;homeStats(); }

  function nextQuestion(){
    clearTimeout(speedTimer); const type=currentType(),item=pickNext(poolOf(type),Store.getSrs,state.lastId); if(!item)return;
    state.current=item;state.lastId=item.id;state.answered=false;state.lastResult=null;state.shownAt=Date.now();
    el.typeBadge.textContent=DRILL_LABELS[type];el.levelBadge.textContent=item.level;el.tagBadge.hidden=item.tag!=='contrast_pair';
    el.context.textContent=item.context||'';el.context.hidden=!item.context;el.prompt.textContent=item.prompt;
    el.questionLabel.textContent=type==='substitution'?'替换后说出完整句子':type==='response'?'直接回应':'请用西班牙语回答';
    el.input.value='';el.input.disabled=false;el.answerArea.hidden=false;el.feedback.hidden=true;el.speedHint.hidden=true;el.submit.textContent='检查';
    updateStats(); setTimeout(()=>el.input.focus(),50);
    speedTimer=setTimeout(()=>{if(!state.answered)el.speedHint.hidden=false},3000);
  }
  async function submit(){
    if(state.answered){advance();return} if(!state.current||!el.input.value.trim())return;
    clearTimeout(speedTimer);const raw=el.input.value,elapsed=Date.now()-state.shownAt,item=state.current,extra=Store.getExtraAccepted(item.id);
    let {verdict}=judgeLocal(raw,item,extra);if(verdict==='wrong'||item.judge==='ai'){const ai=await judgeAI(raw,item);if(ai&&ai.verdict)verdict=ai.verdict}finalizeAttempt(verdict,elapsed,raw);
  }
  function finalizeAttempt(verdict,elapsed,raw){
    const item=state.current;state.answered=true;state.lastResult={verdict,elapsed,raw};el.input.disabled=true;
    const q=qualityFromResult(verdict,state.inputMode,elapsed);Store.setSrs(item.id,sm2(Store.getSrs(item.id),q));
    Store.logAttempt({at:Date.now(),id:item.id,type:item.type,prompt:item.prompt,answer:raw,verdict,accent_only:verdict==='accent',input_mode:state.inputMode,elapsed_ms:elapsed,q});
    if(typeof API!=='undefined'&&API.configured())API.mirror({drill_id:item.id,drill_type:item.type,prompt:item.prompt,user_answer:raw,verdict,accent_only:verdict==='accent',input_mode:state.inputMode,elapsed_ms:elapsed});
    state.groupN++;state.groupTimes.push(elapsed);renderFeedback(verdict,item,elapsed);if(Settings.get().autoSpeak)speak(item.canonical);updateStats();
  }
  function renderFeedback(verdict,item,elapsed){
    el.answerArea.hidden=true;el.feedback.hidden=false;el.feedback.className='feedback '+verdict;
    el.verdict.textContent={correct:'✓ 正确',accent:'基本正确，注意重音',wrong:'再看一下'}[verdict];el.canonical.textContent=item.canonical;
    const note=item._aiNote||item.note||'';el.note.textContent=note;el.note.hidden=!note;el.actuallyRight.hidden=verdict!=='wrong';
    el.responseTime.textContent=`反应时间 ${(elapsed/1000).toFixed(1)} 秒`;el.submit.textContent='下一题';el.submit.focus();
  }
  function markActuallyRight(){if(!state.lastResult)return;Store.addAccepted(state.current.id,normalize(state.lastResult.raw));Store.setSrs(state.current.id,sm2(Store.getSrs(state.current.id),4));renderFeedback('correct',state.current,state.lastResult.elapsed);el.actuallyRight.hidden=true}
  function advance(){if(state.groupN>=groupSize()){state.typeIndex=(state.typeIndex+1)%DRILL_ORDER.length;state.groupN=0;state.groupTimes=[];flashToast(`接下来：${DRILL_LABELS[currentType()]}`)}nextQuestion()}

  function buildTypeSwitch(){
    el.typeSwitch.innerHTML='';DRILL_ORDER.forEach((type,i)=>{const b=document.createElement('button');b.className='step';b.innerHTML=`<span class="step-n">${i+1}</span><span class="step-name">${DRILL_LABELS[type]}</span><span class="step-state">${i===state.typeIndex?'当前':i<state.typeIndex?'完成':''}</span>`;
      b.onclick=()=>{state.typeIndex=i;state.groupN=0;state.groupTimes=[];updateStepper();homeStats();el.typeDialog.close();if(state.inSession)nextQuestion()};el.typeSwitch.appendChild(b)});updateStepper();
  }
  function updateStepper(){[...el.typeSwitch.children].forEach((c,i)=>{c.classList.toggle('active',i===state.typeIndex);c.classList.toggle('done',i<state.typeIndex);c.querySelector('.step-state').textContent=i===state.typeIndex?'当前':i<state.typeIndex?'完成':''})}
  function updateStats(){el.groupCount.textContent=`${state.groupN} / ${groupSize()}`;el.progress.style.width=`${Math.min(100,state.groupN/groupSize()*100)}%`;el.todayCount.textContent=`今天 ${Store.todayCount()} 题`;updateStepper()}
  function flashToast(msg){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1600)}

  async function speak(text){if(typeof API!=='undefined'&&API.configured()){try{const blob=await API.ttsAudio(text);if(lastAudioUrl)URL.revokeObjectURL(lastAudioUrl);lastAudioUrl=URL.createObjectURL(blob);await new Audio(lastAudioUrl).play();return}catch{}}if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='es-ES';u.rate=.95;speechSynthesis.speak(u)}
  function initVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){el.mic.disabled=true;el.mic.title='此浏览器不支持语音';return}if(!window.isSecureContext){el.mic.title='语音需要 HTTPS';return}recog=new SR();recog.lang='es-ES';recog.interimResults=false;recog.maxAlternatives=1;recog.onresult=e=>{el.input.value=e.results[0][0].transcript;state.inputMode='voice';submit()};recog.onend=()=>el.mic.classList.remove('listening');recog.onerror=ev=>{el.mic.classList.remove('listening');flashToast(ev.error==='not-allowed'||ev.error==='service-not-allowed'?'需要麦克风权限':'语音出错，请重试')}}
  function toggleVoice(){if(state.answered)return;if(!window.isSecureContext){flashToast('语音需要 HTTPS（用域名访问时可用）');return}if(!recog){flashToast('此浏览器不支持语音');return}state.inputMode='voice';el.mic.classList.add('listening');try{recog.start()}catch{el.mic.classList.remove('listening')}}

  function renderReview(){const s=Stats.compute(),att=Store.allAttempts(),wrong=att.filter(a=>a.verdict==='wrong').length,slow=att.filter(a=>a.elapsed_ms>6000).length;$('#reviewActions').innerHTML=`<button class="review-action" data-type="current"><span>继续当前阶段</span><span>${DRILL_LABELS[currentType()]} →</span></button><button class="review-action"><span>最近答错</span><span>${wrong} 题</span></button><button class="review-action"><span>反应偏慢</span><span>${slow} 题</span></button>`;$('#reviewActions [data-type]').onclick=()=>{showView('practice');startSession()};Scenarios.render($('#scenariosBody'))}
  function showView(v){document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));['practice','review','profile'].forEach(k=>$(`#view-${k}`).hidden=k!==v);if(v==='review')renderReview();if(v==='profile'){Stats.render($('#statsBody'));Settings.render($('#settingsBody'),()=>{state.inputMode=Settings.get().defaultMode;homeStats();updateStats()})}}
  function bind(){
    $('#startPracticeBtn').onclick=startSession;$('#exitSessionBtn').onclick=exitSession;$('#chooseTypeBtn').onclick=()=>el.typeDialog.showModal();$('#sessionTypeBtn').onclick=()=>el.typeDialog.showModal();$('#closeTypeDialog').onclick=()=>el.typeDialog.close();
    el.submit.onclick=()=>{if(!state.answered)state.inputMode='typed';submit()};el.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}});el.actuallyRight.onclick=markActuallyRight;el.listen.onclick=()=>state.current&&speak(state.current.canonical);el.mic.onclick=toggleVoice;
    document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  }
  function init(){cacheDom();state.inputMode=Settings.get().defaultMode;bind();buildTypeSwitch();initVoice();homeStats();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})}
  return{init,currentTypeName:()=>currentType()};
})();
document.addEventListener('DOMContentLoaded',()=>Auth.gate(App.init));
