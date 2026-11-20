const KEY='execution-manager-v02';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0)+' ج.م';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const uid=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalizeState(raw){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 let projects=Array.isArray(raw.projects)?raw.projects.filter(x=>x&&typeof x==='object'):[];
 if(!projects.length)projects=[{id:'p1',name:'المشروع الأول',rate:10}];
 projects=projects.map((p,i)=>({...p,id:p.id||uid('prj'),name:String(p.name||('المشروع '+(i+1))),rate:Number.isFinite(Number(p.rate))?Number(p.rate):10}));
 const current=projects.some(p=>p.id===raw.current)?raw.current:projects[0].id;
 const rows=k=>Array.isArray(raw[k])?raw[k].filter(x=>x&&typeof x==='object'):[];
 const collections=rows('collections').map(x=>{const amount=Number(x.amount)||0,rate=Number(x.rate)||0;return {...x,id:x.id||uid('col'),project:x.project||x.projectId||current,amount,rate,reserved:x.reserved!=null&&Number.isFinite(Number(x.reserved))?Number(x.reserved):amount*rate/100,date:x.date||''}});
 const expenses=rows('expenses').map(x=>({...x,id:x.id||uid('ex'),projectId:x.projectId||x.project||current,item:x.item||'',amount:Number(x.amount)||0,kind:x.kind||'legacy',itemId:x.itemId||'',payee:x.payee||'',payeeId:x.payeeId||'',type:x.type==='خامات'?'materials':x.type==='مصنعية'?'labor':(x.type||'other')}));
 const items=rows('items').map(x=>({...x,id:x.id||uid('item'),projectId:x.projectId||current,aliases:Array.isArray(x.aliases)?x.aliases:[]}));
 const contractors=rows('contractors').map(x=>({...x,id:x.id||uid('con'),projectId:x.projectId||current,aliases:Array.isArray(x.aliases)?x.aliases:[]}));
 const payments=rows('payments').map(x=>({...x,id:x.id||uid('pay'),projectId:x.projectId||x.project||current,itemId:x.itemId||'',contractorId:x.contractorId||'',amount:Number(x.amount)||0,type:x.type==='خامات'?'materials':x.type==='مصنعية'?'labor':(x.type||'labor'),date:x.date||'',note:x.note||''}));
 return {...raw,projects,current,collections,expenses,items,contractors,payments};
}
function loadState(){
 const readStored=key=>{
  let stored=null;try{stored=localStorage.getItem(key)}catch{return null}
  if(!stored)return null;
  try{return JSON.parse(stored)}catch{try{localStorage.setItem(KEY+'.recovery.'+Date.now(),stored)}catch{}return null}
 };
 let raw=readStored(KEY);
 if(!raw)raw=readStored('execution-manager-v01');
 if(!raw)raw={projects:[{id:'p1',name:'المشروع الأول',rate:10}],current:'p1'};
 return normalizeState(raw);
}
let state=loadState();
let selectedSheet='';
function workspaceHistory(level,page=''){
 return {emWorkspace:true,level,page,project:state.current};
}
function pushWorkspaceHistory(level,page=''){
 if(window.history?.pushState)window.history.pushState(workspaceHistory(level,page),'',window.location.href);
}
function replaceWorkspaceHistory(level,page=''){
 if(window.history?.replaceState)window.history.replaceState(workspaceHistory(level,page),'',window.location.href);
}
function applyWorkspaceHistory(entry){
 restoreInlineSheet();
 selectedSheet=entry?.level==='selected'||entry?.level==='expanded'?entry.page||'':'';
 expandedSheet=entry?.level==='expanded'?entry.page||'':'';
 if(entry?.project&&state.projects.some(p=>p.id===entry.project)&&state.current!==entry.project){state.current=entry.project;save()}
 if(entry?.level==='home'){showProjectHome(true);return}
 if(!['sheets','selected','expanded'].includes(entry?.level)){showProjectHome(true);return}
 document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='projectSheets'));
 $('appShell')?.setAttribute('data-hub','sheets');document.body.dataset.hub='sheets';
 const p=project();$('hubProjectTitle').textContent=p.name;$('hubProjectMeta').textContent='مساحة تنفيذ المشروع · '+currentItems().length+' بند';
 renderProjectSheets();
}
function goWorkspaceBack(){
 if(window.history?.state?.emWorkspace&&window.history.state.level!=='home'){window.history.back();return}
 if(document.body.dataset.hub==='sheets')showProjectHome(true);
}
window.addEventListener?.('popstate',e=>{
 if(e.state?.emWorkspace){applyWorkspaceHistory(e.state);return}
 if(document.body.dataset.hub==='sheets')showProjectHome(true);
});
function enableWorkspaceSwipeBack(){
 let start=null;
 document.addEventListener?.('touchstart',e=>{
  if(document.body.dataset.hub!=='sheets'||e.touches.length!==1)return;
  const x=e.touches[0].clientX,w=window.innerWidth||document.documentElement.clientWidth;
  if(x<28||x>w-28)start={x,y:e.touches[0].clientY};
 },{passive:true});
 document.addEventListener?.('touchend',e=>{
  if(!start)return;
  const end=e.changedTouches[0],dx=end.clientX-start.x,dy=end.clientY-start.y,from=start.x;
  start=null;
  if(Math.abs(dy)>85||Math.abs(dx)<70)return;
  const width=window.innerWidth||document.documentElement.clientWidth;
  if((from<28&&dx>70)||(from>width-28&&dx< -70))goWorkspaceBack();
 },{passive:true});
}
enableWorkspaceSwipeBack();
function project(){return state.projects.find(p=>p.id===state.current)||state.projects[0]}
let storageWarned=false;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageWarned=false}catch(err){if(!storageWarned){storageWarned=true;alert('تعذر حفظ البيانات على هذا الجهاز (المساحة ممتلئة أو التخزين غير متاح). التغييرات ظاهرة الآن فقط، فصدّر نسخة احتياطية قبل إغلاق الصفحة.')}}render();if(typeof renderReports==='function')renderReports()}
function currentItems(){return state.items.filter(x=>x.projectId===state.current)}
function currentContractors(){return state.contractors.filter(x=>x.projectId===state.current)}
function itemById(id){return state.items.find(x=>x.id===id)}
function contractorById(id){return state.contractors.find(x=>x.id===id)}
function paymentsForItem(id,type){return state.payments.filter(p=>p.projectId===state.current&&p.itemId===id&&(!type||p.type===type))}
function expensesForItem(id,type){
 const item=itemById(id);if(!item)return [];
 return state.expenses.filter(x=>x.projectId===state.current&&(x.itemId===id||(!x.itemId&&normArabic(x.item)===normArabic(item.name)))&&(!type||x.type===type));
}
function itemMovements(id,type){
 const payments=paymentsForItem(id,type).map(x=>({...x,ledger:'payment',person:contractorById(x.contractorId)?.name||'مستلم غير محدد'}));
 const expenses=expensesForItem(id,type).map(x=>({...x,ledger:'expense',person:x.payee||contractorById(x.payeeId)?.name||'مستلم غير محدد'}));
 return [...payments,...expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
function paidForItem(id,type){return itemMovements(id,type).reduce((s,x)=>s+x.amount,0)}
function movementPersonKey(id,name){
 if(id)return 'id:'+id;
 const matched=name?findNamedRecord(currentContractors(),name):null;
 return matched?'id:'+matched.id:'name:'+normArabic(name||'');
}
function findDuplicateMovement({itemId='',item='',type,amount,date,personId='',personName='',ignoreId=''}){
 const itemKey=itemId?'id:'+itemId:'name:'+normArabic(item||'');
 const personKey=movementPersonKey(personId,personName);
 const matches=[
  ...state.expenses.filter(x=>x.projectId===state.current).map(x=>({id:x.id,ledger:'expense',itemKey:x.itemId?'id:'+x.itemId:'name:'+normArabic(x.item||''),personKey:movementPersonKey(x.payeeId,x.payee),type:x.type,amount:x.amount,date:x.date})),
  ...state.payments.filter(x=>x.projectId===state.current).map(x=>({id:x.id,ledger:'payment',itemKey:x.itemId?'id:'+x.itemId:'name:',personKey:movementPersonKey(x.contractorId,contractorById(x.contractorId)?.name),type:x.type,amount:x.amount,date:x.date}))
 ];
 return matches.find(x=>x.id!==ignoreId&&x.itemKey===itemKey&&x.personKey===personKey&&x.type===type&&x.date===date&&Math.abs(Number(x.amount)-Number(amount))<.005)||null;
}
function confirmNoDuplicateMovement(data){
 const match=findDuplicateMovement(data);
 return !match||confirm('يوجد تسجيل بنفس البند والشخص والنوع والمبلغ والتاريخ في سجل '+(match.ledger==='payment'?'الدفعات':'المصروفات')+'. هل تريد تسجيل حركة أخرى بنفس البيانات؟');
}
function agreement(item,type){return Number(item?.[type==='materials'?'materialsAmount':'laborAmount']||0)}
function spentForProject(){const direct=state.expenses.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);const paid=state.payments.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);return direct+paid}
function setPage(page){restoreInlineSheet();expandedSheet='';selectedSheet='';document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==page));document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('moreNavButton')?.classList.toggle('active',['collections','expenses','settings'].includes(page));$('appShell')?.setAttribute('data-hub','project');document.body.dataset.hub='project';if(['dashboard','items','contractors','collections','expenses'].includes(page))renderReports();$('moreNavMenu')?.classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function showProjectHome(fromPop=false){restoreInlineSheet();expandedSheet='';selectedSheet='';document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='projectHome'));$('appShell')?.setAttribute('data-hub','home');document.body.dataset.hub='home';renderProjectCards();if(!fromPop)replaceWorkspaceHistory('home');window.scrollTo({top:0,behavior:'smooth'})}
function showProjectSheets(){restoreInlineSheet();expandedSheet='';selectedSheet='';document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='projectSheets'));$('appShell')?.setAttribute('data-hub','sheets');document.body.dataset.hub='sheets';const p=project();$('hubProjectTitle').textContent=p.name;$('hubProjectMeta').textContent='مساحة تنفيذ المشروع · '+currentItems().length+' بند';renderProjectSheets();pushWorkspaceHistory('sheets');window.scrollTo({top:0,behavior:'smooth'})}
function renderProjectCards(){const colors=['var(--sheet-1)','var(--sheet-2)','var(--sheet-3)','var(--sheet-4)','var(--sheet-5)','var(--sheet-6)'];$('projectCards').innerHTML=state.projects.map((p,i)=>{const count=state.items.filter(x=>x.projectId===p.id).length;return '<button class="project-tile" data-open-project="'+esc(p.id)+'" style="background:'+colors[i%colors.length]+'"><small>PROJECT '+String(i+1).padStart(2,'0')+'</small><strong>'+esc(p.name)+'</strong><span>'+count+' بند تنفيذ · فتح مساحة المشروع ↗</span></button>'}).join('')}
function renderProjectSheets(){
 const sheets=[['dashboard','01 · PROJECT FINANCE','الماليات'],['quick','02 · DAILY LOG','الحركات اليومية'],['items','03 · EXECUTION ITEMS','بنود التنفيذ'],['contractors','04 · PEOPLE & SUPPLIERS','الصنايعية والموردين'],['collections','05 · COLLECTIONS','التحصيلات'],['expenses','06 · EXPENSES','المصروفات']];
 const grid=$('projectSheetGrid');grid.classList.toggle('has-selection',!!selectedSheet);grid.classList.toggle('has-expanded',!!expandedSheet);
 grid.innerHTML=sheets.map(([id,kicker,label])=>'<article class="project-sheet '+(selectedSheet===id?'selected ':'')+(expandedSheet===id?'expanded':'')+'" data-sheet-card="'+id+'"><button type="button" class="project-sheet-trigger" data-sheet="'+id+'" aria-expanded="'+(expandedSheet===id)+'"><span class="sheet-copy"><small>'+kicker+'</small><strong>'+label+'</strong><span class="sheet-hint">'+(expandedSheet===id?'اضغط لطي القسم':selectedSheet===id?'اضغط مرة أخرى لعرض المحتوى':'اضغط للتوسيع')+'</span></span><span class="sheet-arrow">'+(expandedSheet===id?'⌃':'⌄')+'</span></button>'+(expandedSheet===id?'<div class="sheet-inline-content" id="sheetInlineContent"></div>':'')+'</article>').join('');
 if(expandedSheet){const target=$(expandedSheet),host=$('sheetInlineContent');if(target&&host){if(!inlineSheetReturn)inlineSheetReturn={target,parent:target.parentNode,next:target.nextSibling,hadHidden:target.classList.contains('hidden')};target.classList.remove('hidden');target.classList.add('sheet-inline-page');host.appendChild(target);if(['dashboard','items','contractors','collections','expenses'].includes(expandedSheet))renderReports();}}
}
let expandedSheet='';
let inlineSheetReturn=null;
function restoreInlineSheet(){if(!inlineSheetReturn)return;const {target,parent,next,hadHidden}=inlineSheetReturn;if(parent)parent.insertBefore(target,next&&next.parentNode===parent?next:null);target.classList.remove('sheet-inline-page');target.classList.toggle('hidden',hadHidden);inlineSheetReturn=null}
function collapseInlineSheet(){restoreInlineSheet();expandedSheet='';renderProjectSheets()}
function expandInlineSheet(page){expandedSheet=page;renderProjectSheets();const host=$('sheetInlineContent');host?.scrollIntoView({behavior:'smooth',block:'nearest'})}
$('projectCards').addEventListener('click',e=>{const card=e.target.closest('[data-open-project]');if(!card)return;restoreInlineSheet();expandedSheet='';selectedSheet='';state.current=card.dataset.openProject;save();showProjectSheets()});
$('projectSheetGrid').addEventListener('click',e=>{const trigger=e.target.closest('[data-sheet]');if(!trigger)return;const page=trigger.dataset.sheet;if(expandedSheet===page){goWorkspaceBack();return}if(selectedSheet===page){pushWorkspaceHistory('expanded',page);expandInlineSheet(page)}else{const hadSelection=!!selectedSheet;restoreInlineSheet();expandedSheet='';selectedSheet=page;if(hadSelection)replaceWorkspaceHistory('selected',page);else pushWorkspaceHistory('selected',page);renderProjectSheets();const selected=$('projectSheetGrid').querySelector('[data-sheet-card="'+page+'"]');selected?.scrollIntoView?.({behavior:'smooth',block:'center'})}});
$('backToProjects').onclick=goWorkspaceBack;
$('backToSheets').onclick=showProjectSheets;
$('hubAddProject').onclick=()=>$('addProject').click();
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.add('hidden')));
function entryRow(date,title,amount,sub=''){return '<div class="table-row"><div><strong>'+esc(title)+'</strong><small>'+esc(date||'')+(sub?' · '+esc(sub):'')+'</small></div><b>'+money(amount)+'</b></div>'}
function render(){
 const p=project();if(!p)return;
 $('projectSelect').innerHTML=state.projects.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.current?'selected':'')+'>'+esc(x.name)+'</option>').join('');
 $('topProjectName').textContent=p.name;$('projectName').value=p.name;$('profitRate').value=p.rate;
 const cs=state.collections.filter(x=>x.project===state.current), ex=state.expenses.filter(x=>x.projectId===state.current);
 const collected=cs.reduce((s,x)=>s+x.amount,0),reserved=cs.reduce((s,x)=>s+x.reserved,0),expenses=spentForProject();
 $('totalCollected').textContent=money(collected);$('reservedProfit').textContent=money(reserved);$('totalExpenses').textContent=money(expenses);$('available').textContent=money(collected-reserved-expenses);
 const its=currentItems(),cons=currentContractors(),agreed=its.reduce((s,x)=>s+agreement(x,'materials')+agreement(x,'labor'),0),paid=state.payments.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0)+state.expenses.filter(x=>x.projectId===state.current&&(x.payeeId||findNamedRecord(cons,x.payee))).reduce((s,x)=>s+x.amount,0);
 $('dashboardSummary').innerHTML=[['عدد بنود التنفيذ',its.length],['عدد المقاولين والصنايعية',cons.length],['إجمالي اتفاقات البنود',money(agreed)],['المدفوع للمقاولين',money(paid)],['المتبقي من الاتفاقات',money(Math.max(0,agreed-paid))]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 const activity=[...cs.map(x=>({date:x.date,title:'تحصيل من العميل',amount:x.amount})),...ex.map(x=>({date:x.date,title:'مصروف: '+(x.item||'عام'),amount:-x.amount})),...state.payments.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:'دفعة '+(x.type==='materials'?'مونة':'أجرة'),amount:-x.amount}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);
 $('recentActivity').innerHTML=activity.length?activity.map(x=>'<div class="activity-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date)+'</small></div><b class="'+(x.amount<0?'negative':'positive')+'">'+(x.amount<0?'−':'+')+money(Math.abs(x.amount))+'</b></div>').join(''):'<div class="empty">لا توجد حركات مسجلة حتى الآن.</div>';
 const iq=normArabic($('itemsSearch')?.value||''),cq=normArabic($('contractorsSearch')?.value||'');const visibleItems=its.filter(x=>!iq||normArabic([x.name,x.category,...(x.aliases||[])].join(' ')).includes(iq)),visiblePeople=cons.filter(x=>!cq||normArabic([x.name,x.trade,...(x.aliases||[])].join(' ')).includes(cq));
 $('itemsList').innerHTML=visibleItems.length?visibleItems.map(itemCard).join(''):'<div class="empty wide">لا توجد بنود مطابقة للبحث.</div>';
 $('contractorsList').innerHTML=visiblePeople.length?visiblePeople.map(contractorCard).join(''):'<div class="empty wide">لا توجد أسماء مطابقة للبحث.</div>';
 keepSel('itemMaterialsContractor','<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join(''));keepSel('itemLaborContractor','<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join(''));
 keepSel('expenseItem','<option value="">مصروف عام للمشروع</option>'+its.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join(''));
 $('collectionList').innerHTML=cs.length?cs.slice().reverse().map(x=>'<div class="table-row expense-row"><div><strong>تحصيل عميل</strong><small>'+esc(x.date||'')+' · ربح محجوز '+money(x.reserved)+' · '+esc(x.rate)+'%</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-delete-collection="'+esc(x.id)+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد تحصيلات حتى الآن.</div>';
 $('expenseList').innerHTML=ex.length?ex.slice().reverse().map(x=>'<div class="table-row expense-row"><div><strong>'+esc((itemById(x.itemId)?.name||x.item||'مصروف عام')+' — '+typeLabel(x.type))+'</strong><small>'+esc(x.date||'')+(x.payee?' · '+esc(x.payee):'')+(x.note?' · '+esc(x.note):'')+'</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-delete-expense="'+esc(x.id)+'" aria-label="حذف المصروف">حذف</button></div></div>').join(''):'<div class="empty">لا توجد مصروفات مباشرة مسجلة.</div>';
 renderQuickLists();
}
function keepSel(id,html){const el=$(id),prev=el.value;el.innerHTML=html;if(prev&&el.options&&Array.prototype.some.call(el.options,o=>o.value===prev))el.value=prev}
function closePanels(){['itemEditor','itemDetail','contractorEditor','contractorDetail'].forEach(id=>$(id)?.classList.add('hidden'))}
function typeLabel(t){return t==='materials'?'مونة / خامات':t==='labor'?'مصنعية':'أخرى'}
function itemCard(i){
 const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(i.id,'materials'),lp=paidForItem(i.id,'labor'),c=contractorById(i.laborContractorId||i.contractorId),mc=contractorById(i.materialsContractorId||i.contractorId);
 return '<article class="record-card"><div class="card-top"><span class="pill">'+esc(i.status||'لم يبدأ')+'</span><span class="muted">'+esc(i.category||'بند تنفيذ')+'</span></div><h3>'+esc(i.name)+'</h3><p class="muted">'+esc(i.qty||1)+' '+esc(i.unit||'')+' · '+esc(i.method||'')+'</p><div class="split-stats"><div><small>المونة</small><b>'+money(m)+'</b><small>مدفوع '+money(mp)+' · متبقي '+money(Math.max(0,m-mp))+'</small></div><div><small>الأجرة</small><b>'+money(l)+'</b><small>مدفوع '+money(lp)+' · متبقي '+money(Math.max(0,l-lp))+'</small></div></div><div class="card-foot"><span>'+'المونة: '+esc(mc?.name||'غير محدد')+' · الأجرة: '+esc(c?.name||'غير محدد')+'</span><button class="text-btn" data-item-detail="'+esc(i.id)+'">التفاصيل والحركات ←</button></div></article>';
}
function expensesForContractor(c){const names=[c.name,...(c.aliases||[])].map(normArabic).filter(Boolean);return state.expenses.filter(x=>x.projectId===state.current&&(x.payeeId===c.id||(x.payee&&names.includes(normArabic(x.payee)))));}
function contractorTotals(c){
 const direct=expensesForContractor(c),paymentItemIds=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===c.id).map(p=>p.itemId).filter(Boolean),legacyNamedItemIds=state.items.filter(i=>i.projectId===state.current&&direct.some(x=>!x.itemId&&normArabic(x.item)===normArabic(i.name))).map(i=>i.id),directItemIds=new Set([...direct.map(x=>x.itemId).filter(Boolean),...paymentItemIds,...legacyNamedItemIds]);
 const items=state.items.filter(i=>i.projectId===state.current&&(i.laborContractorId===c.id||i.materialsContractorId===c.id||i.contractorId===c.id||directItemIds.has(i.id)));
 const agreements=items.reduce((s,i)=>s+((i.laborContractorId||i.contractorId)===c.id?agreement(i,'labor'):0)+((i.materialsContractorId||i.contractorId)===c.id?agreement(i,'materials'):0),0);
 const paymentRows=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===c.id);
 const payments=paymentRows.reduce((s,p)=>s+p.amount,0);
 const materialsPaid=paymentRows.filter(x=>x.type==='materials').reduce((s,x)=>s+x.amount,0)+direct.filter(x=>x.type==='materials').reduce((s,x)=>s+x.amount,0);
 const laborPaid=paymentRows.filter(x=>x.type==='labor').reduce((s,x)=>s+x.amount,0)+direct.filter(x=>x.type==='labor').reduce((s,x)=>s+x.amount,0);
 const paid=payments+direct.reduce((s,x)=>s+x.amount,0);
 return {items,agreements,paid,payments,materialsPaid,laborPaid,directExpenses:direct,balance:agreements-paid};
}
function contractorCard(c){
 const t=contractorTotals(c);
 return '<article class="record-card"><div class="card-top"><span class="pill">'+esc(c.trade||'مقاول / صنايعي')+'</span></div><h3>'+esc(c.name)+'</h3><p class="muted">'+esc(c.phone||'لا يوجد رقم هاتف')+'</p><div class="split-stats"><div><small>إجمالي الاتفاقات المرتبطة</small><b>'+money(t.agreements)+'</b></div><div><small>المدفوع / المتبقي</small><b>'+money(t.paid)+' / '+money(t.balance)+'</b></div></div><div class="card-foot"><span>'+t.items.length+' بند مرتبط</span><button class="text-btn" data-contractor-detail="'+esc(c.id)+'">كشف الحساب ←</button></div></article>';
}
function openItemEditor(item){
 $('itemEditor').classList.remove('hidden');$('itemDetail').classList.add('hidden');
 $('itemFormTitle').textContent=item?'تعديل بيانات البند':'إضافة بند جديد';$('itemId').value=item?.id||'';
 $('itemName').value=item?.name||'';$('itemAliases').value=(item?.aliases||[]).join('، ');$('itemCategory').value=item?.category||'';$('itemQty').value=item?.qty??1;$('itemUnit').value=item?.unit||'م²';$('itemMethod').value=item?.method||'بالمتر / الوحدة';$('itemMaterialsContractor').value=item?.materialsContractorId||item?.contractorId||'';$('itemLaborContractor').value=item?.laborContractorId||item?.contractorId||'';$('itemStatus').value=item?.status||'لم يبدأ';$('itemMaterials').value=item?.materialsAmount??0;$('itemSupplier').value=item?.supplier||'';$('itemLabor').value=item?.laborAmount??0;$('itemNotes').value=item?.notes||'';
 $('itemEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function showItemDetail(id){
 const i=itemById(id);if(!i||i.projectId!==state.current)return;
 const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(id,'materials'),lp=paidForItem(id,'labor'),all=itemMovements(id);
 $('itemEditor').classList.add('hidden');const d=$('itemDetail');d.classList.remove('hidden');
 const movementRows=all.length?all.map(x=>'<div class="table-row expense-row"><div><strong>'+esc((x.type==='materials'?'مونة وخامات':x.type==='labor'?'أجرة':'مصروف')+' · '+(x.person||'مستلم غير محدد'))+'</strong><small>'+esc(x.date||'')+(x.note?' · '+esc(x.note):'')+(x.ledger==='expense'?' · مصروف مباشر':' · دفعة')+'</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-item-ledger-delete="'+esc(x.id)+'" data-ledger-kind="'+x.ledger+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد حركات مسجلة لهذا البند.</div>';
 d.innerHTML='<div class="surface-head"><div><span class="eyebrow">ITEM LEDGER</span><h2>'+esc(i.name)+'</h2></div><button class="icon-btn" data-close="itemDetail">✕</button></div><div class="detail-actions"><button class="btn btn-light" data-edit-item="'+esc(id)+'">تعديل بيانات البند</button><button class="btn btn-primary" data-add-payment="'+esc(id)+'">＋ تسجيل دفعة</button></div><div class="split-stats large"><div><small>حساب المونة والخامات</small><h3>'+money(m)+'</h3><p>إجمالي المصروف / المدفوع '+money(mp)+' · متبقي '+money(m-mp)+'</p></div><div><small>حساب الأجرة</small><h3>'+money(l)+'</h3><p>إجمالي المصروف / المدفوع '+money(lp)+' · متبقي '+money(l-lp)+'</p></div></div><div class="surface-inset"><h3>تسجيل دفعة على البند</h3><form id="paymentForm" class="form-grid compact"><input type="hidden" name="itemId" value="'+esc(id)+'"><label>نوع الحساب<select name="type"><option value="materials">المونة والخامات</option><option value="labor">الأجرة</option></select></label><label>المقاول / المستلم<select name="contractorId"><option value="">غير محدد</option>'+currentContractors().map(c=>'<option value="'+esc(c.id)+'" '+(c.id===(i.materialsContractorId||i.contractorId)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label>المبلغ<input name="amount" type="number" min=".01" step=".01" required></label><label>التاريخ<input name="date" type="date" value="'+today()+'" required></label><label class="span-2">ملاحظات<input name="note" placeholder="دفعة / سلفة / مستخلص"></label><div class="form-actions"><button class="btn btn-primary">حفظ الدفعة</button></div></form></div><h3>كل الحركات المرتبطة بالبند</h3><div class="table-wrap">'+movementRows+'</div><p class="hint">'+esc(i.notes||'')+'</p>';
 d.querySelectorAll('[data-item-ledger-delete]').forEach(btn=>btn.onclick=()=>{const isPayment=btn.dataset.ledgerKind==='payment',recordId=btn.dataset.itemLedgerDelete;if(!confirm('حذف الحركة؟ سيتم تحديث حساب البند والشخص والمشروع.'))return;if(isPayment)state.payments=state.payments.filter(x=>x.id!==recordId);else state.expenses=state.expenses.filter(x=>x.id!==recordId);save();showItemDetail(id)});
 d.querySelector('[data-close]').onclick=()=>d.classList.add('hidden');
 d.querySelector('[name=type]').onchange=ev=>{d.querySelector('[name=contractorId]').value=ev.target.value==='materials'?(i.materialsContractorId||i.contractorId||''):(i.laborContractorId||i.contractorId||'')};
 d.querySelector('[data-edit-item]').onclick=()=>openItemEditor(i);
 d.querySelector('[data-add-payment]').onclick=()=>d.querySelector('[name=amount]').focus();
 d.querySelector('#paymentForm').onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),type=f.get('type'),amount=Number(f.get('amount')),date=f.get('date'),contractorId=f.get('contractorId')||(type==='materials'?(i.materialsContractorId||i.contractorId):(i.laborContractorId||i.contractorId))||'';
  if(!Number.isFinite(amount)||amount<=0||!date)return;
  if(!confirmNoDuplicateMovement({itemId:i.id,item:i.name,type,amount,date,personId:contractorId,personName:contractorById(contractorId)?.name||''}))return;
  if(contractorId){if(type==='materials'){if(!(i.materialsContractorId||i.contractorId))i.materialsContractorId=contractorId}else if(!(i.laborContractorId||i.contractorId))i.laborContractorId=contractorId}
  const remaining=agreement(i,type)-paidForItem(i.id,type);if(amount>remaining+0.005&&!confirm('الدفعة أكبر من المتبقي في هذا الحساب بمقدار '+money(amount-remaining)+'. هل تريد تسجيلها كسلفة / دفعة مقدمة؟'))return;
  state.payments.push({id:uid('pay'),projectId:state.current,itemId:i.id,type,contractorId,amount,date,note:f.get('note')});save();showItemDetail(id)
 };
 d.scrollIntoView({behavior:'smooth',block:'start'});
}
function showContractorDetail(id){
 const c=contractorById(id);if(!c)return;const t=contractorTotals(c),pays=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===id),direct=t.directExpenses;
 const rows=t.items.map(i=>{const directItem=direct.filter(x=>x.itemId===i.id||(!x.itemId&&normArabic(x.item)===normArabic(i.name))),paymentItem=pays.filter(p=>p.itemId===i.id),materialsPaid=directItem.filter(x=>x.type==='materials').reduce((s,x)=>s+x.amount,0)+paymentItem.filter(x=>x.type==='materials').reduce((s,x)=>s+x.amount,0),laborPaid=directItem.filter(x=>x.type==='labor').reduce((s,x)=>s+x.amount,0)+paymentItem.filter(x=>x.type==='labor').reduce((s,x)=>s+x.amount,0),paid=materialsPaid+laborPaid+directItem.filter(x=>x.type!=='materials'&&x.type!=='labor').reduce((s,x)=>s+x.amount,0);return '<div class="table-row"><div><strong>'+esc(i.name)+'</strong><small>مونة مدفوع '+money(materialsPaid)+' · أجرة مدفوع '+money(laborPaid)+'</small></div><b>الإجمالي '+money(paid)+'</b></div>'}).join('');
 $('contractorDetail').classList.remove('hidden');$('contractorDetail').innerHTML='<div class="surface-head"><div><span class="eyebrow">CONTRACTOR STATEMENT</span><h2>'+esc(c.name)+'</h2><p class="muted">'+esc(c.trade||'')+' · '+esc(c.phone||'')+'</p></div><div class="inline-actions"><button class="btn btn-light" id="editContractor">تعديل البيانات</button><button class="icon-btn" data-close="contractorDetail">✕</button></div></div><div class="metric-grid mini"><div class="metric"><span>إجمالي الاتفاقات</span><strong>'+money(t.agreements)+'</strong></div><div class="metric"><span>إجمالي المدفوع</span><strong>'+money(t.paid)+'</strong></div><div class="metric"><span>المتبقي</span><strong>'+money(t.balance)+'</strong></div></div><h3>البنود المسندة</h3><div class="table-wrap">'+(rows||'<div class="empty">لا توجد بنود مرتبطة بهذا المقاول.</div>')+'</div><h3>سجل المدفوعات والمشتريات</h3><div class="table-wrap">'+(pays.length||direct.length?[...pays.map(p=>({id:p.id,date:p.date,title:(itemById(p.itemId)?.name||'بند')+' · '+(p.type==='materials'?'مونة':'أجرة'),amount:p.amount,note:p.note||'',kind:'payment'})),...direct.map(x=>({id:x.id,date:x.date,title:(itemById(x.itemId)?.name||x.item||'مصروف عام')+' · مصروف مباشر',amount:x.amount,note:x.note||'',kind:'expense'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>'<div class="table-row expense-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date||'')+(x.note?' · '+esc(x.note):'')+'</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-ledger-delete="'+esc(x.id)+'" data-ledger-kind="'+x.kind+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد دفعات أو مشتريات مسجلة لهذا الشخص.</div>')+'</div>';
 $('contractorDetail').querySelectorAll('[data-ledger-delete]').forEach(btn=>btn.onclick=()=>{const isPayment=btn.dataset.ledgerKind==='payment',idToDelete=btn.dataset.ledgerDelete;if(!confirm('حذف هذه الحركة؟ سيتم تحديث كشف الحساب وإجماليات المشروع.'))return;if(isPayment)state.payments=state.payments.filter(x=>x.id!==idToDelete);else state.expenses=state.expenses.filter(x=>x.id!==idToDelete);save();showContractorDetail(id)});$('contractorDetail').querySelector('[data-close]').onclick=()=> $('contractorDetail').classList.add('hidden');$('contractorDetail').querySelector('#editContractor').onclick=()=>{ $('contractorId').value=c.id;$('contractorName').value=c.name;$('contractorAliases').value=(c.aliases||[]).join('، ');$('contractorPhone').value=c.phone||'';$('contractorTrade').value=c.trade||'';$('contractorNotes').value=c.notes||'';$('contractorFormTitle').textContent='تعديل بيانات '+c.name;$('contractorEditor').classList.remove('hidden');$('contractorEditor').scrollIntoView({behavior:'smooth'});};$('contractorDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
$('projectSelect').onchange=e=>{state.current=e.target.value;closePanels();save()};
$('addProject').onclick=()=>{const name=prompt('اسم المشروع الجديد؟');if(!name?.trim())return;const p={id:uid('prj'),name:name.trim(),rate:10};state.projects.push(p);state.current=p.id;save();showProjectSheets()};
$('itemsSearch').addEventListener('input',render);$('contractorsSearch').addEventListener('input',render);

$('newItemBtn').onclick=()=>openItemEditor(null);$('newContractorBtn').onclick=()=>{ $('contractorEditor').classList.remove('hidden');$('contractorForm').reset();$('contractorId').value='';$('contractorFormTitle').textContent='إضافة مقاول أو صنايعي';$('contractorEditor').scrollIntoView({behavior:'smooth'})};
$('itemsList').addEventListener('click',e=>{const d=e.target.closest('[data-item-detail]'),ed=e.target.closest('[data-edit-item]');if(d)showItemDetail(d.dataset.itemDetail);if(ed)openItemEditor(itemById(ed.dataset.editItem))});
$('contractorsList').addEventListener('click',e=>{const d=e.target.closest('[data-contractor-detail]');if(d)showContractorDetail(d.dataset.contractorDetail)});
$('itemForm').onsubmit=e=>{e.preventDefault();const id=$('itemId').value,old=itemById(id);const data={id:id||uid('item'),projectId:state.current,name:$('itemName').value.trim(),aliases:$('itemAliases').value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean),category:$('itemCategory').value.trim(),qty:Number($('itemQty').value)||0,unit:$('itemUnit').value,method:$('itemMethod').value,materialsContractorId:$('itemMaterialsContractor').value,laborContractorId:$('itemLaborContractor').value,status:$('itemStatus').value,materialsAmount:Number($('itemMaterials').value)||0,supplier:$('itemSupplier').value.trim(),laborAmount:Number($('itemLabor').value)||0,notes:$('itemNotes').value.trim()};if(old)Object.assign(old,data);else state.items.push(data);$('itemEditor').classList.add('hidden');save()};
$('contractorForm').onsubmit=e=>{e.preventDefault();const id=$('contractorId').value,old=contractorById(id),data={id:id||uid('con'),projectId:state.current,name:$('contractorName').value.trim(),aliases:$('contractorAliases').value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean),phone:$('contractorPhone').value.trim(),trade:$('contractorTrade').value.trim(),notes:$('contractorNotes').value.trim()};if(old)Object.assign(old,data);else state.contractors.push(data);$('contractorEditor').classList.add('hidden');e.target.reset();$('contractorId').value='';save()};
$('collectionDate').value=today();$('expenseDate').value=today();
$('collectionForm').onsubmit=e=>{e.preventDefault();const amount=Number($('collectionAmount').value),rate=Number(project().rate);state.collections.push({id:uid('col'),project:state.current,amount,rate,reserved:amount*rate/100,date:$('collectionDate').value,note:$('collectionNote').value});e.target.reset();$('collectionDate').value=today();save()};
$('expenseForm').onsubmit=e=>{e.preventDefault();const payee=$('expensePayee').value.trim();let matchedPayee=findNamedRecord(currentContractors(),payee),createPayee=false;const itemId=$('expenseItem').value,itemName=itemById(itemId)?.name||'',type=$('expenseType').value,amount=Number($('expenseAmount').value),date=$('expenseDate').value;if(!Number.isFinite(amount)||amount<=0||!date)return;if(payee&&!matchedPayee){if(!confirm('المورد / الصنايعي "'+payee+'" غير مسجل. هل تريد إنشاء حساب وربط الحركة به؟'))return;createPayee=true}if(!confirmNoDuplicateMovement({itemId,item:itemName,type,amount,date,personId:matchedPayee?.id||'',personName:payee}))return;if(createPayee){matchedPayee={id:uid('con'),projectId:state.current,name:payee,aliases:[],phone:'',trade:type==='labor'?'صنايعي':'مورد',notes:''};state.contractors.push(matchedPayee)}const linkedItem=itemById(itemId);if(linkedItem&&matchedPayee&&type==='materials'&&!(linkedItem.materialsContractorId||linkedItem.contractorId))linkedItem.materialsContractorId=matchedPayee.id;if(linkedItem&&matchedPayee&&type==='labor'&&!(linkedItem.laborContractorId||linkedItem.contractorId))linkedItem.laborContractorId=matchedPayee.id;state.expenses.push({id:uid('ex'),projectId:state.current,itemId,item:itemName,type,amount,payee,payeeId:matchedPayee?.id||'',date,note:$('expenseNote').value,kind:'direct'});e.target.reset();$('expenseDate').value=today();save()};
$('collectionList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete-collection]');if(!btn)return;const id=btn.dataset.deleteCollection,record=state.collections.find(x=>x.id===id&&x.project===state.current);if(!record||!confirm('حذف التحصيل بقيمة '+money(record.amount)+'؟ سيتم تحديث الربح المحجوز والمتاح للتنفيذ.'))return;state.collections=state.collections.filter(x=>x.id!==id);save()});
$('expenseList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete-expense]');if(!btn)return;const id=btn.dataset.deleteExpense;const record=state.expenses.find(x=>x.id===id&&x.projectId===state.current);if(!record)return;if(!confirm('هل أنت متأكد من حذف هذا المصروف بقيمة '+money(record.amount)+'؟ لا يمكن التراجع عن الحذف.'))return;state.expenses=state.expenses.filter(x=>x.id!==id);save()});
$('settingsForm').onsubmit=e=>{e.preventDefault();const pName=$('projectName').value.trim(),pRate=Number($('profitRate').value);if(!pName||!Number.isFinite(pRate)||pRate<0||pRate>100){alert('تأكد من اسم المشروع ونسبة الربح (من 0 إلى 100).');return}project().name=pName;project().rate=pRate;save();alert('تم حفظ إعدادات المشروع')};
$('exportData').onclick=()=>{const payload={app:'execution-manager',schemaVersion:2,exportedAt:new Date().toISOString(),state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='execution-manager-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('importData').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>20*1024*1024)throw Error('size');
  const parsed=JSON.parse(await file.text()),imported=parsed.state||parsed;
  if(!imported||!Array.isArray(imported.projects)||!imported.projects.length||!Array.isArray(imported.collections))throw Error('shape');
  for(const key of ['expenses','items','contractors','payments'])if(imported[key]!==undefined&&!Array.isArray(imported[key]))throw Error('shape');
  if(!confirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. يفضل تصدير نسخة من البيانات الحالية أولاً. هل تريد المتابعة؟'))return;
  const next=normalizeState(imported),serialized=JSON.stringify(next);
  localStorage.setItem(KEY,serialized);
  state=next;closePanels();render();renderQuickLists();renderReports();
  alert('تم استيراد النسخة الاحتياطية بنجاح');
 }catch(err){alert('تعذر استيراد النسخة الاحتياطية. لم يتم استبدال بياناتك الحالية. تأكد من سلامة الملف وتوفر مساحة تخزين كافية.');}
 finally{e.target.value=''}
};
render();


// Phase 2: unified daily entry + on-demand personal reports.
// Existing records and the original accounting formulas remain unchanged.
function normArabic(s){return String(s||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ًٌٍَُِّْـ]/g,'').replace(/[٬,]/g,'').replace(/\s+/g,' ').trim().toLowerCase()}
function findNamedRecord(list,name){const n=normArabic(name);if(!n)return null;return list.find(x=>normArabic(x.name)===n||(x.aliases||[]).some(a=>normArabic(a)===n))||null;}
function parseAmountFromText(raw){const t=normArabic(raw).replace(/[,٬]/g,'');const patterns=[/(?:^|\s)(?:ب|اجمالي|المبلغ|قيمه)\s*(\d+(?:\.\d+)?)/,/(\d+(?:\.\d+)?)\s*(?:جنيه|جنيهات|جم|ج\.م)/];for(const re of patterns){const m=t.match(re);if(m)return Number(m[1]);}const nums=t.match(/\d+(?:\.\d+)?/g);return nums?.length?Number(nums[nums.length-1]):null;}
function parseQuickText(){
 const raw=$('quickText').value.trim(),amountEl=$('quickAmount'),auto=amountEl.dataset.auto==='1';
 if(!raw){if(auto){amountEl.value='';amountEl.dataset.auto=''}return}
 const t=normArabic(raw),amount=parseAmountFromText(raw);
 if(amount!==null&&amount>0){if(!amountEl.value||auto){amountEl.value=amount;amountEl.dataset.auto='1'}}
 else if(auto){amountEl.value='';amountEl.dataset.auto=''}
 if(/تحصيل|استلمت|قبضت/.test(t))$('quickKind').value='collection';
 else if(/سلفه|سلفة|مقدم/.test(t))$('quickKind').value='labor_advance';
 else if(/اجره مستحقه|مستحقات صنايعي|اعتماد اجرة|اعتماد اجره/.test(t))$('quickKind').value='labor_earned';
 else if(/سداد فاتوره|سداد فاتورة|دفعت للمورد|سددت للمورد/.test(t))$('quickKind').value='supplier_payment';
 else if(/فاتوره|فاتورة|اشتريت|شراء|مشتريات|توريد/.test(t))$('quickKind').value='purchase_invoice';
 else if(/اجره|مصنعيه|يوميه|صنايعي/.test(t))$('quickKind').value='labor';
 else if(/خامات|مونه|جردل|اسمنت|سيراميك/.test(t))$('quickKind').value='materials';
 else if(/نقاش|نجار|كهربائي|سباك|دفعت|مقاول/.test(t))$('quickKind').value='labor';
 $('quickNote').value=raw;
}
function renderQuickLists(){
 $('quickItems').innerHTML=currentItems().flatMap(x=>[x.name,...(x.aliases||[])]).map(n=>'<option value="'+esc(n)+'"></option>').join('');
 $('quickPeople').innerHTML=currentContractors().flatMap(x=>[x.name,...(x.aliases||[])]).map(n=>'<option value="'+esc(n)+'"></option>').join('');
 const rows=[...state.expenses.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:x.item||'مصروف عام',amount:-x.amount,sub:typeLabel(x.type)})),...state.payments.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:contractorById(x.contractorId)?.name||'دفعة مقاول',amount:-x.amount,sub:itemById(x.itemId)?.name||'بند غير محدد'})),...state.collections.filter(x=>x.project===state.current).map(x=>({date:x.date,title:'تحصيل من العميل',amount:x.amount,sub:'تحصيل'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,7);
 $('quickRecent').innerHTML=rows.length?rows.map(x=>'<div class="activity-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date)+' · '+esc(x.sub)+'</small></div><b class="'+(x.amount<0?'negative':'positive')+'">'+(x.amount<0?'−':'+')+money(Math.abs(x.amount))+'</b></div>').join(''):'<div class="empty">لسه مفيش حركات مسجلة.</div>';
}
function answerReportQuestion(){
 const raw=$('reportQuestion').value.trim(),q=normArabic(raw),from=$('reportFrom').value,to=$('reportTo').value,within=x=>(!from||x.date>=from)&&(!to||x.date<=to);
 if(!q){$('reportAnswer').textContent='اكتب سؤالك الأول.';return;}
 if(from&&to&&from>to){$('reportAnswer').textContent='تاريخ البداية لازم يكون قبل تاريخ النهاية.';return;}
 const ex=state.expenses.filter(x=>x.projectId===state.current&&within(x)),pays=state.payments.filter(x=>x.projectId===state.current&&within(x)),cols=state.collections.filter(x=>x.project===state.current&&within(x));
 const findMentions=list=>{
  const exact=list.filter(r=>[r.name,...(r.aliases||[])].some(n=>{const v=normArabic(n);return v.length>=3&&q.includes(v)}));
  if(exact.length)return exact;
  return list.filter(r=>[r.name,...(r.aliases||[])].some(n=>normArabic(n).split(' ').some(w=>w.length>=3&&q.includes(w))));
 };
 const people=findMentions(currentContractors()),items=findMentions(currentItems());
 if(people.length>1){$('reportAnswer').textContent='الاسم غير محدد كفاية. اكتب الاسم الكامل للشخص أو المورد عشان ما أديكش حساب شخص تاني.';return;}
 if(!people.length&&items.length>1){$('reportAnswer').textContent='اسم البند محتمل يكون أكثر من بند. اكتب اسم البند بشكل أوضح.';return;}
 const person=people[0]||null,item=items[0]||null;
 let answer='';
 if(person){
  const names=[person.name,...(person.aliases||[])].map(normArabic);
  const direct=ex.filter(x=>x.payeeId===person.id||(x.payee&&names.includes(normArabic(x.payee)))).reduce((s,x)=>s+x.amount,0);
  const paid=pays.filter(x=>x.contractorId===person.id).reduce((s,x)=>s+x.amount,0);
  answer='إجمالي المسجل باسم '+person.name+' = '+money(paid+direct)+' (دفعات مقاول '+money(paid)+'، مصروفات مباشرة '+money(direct)+').';
 }else if(item){
  const direct=ex.filter(x=>x.itemId===item.id||normArabic(x.item)===normArabic(item.name)).reduce((s,x)=>s+x.amount,0);
  const paid=pays.filter(x=>x.itemId===item.id).reduce((s,x)=>s+x.amount,0);
  answer='إجمالي تكلفة بند '+item.name+' = '+money(direct+paid)+' (مصروفات مباشرة '+money(direct)+'، دفعات '+money(paid)+').';
 }else if(/تحصيل|قبض|استلم/.test(q)){answer='إجمالي التحصيلات المسجلة = '+money(cols.reduce((s,x)=>s+x.amount,0))+'.';}
 else if(/ربح|محجوز/.test(q)){answer='إجمالي الربح المحجوز = '+money(cols.reduce((s,x)=>s+(Number(x.reserved)||0),0))+'.';}
 else if(/مصروف|صرف|تكلف|اتصرف/.test(q)){const direct=ex.reduce((s,x)=>s+x.amount,0),paid=pays.reduce((s,x)=>s+x.amount,0);answer='المصروفات المباشرة '+money(direct)+'، ودفعات المقاولين '+money(paid)+'، والإجمالي '+money(direct+paid)+'.';}
 else{answer='مش قادر أحدد المقصود من السؤال. جرّب اسم بند أو شخص مسجل، أو اسأل عن إجمالي التحصيلات أو المصروفات.';}
 $('reportAnswer').textContent=answer;
}
async function handleReceiptImage(e){const file=e.target.files?.[0];if(!file)return;const status=$('receiptStatus');status.textContent='جاري قراءة الفاتورة… قد يستغرق ذلك بعض الوقت حسب حجم الصورة.';try{if(!window.Tesseract){await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.onload=resolve;sc.onerror=()=>reject(new Error('تعذر تحميل محرك قراءة الفواتير'));document.head.appendChild(sc)});}const result=await window.Tesseract.recognize(file,'ara+eng',{logger:m=>{if(m.status==='recognizing text')status.textContent='جاري قراءة الفاتورة… '+Math.round((m.progress||0)*100)+'%'}});$('quickText').value=result.data.text||'';$('quickNote').value=result.data.text||'';parseQuickText();status.textContent='تم استخراج النص مبدئيًا. راجع المبلغ والبند والشخص يدويًا قبل التسجيل.';}catch(err){status.textContent='تعذرت قراءة الصورة تلقائيًا. يمكنك كتابة بيانات الفاتورة يدويًا.';}finally{e.target.value='';}}
function renderReports(){
 const from=$('reportFrom').value,to=$('reportTo').value,within=x=>(!from||x.date>=from)&&(!to||x.date<=to);
 const ex=state.expenses.filter(x=>x.projectId===state.current&&within(x)), pays=state.payments.filter(x=>x.projectId===state.current&&within(x)), cols=state.collections.filter(x=>x.project===state.current&&within(x));
 const totalEx=ex.reduce((s,x)=>s+x.amount,0),totalPay=pays.reduce((s,x)=>s+x.amount,0),totalCol=cols.reduce((s,x)=>s+x.amount,0);
 $('reportMetrics').innerHTML=[['إجمالي التحصيل',totalCol],['المصروفات المباشرة',totalEx],['دفعات المونة والأجرة',totalPay]].map(x=>'<div class="metric"><span>'+x[0]+'</span><strong>'+money(x[1])+'</strong></div>').join('');
 const byItem=new Map(),byPerson=new Map();
 ex.forEach(x=>{const k=itemById(x.itemId)?.name||x.item||'مصروف عام';byItem.set(k,(byItem.get(k)||0)+x.amount);if(x.payee){const person=x.payeeId?contractorById(x.payeeId):findNamedRecord(currentContractors(),x.payee),name=person?.name||x.payee;byPerson.set(name,(byPerson.get(name)||0)+x.amount)}});
 pays.forEach(x=>{const k=itemById(x.itemId)?.name||'بند غير محدد';byItem.set(k,(byItem.get(k)||0)+x.amount);const p=contractorById(x.contractorId)?.name||'مستلم غير محدد';byPerson.set(p,(byPerson.get(p)||0)+x.amount)});
 $('reportItems').innerHTML=byItem.size?[...byItem].sort((a,b)=>b[1]-a[1]).map(x=>entryRow('',x[0],x[1])).join(''):'<div class="empty">لا توجد تكاليف مسجلة.</div>';
 $('reportPeople').innerHTML=byPerson.size?[...byPerson].sort((a,b)=>b[1]-a[1]).map(x=>entryRow('',x[0],x[1])).join(''):'<div class="empty">لا توجد دفعات لأشخاص مسجلة.</div>';
 const all=[...ex.map(x=>({date:x.date,title:(itemById(x.itemId)?.name||x.item||'مصروف عام')+' · '+typeLabel(x.type),person:x.payee||'',amount:x.amount})),...pays.map(x=>({date:x.date,title:(itemById(x.itemId)?.name||'بند غير محدد')+' · '+(x.type==='materials'?'مونة':'أجرة'),person:contractorById(x.contractorId)?.name||'',amount:x.amount})),...cols.map(x=>({date:x.date,title:'تحصيل عميل',person:'',amount:x.amount}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const duplicatePairs=new Set();ex.forEach(x=>{const match=findDuplicateMovement({itemId:x.itemId,item:x.item,type:x.type,amount:x.amount,date:x.date,personId:x.payeeId,personName:x.payee,ignoreId:x.id});if(match)duplicatePairs.add([x.id,match.id].sort().join('|'))});pays.forEach(x=>{const match=findDuplicateMovement({itemId:x.itemId,type:x.type,amount:x.amount,date:x.date,personId:x.contractorId,personName:contractorById(x.contractorId)?.name||'',ignoreId:x.id});if(match)duplicatePairs.add([x.id,match.id].sort().join('|'))});const duplicates=[...duplicatePairs];const unclassified=ex.filter(x=>!x.itemId&&!x.item&&!x.payee).length;$('reportWarnings').innerHTML=(duplicates.length?'<div class="summary-row"><span>تنبيه: حركات متطابقة محتملة</span><strong>'+duplicates.length+'</strong></div>':'')+(unclassified?'<div class="summary-row"><span>مصروفات بدون بند أو مستلم</span><strong>'+unclassified+'</strong></div>':'')||'<div class="muted">لا توجد تنبيهات واضحة على الحركات الحالية.</div>';
 if(from&&to&&from<=to){const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z'),days=Math.round((end-start)/86400000)+1,prevEnd=new Date(start.getTime()-86400000),prevStart=new Date(start.getTime()-days*86400000),fmt=d=>d.toISOString().slice(0,10),prev=(x)=>x>=fmt(prevStart)&&x<=fmt(prevEnd),prevCost=state.expenses.filter(x=>x.projectId===state.current&&prev(x.date)).reduce((a,x)=>a+x.amount,0)+state.payments.filter(x=>x.projectId===state.current&&prev(x.date)).reduce((a,x)=>a+x.amount,0),prevCollected=state.collections.filter(x=>x.project===state.current&&prev(x.date)).reduce((a,x)=>a+x.amount,0),nowCost=totalEx+totalPay;$('reportComparison').textContent='الفترة الحالية '+from+' إلى '+to+': تكلفة '+money(nowCost)+'، التحصيل '+money(totalCol)+'. الفترة السابقة '+fmt(prevStart)+' إلى '+fmt(prevEnd)+': تكلفة '+money(prevCost)+'، التحصيل '+money(prevCollected)+'. فرق التكلفة '+money(nowCost-prevCost)+'، وفرق التحصيل '+money(totalCol-prevCollected)+'.';}else{$('reportComparison').textContent='حدد تاريخ بداية ونهاية للمقارنة مع الفترة السابقة بنفس المدة.';}
 if($('collectionReportSummary'))$('collectionReportSummary').innerHTML=[['إجمالي التحصيل',money(totalCol)],['الربح المحجوز',money(cols.reduce((s,x)=>s+x.reserved,0))],['عدد التحصيلات',cols.length]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 if($('expenseReportSummary'))$('expenseReportSummary').innerHTML=[['المصروفات المباشرة',money(totalEx)],['دفعات المونة والأجرة',money(totalPay)],['إجمالي تكلفة التنفيذ',money(totalEx+totalPay)]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 window.currentReportRows=all;renderReportRows();
}
function renderReportRows(){const q=normArabic($('reportSearch')?.value||''),from=$('reportFrom')?.value||'',to=$('reportTo')?.value||'';const rows=(window.currentReportRows||[]).filter(x=>{const hay=normArabic([x.title,x.person,x.date].join(' '));return (!q||hay.includes(q))&&(!from||x.date>=from)&&(!to||x.date<=to)});$('reportTransactions').innerHTML=rows.length?rows.map(x=>entryRow(x.date,x.title,x.amount,x.person)).join(''):'<div class="empty">لا توجد حركات مطابقة للتصفية.</div>';
}
$('quickDate').value=today();
$('clearQuickForm').onclick=()=>{$('quickForm').reset();$('quickAmount').dataset.auto='';$('quickDate').value=today();$('quickText').value='';$('voiceStatus').textContent='اكتب الحركة أو استخدم الصوت أو صوّر الفاتورة، ثم راجع البيانات قبل الحفظ.';$('receiptStatus').textContent=''};
$('quickText').addEventListener('input',parseQuickText);$('quickAmount').addEventListener('input',()=>{$('quickAmount').dataset.auto=''});

$('quickForm').addEventListener('submit',e=>{
 e.preventDefault();
 const kind=$('quickKind').value,amount=Number($('quickAmount').value),itemName=$('quickItem').value.trim(),personName=$('quickPerson').value.trim(),date=$('quickDate').value,note=$('quickNote').value.trim();
 if(!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){alert('راجع المبلغ والتاريخ قبل التسجيل.');return;}
 if(kind==='collection'){const rate=Number(project().rate);state.collections.push({id:uid('col'),project:state.current,amount,rate,reserved:amount*rate/100,date,note});}
 else if(kind==='purchase_invoice'||kind==='supplier_payment'||kind==='labor_earned'||kind==='labor_advance'){
  let item=itemName?findNamedRecord(currentItems(),itemName):null,person=personName?findNamedRecord(currentContractors(),personName):null;
  const invoice=kind==='supplier_payment'?state.purchases.find(x=>x.id===$('quickInvoice').value):null;
  if(kind==='supplier_payment'&&!invoice){alert('اختار فاتورة المورد التي تسددها حتى لا تختلط الفاتورة بالدفعة.');return;}
  if(kind==='supplier_payment'&&amount>invoiceTotals(invoice).outstanding+.005){alert('المبلغ أكبر من المتبقي في الفاتورة. سجّل دفعة لا تتجاوز '+money(invoiceTotals(invoice).outstanding)+'.');return;}
  if(kind==='purchase_invoice'&&!personName){alert('اكتب اسم المورد لتسجيل الفاتورة على حسابه.');return;}
  if(['labor_earned','labor_advance'].includes(kind)&&!personName){alert('اكتب اسم الصنايعي لربط الأجرة أو السلفة بحسابه.');return;}
  if(itemName&&!item&&!confirm('البند "'+itemName+'" غير مسجل. هل تريد إنشاءه وربط الحركة به؟'))return;
  if(personName&&!person&&!confirm('الشخص / المورد "'+personName+'" غير مسجل. هل تريد إنشاء حساب له؟'))return;
  if(!item&&itemName){item={id:uid('item'),projectId:state.current,name:itemName,aliases:[],category:'',qty:1,unit:'',method:'',materialsAmount:0,laborAmount:0,status:'جاري التنفيذ'};}
  if(!person&&personName){person={id:uid('con'),projectId:state.current,name:personName,aliases:[],phone:'',trade:kind.startsWith('labor')?'صنايعي':'مورد',notes:''};}
  if(kind==='purchase_invoice'){
   state.purchases.push({id:uid('inv'),projectId:state.current,itemId:item?.id||'',item:item?.name||itemName,supplierId:person.id,supplier:person.name,amount,date,note});
   if(item&&!item.materialsContractorId)item.materialsContractorId=person.id;
  }else if(kind==='supplier_payment'){
   state.payments.push({id:uid('pay'),projectId:state.current,itemId:invoice.itemId||'',type:'materials',contractorId:invoice.supplierId||person?.id||'',amount,date,note,purpose:'supplier_invoice_payment',invoiceId:invoice.id});
  }else if(kind==='labor_earned'){
   state.laborEntries.push({id:uid('earned'),projectId:state.current,itemId:item?.id||'',contractorId:person.id,amount,date,note,status:'approved'});
  }else{
   state.payments.push({id:uid('pay'),projectId:state.current,itemId:item?.id||'',type:'labor',contractorId:person.id,amount,date,note,purpose:'advance'});
  }
  if(item&&!currentItems().some(x=>x.id===item.id))state.items.push(item);
  if(person&&!currentContractors().some(x=>x.id===person.id))state.contractors.push(person);
 }else{
  let item=itemName?findNamedRecord(currentItems(),itemName):null,person=personName?findNamedRecord(currentContractors(),personName):null;
  if(itemName&&!item&&!confirm('البند "'+itemName+'" غير مسجل. هل تريد إنشاءه وربط الحركة به؟'))return;
  if(personName&&!person&&!confirm('الشخص / المورد "'+personName+'" غير مسجل. هل تريد إنشاء ملف له؟'))return;
  if(itemName&&!item)item={id:uid('item'),projectId:state.current,name:itemName,aliases:[],category:'',qty:1,unit:'',method:'',materialsAmount:0,laborAmount:0,status:'جاري التنفيذ'};
  if(personName&&!person)person={id:uid('con'),projectId:state.current,name:personName,aliases:[],phone:'',trade:kind==='labor'?'صنايعي':'مورد',notes:''};
  if(!confirmNoDuplicateMovement({itemId:item?.id||'',item:item?.name||itemName,type:kind,amount,date,personId:person?.id||'',personName:person?.name||personName}))return;
  if(item&&!currentItems().some(x=>x.id===item.id))state.items.push(item);
  if(person&&!currentContractors().some(x=>x.id===person.id))state.contractors.push(person);
  if(item&&person&&kind==='labor'&&!(item.laborContractorId||item.contractorId))item.laborContractorId=person.id;
  if(kind==='labor'&&item&&person)state.payments.push({id:uid('pay'),projectId:state.current,itemId:item.id,type:'labor',contractorId:person.id,amount,date,note,purpose:'labor_payment'});
  else state.expenses.push({id:uid('ex'),projectId:state.current,itemId:item?.id||'',item:item?.name||itemName,type:kind==='materials'?'materials':kind==='labor'?'labor':'other',amount,payee:person?.name||personName,payeeId:person?.id||'',date,note,kind:'direct'});
 }
 $('quickForm').reset();$('quickAmount').dataset.auto='';$('quickDate').value=today();$('quickText').value='';$('quickInvoice').value='';toggleInvoiceSelector();save();renderQuickLists();alert('تم تسجيل الحركة بنجاح.');
});
$('voiceEntry').addEventListener('click',()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('voiceStatus').textContent='التسجيل الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome أو اكتب الحركة.';return;}
 const rec=new SR();rec.lang='ar-EG';rec.interimResults=false;rec.maxAlternatives=1;
 $('voiceStatus').textContent='بتسمعك دلوقتي… اتكلم بوضوح.';
 rec.onresult=e=>{$('quickText').value=e.results[0][0].transcript;parseQuickText();$('voiceStatus').textContent='تم تحويل الكلام لنص. راجع البيانات قبل التسجيل.'};
 rec.onerror=()=>{$('voiceStatus').textContent='حصلت مشكلة في التعرف على الصوت. اكتب الحركة يدويًا.'};
 rec.onend=()=>{if($('voiceStatus').textContent.includes('بتسمعك'))$('voiceStatus').textContent='انتهى التسجيل.'};
 try{rec.start()}catch{$('voiceStatus').textContent='التسجيل شغال بالفعل. استنى لحظة وجرّب تاني.'}
});
$('printReport').addEventListener('click',()=>window.print());
$('reportSearch').addEventListener('input',renderReportRows);['reportFrom','reportTo'].forEach(id=>$(id).addEventListener('change',renderReports));
$('clearReportFilters').onclick=()=>{$('reportSearch').value='';$('reportFrom').value='';$('reportTo').value='';renderReports()};
$('askReport').onclick=answerReportQuestion;
$('reportQuestion').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();answerReportQuestion()}});
$('receiptImage').addEventListener('change',handleReceiptImage);
renderQuickLists();

// WeeklyPlanner-inspired navigation, contextual reports and persistent appearance preferences.

$('moreNavButton')?.addEventListener('click',()=>$('moreNavMenu').classList.toggle('hidden'));
const APPEARANCE_KEY='em:appearance',APPEARANCE_DEFAULT={mode:'light',accent:'#294438',background:'#f1f0e8',text:'#333333',theme:'sage',font:'ibm',scale:100,saturation:100,surface:'tint',glass:true,blur:16,iconStyle:'plain',lineHeight:1.4,heading:100,subheading:100,item:100,motionStyle:'smooth',motionSpeed:'normal',doneColor:'green'};
const APPEARANCE_PRESETS={sage:{accent:'#8cab99',background:'#e7eeea'},sunset:{accent:'#af9688',background:'#efeae7'},earth:{accent:'#ac9c8b',background:'#eeebe7'},ocean:{accent:'#8aa5ad',background:'#e7ecee'},berry:{accent:'#ab8c9c',background:'#eee7eb'},slate:{accent:'#909ca7',background:'#e8ebed'},glass:{accent:'#9a96a2',background:'#eae9ec'},soft:{accent:'#9998a0',background:'#eaeaeb'},sand:{accent:'#aaa08d',background:'#eeebe8'},rose:{accent:'#aa8d92',background:'#eee8e9'}};
const SHEET_PALETTES={sage:['#97b4a3','#a6bfb0','#b5c9be','#c4d4cb','#d3dfd8','#e7eeea'],sunset:['#b8a194','#c2aea3','#ccbcb3','#d6c9c2','#e0d7d1','#efeae7'],earth:['#b5a697','#c0b2a5','#cabfb4','#d5ccc3','#dfd9d2','#eeebe7'],ocean:['#96aeb6','#a5b9c0','#b4c5cb','#c3d1d5','#d2dce0','#e7ecee'],berry:['#b497a6','#bfa6b2','#c9b5bf','#d4c4cc','#dfd3d9','#eee7eb'],slate:['#9ba6b0','#a9b2bc','#b8bfc7','#c6ccd2','#d4d9dd','#e8ebed'],glass:['#a4a0ab','#b1aeb7','#bebbc3','#cbc9cf','#d8d6db','#eae9ec'],soft:['#a3a2a9','#b0afb6','#bebdc2','#cbcace','#d8d7da','#eaeaeb'],sand:['#b3a998','#beb6a7','#c9c2b6','#d4cec4','#dedad3','#eeebe8'],rose:['#b3989d','#bea7ab','#c9b6b9','#d4c4c7','#ded3d5','#eee8e9']};
function contrastInk(hex){const rgb=String(hex).match(/[0-9a-f]{2}/gi)?.slice(-3).map(x=>parseInt(x,16)/255)||[0,0,0],linear=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),l=.2126*linear[0]+.7152*linear[1]+.0722*linear[2];return l>.179?'#17191c':'#ffffff';}
function getAppearance(){try{return {...APPEARANCE_DEFAULT,...JSON.parse(localStorage.getItem(APPEARANCE_KEY)||'{}')}}catch{return {...APPEARANCE_DEFAULT}}}
function hexToHsl(hex){const n=String(hex).replace('#',''),r=parseInt(n.slice(0,2),16)/255,g=parseInt(n.slice(2,4),16)/255,b=parseInt(n.slice(4,6),16)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}return [((h+360)%360),s,l]}
function hslToHex(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')}
function saturateHex(hex,amount){const [h,s,l]=hexToHsl(hex);return hslToHex(h,Math.min(1,Math.max(0,s*amount)),l)}
function applyAppearance(){
 const a=getAppearance(),mode=a.mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):a.mode,dark=mode==='dark',bg=dark?'#1b1b1d':a.background,accent=saturateHex(a.accent||'#294438',(Number(a.saturation)||0)/100);
 const mix=(x,y,t)=>{const p=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)],A=p(x),B=p(y);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
 const rgb=accent.match(/[0-9a-f]{2}/gi)?.map(x=>parseInt(x,16)/255)||[.2,.2,.2],linear=rgb.map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4),accentInk=.2126*linear[0]+.7152*linear[1]+.0722*linear[2]>.45?'#14161a':'#fff';
 const textColor=['#ffffff','#333333','#000000'].includes(String(a.text).toLowerCase())?String(a.text).toLowerCase():'#333333';
 const root=document.documentElement;root.dataset.theme=a.theme||'sage';const sheetPalette=SHEET_PALETTES[a.theme]||SHEET_PALETTES.sage;sheetPalette.forEach((raw,i)=>{const color=saturateHex(raw,(Number(a.saturation)||0)/100),readableInk=contrastInk(color)==='#ffffff'?'#ffffff':(textColor==='#ffffff'?'#333333':textColor);root.style.setProperty('--sheet-'+(i+1)+'-color',color);root.style.setProperty('--sheet-'+(i+1)+'-ink',readableInk);root.style.setProperty('--sheet-'+(i+1)+'-surface',a.surface==='same'?mix(color,'#ffffff',dark?.035:.055):mix(color,accent,dark?.14:.10))});
 const speed={slow:1.35,normal:1,fast:.7}[a.motionSpeed]||1,styleDuration={smooth:.48,subtle:.24,reduced:0}[a.motionStyle]??.48,motionDuration=styleDuration*speed;
 const vars={'--canvas':bg,'--paper':dark?'#232325':'#f0f1f0','--ink':textColor,'--muted':textColor,'--line':dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.085)','--nav':dark?'#262628':'#ececed','--nav2':dark?'#303033':'#e4e5e4','--accent':accent,'--accent-ink':accentInk,'--accent-soft':dark?mix('#1b1b1d',accent,.22):mix(bg,accent,.14),'--shadow':dark?'0 1px 0 rgba(255,255,255,.06) inset,0 14px 30px -12px rgba(0,0,0,.65)':'0 1px 0 rgba(255,255,255,.95) inset,0 12px 28px -12px rgba(20,20,26,.20)','--scale':String((Number(a.scale)||100)/100),'--line-height':String(Math.min(1.8,Math.max(1.2,Number(a.lineHeight)||1.4))),'--type-heading':String((Number(a.heading)||100)/100),'--type-subheading':String((Number(a.subheading)||100)/100),'--type-item':String((Number(a.item)||100)/100),'--glass-blur':(a.glass?Math.min(32,Math.max(0,Number(a.blur)||0)):0)+'px','--glass-opacity':a.glass?'.28':'0','--icon-radius':a.iconStyle==='squircle'?'30%':'50%','--icon-bg':a.iconStyle==='squircle'?'color-mix(in srgb,var(--sheet-ink) 10%,transparent)':'transparent','--motion-duration':motionDuration+'s','--done-color':a.doneColor==='orange'?'#e58a32':'#1f9c70'};
 Object.entries(vars).forEach(([k,v])=>root.style.setProperty(k,v));
 const fonts={ibm:['IBM Plex Sans Arabic','IBM+Plex+Sans+Arabic:wght@400;500;600;700'],alexandria:['Alexandria','Alexandria:wght@300;400;500;600'],readex:['Readex Pro','Readex+Pro:wght@300;400;500;600'],noto:['Noto Sans Arabic','Noto+Sans+Arabic:wght@300;400;500;600'],almarai:['Almarai','Almarai:wght@300;400;700'],cairo:['Cairo','Cairo:wght@300;400;500;600'],tajawal:['Tajawal','Tajawal:wght@300;400;500;700'],system:['system-ui','']};
 const f=fonts[a.font]||fonts.ibm;root.style.setProperty('--app-font','Inter,"'+f[0]+'",system-ui,sans-serif');root.dataset.dark=dark?'1':'0';root.style.colorScheme=dark?'dark':'light';
 if(f[1]&&!document.getElementById('em-font-'+a.font)){const l=document.createElement('link');l.id='em-font-'+a.font;l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family='+f[1]+'&display=swap';document.head.appendChild(l)}
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=bg;
}
function syncAppearanceControls(){
 const a=getAppearance();document.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===(a.theme||'sage')));
 const fields=[['appearanceMode','mode'],['appearanceAccent','accent'],['appearanceBackground','background'],['appearanceText','text'],['appearanceFont','font'],['appearanceScale','scale'],['appearanceSaturation','saturation'],['appearanceSurface','surface'],['appearanceBlur','blur'],['appearanceIconStyle','iconStyle'],['appearanceLineHeight','lineHeight'],['appearanceHeading','heading'],['appearanceSubheading','subheading'],['appearanceItem','item'],['appearanceMotionStyle','motionStyle'],['appearanceMotionSpeed','motionSpeed'],['appearanceDoneColor','doneColor']];
 fields.forEach(([id,key])=>{const el=$(id);if(el)el.value=a[key]});
 if($('appearanceGlass'))$('appearanceGlass').checked=!!a.glass;
 const labels=[['appearanceScaleValue',a.scale+'%'],['appearanceSaturationValue',a.saturation+'%'],['appearanceBlurValue',a.blur+'px'],['appearanceLineHeightValue',Number(a.lineHeight).toFixed(2)],['appearanceHeadingValue',a.heading+'%'],['appearanceSubheadingValue',a.subheading+'%'],['appearanceItemValue',a.item+'%']];
 labels.forEach(([id,value])=>{if($(id))$(id).textContent=value});
 if($('appearanceBlur'))$('appearanceBlur').disabled=!a.glass;
}
function saveAppearance(patch){localStorage.setItem(APPEARANCE_KEY,JSON.stringify({...getAppearance(),...patch}));applyAppearance();syncAppearanceControls()}
const appearanceFields=[['appearanceMode','mode','string'],['appearanceAccent','accent','string'],['appearanceBackground','background','string'],['appearanceText','text','string'],['appearanceFont','font','string'],['appearanceScale','scale','number'],['appearanceSaturation','saturation','number'],['appearanceSurface','surface','string'],['appearanceBlur','blur','number'],['appearanceIconStyle','iconStyle','string'],['appearanceLineHeight','lineHeight','number'],['appearanceHeading','heading','number'],['appearanceSubheading','subheading','number'],['appearanceItem','item','number'],['appearanceMotionStyle','motionStyle','string'],['appearanceMotionSpeed','motionSpeed','string'],['appearanceDoneColor','doneColor','string']];
appearanceFields.forEach(([id,key,type])=>$(id)?.addEventListener('input',e=>saveAppearance({[key]:type==='number'?Number(e.target.value):e.target.value})));
$('appearanceGlass')?.addEventListener('change',e=>saveAppearance({glass:e.target.checked}));
document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{const theme=b.dataset.theme,p=APPEARANCE_PRESETS[theme];if(p)saveAppearance({...p,theme})}));
$('resetAppearance')?.addEventListener('click',()=>{localStorage.removeItem(APPEARANCE_KEY);applyAppearance();syncAppearanceControls()});
$('workspaceSettingsButton')?.addEventListener('click',()=>{setPage('settings');syncAppearanceControls()});
$('settingsBackToSheets')?.addEventListener('click',()=>showProjectSheets());

applyAppearance();syncAppearanceControls();
showProjectHome();
if(window.matchMedia){const mq=window.matchMedia('(prefers-color-scheme: dark)'),onChange=()=>{if(getAppearance().mode==='system')applyAppearance()};if(mq.addEventListener)mq.addEventListener('change',onChange);else if(mq.addListener)mq.addListener(onChange)}
renderReports();

// Execution diary + separate supplier invoices, cash payments, and earned labor.
// These are additive records; existing financial and storage keys remain unchanged.
state.purchases=Array.isArray(state.purchases)?state.purchases:[];
state.laborEntries=Array.isArray(state.laborEntries)?state.laborEntries:[];
state.siteLogs=Array.isArray(state.siteLogs)?state.siteLogs:[];
const normalizeStateBeforeLedgers=normalizeState;
normalizeState=function(raw){
 const n=normalizeStateBeforeLedgers(raw);
 n.purchases=(Array.isArray(raw?.purchases)?raw.purchases:[]).filter(x=>x&&typeof x==='object').map(x=>({...x,id:x.id||uid('inv'),projectId:x.projectId||x.project||n.current,itemId:x.itemId||'',item:x.item||'',supplierId:x.supplierId||'',supplier:x.supplier||'',amount:Number(x.amount)||0,date:x.date||'',note:x.note||''}));
 n.laborEntries=(Array.isArray(raw?.laborEntries)?raw.laborEntries:[]).filter(x=>x&&typeof x==='object').map(x=>({...x,id:x.id||uid('earned'),projectId:x.projectId||x.project||n.current,itemId:x.itemId||'',contractorId:x.contractorId||'',amount:Number(x.amount)||0,date:x.date||'',note:x.note||'',status:x.status||'approved'}));
 n.siteLogs=(Array.isArray(raw?.siteLogs)?raw.siteLogs:[]).filter(x=>x&&typeof x==='object').map(x=>({...x,id:x.id||uid('log'),projectId:x.projectId||x.project||n.current,date:x.date||'',itemId:x.itemId||'',item:x.item||'',quantity:Number(x.quantity)||0,unit:x.unit||'',crew:x.crew||'',type:x.type||'execution',note:x.note||''}));
 n.payments=n.payments.map(x=>({...x,purpose:x.purpose||'legacy',invoiceId:x.invoiceId||''}));
 return n;
};
function projectPurchases(projectId=state.current){return state.purchases.filter(x=>x.projectId===projectId)}
function projectLaborEntries(projectId=state.current){return state.laborEntries.filter(x=>x.projectId===projectId&&x.status!=='void')}
function invoiceTotals(invoice){
 const paid=state.payments.filter(x=>x.projectId===invoice.projectId&&x.invoiceId===invoice.id).reduce((s,x)=>s+Number(x.amount||0),0);
 const amount=Number(invoice.amount)||0;
 return {amount,paid,outstanding:amount-paid};
}
function supplierLedgerTotals(supplierId,projectId=state.current){
 const invoices=state.purchases.filter(x=>x.projectId===projectId&&x.supplierId===supplierId);
 const invoiceIds=new Set(invoices.map(x=>x.id));
 const invoiceAmount=invoices.reduce((s,x)=>s+Number(x.amount||0),0);
 const linkedPaid=state.payments.filter(x=>x.projectId===projectId&&invoiceIds.has(x.invoiceId)).reduce((s,x)=>s+Number(x.amount||0),0);
 const unlinkedPaid=state.payments.filter(x=>x.projectId===projectId&&x.contractorId===supplierId&&x.type==='materials'&&!x.invoiceId).reduce((s,x)=>s+Number(x.amount||0),0);
 return {invoiceAmount,linkedPaid,unlinkedPaid,outstanding:invoiceAmount-linkedPaid};
}
function laborTotalsForContractor(contractorId,projectId=state.current){
 const earned=state.laborEntries.filter(x=>x.projectId===projectId&&x.contractorId===contractorId&&x.status!=='void').reduce((s,x)=>s+Number(x.amount||0),0);
 const rows=state.payments.filter(x=>x.projectId===projectId&&x.contractorId===contractorId&&x.type==='labor'&&x.purpose!=='supplier_invoice_payment');
 const paid=rows.reduce((s,x)=>s+Number(x.amount||0),0);
 const advances=rows.filter(x=>x.purpose==='advance').reduce((s,x)=>s+Number(x.amount||0),0);
 return {earned,paid,advances,balance:earned-paid};
}
function executionCostForProject(projectId=state.current){
 const direct=state.expenses.filter(x=>x.projectId===projectId).reduce((s,x)=>s+Number(x.amount||0),0);
 const legacyPayments=state.payments.filter(x=>x.projectId===projectId&&(!x.purpose||x.purpose==='legacy')).reduce((s,x)=>s+Number(x.amount||0),0);
 const invoices=state.purchases.filter(x=>x.projectId===projectId).reduce((s,x)=>s+Number(x.amount||0),0);
 const earned=projectLaborEntries(projectId).reduce((s,x)=>s+Number(x.amount||0),0);
 return direct+legacyPayments+invoices+earned;
}
function cashOutflowForProject(projectId=state.current){
 return state.expenses.filter(x=>x.projectId===projectId).reduce((s,x)=>s+Number(x.amount||0),0)+state.payments.filter(x=>x.projectId===projectId).reduce((s,x)=>s+Number(x.amount||0),0);
}
function validateDailyLog(data){
 const date=String(data?.date||''),parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 if(!parts)return {ok:false,reason:'التاريخ مطلوب'};
 const parsed=new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3]));
 if(parsed.getFullYear()!==Number(parts[1])||parsed.getMonth()!==Number(parts[2])-1||parsed.getDate()!==Number(parts[3]))return {ok:false,reason:'التاريخ غير صحيح'};
 if(!String(data.note||'').trim())return {ok:false,reason:'اكتب تفاصيل التدوينة'};
 if(data.quantity!==''&&data.quantity!=null&&(!Number.isFinite(Number(data.quantity))||Number(data.quantity)<=0))return {ok:false,reason:'الكمية يجب أن تكون أكبر من صفر'};
 return {ok:true};
}
function renderAdvancedLedger(){
 const invoices=projectPurchases().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const earned=projectLaborEntries().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const invHtml=invoices.map(x=>{const t=invoiceTotals(x);return '<div class="table-row expense-row"><div><strong>فاتورة مورد · '+esc(x.supplier||'مورد غير محدد')+'</strong><small>'+esc(x.date)+' · '+esc(itemById(x.itemId)?.name||x.item||'مصروف عام')+' · إجمالي '+money(t.amount)+' · مدفوع '+money(t.paid)+' · متبقي '+money(t.outstanding)+'</small></div><div class="ledger-row-actions"><button class="text-btn" data-edit-transaction="purchase" data-id="'+esc(x.id)+'">تعديل</button><button class="delete-btn" data-delete-transaction="purchase" data-id="'+esc(x.id)+'">حذف</button></div></div>'}).join('');
 const laborHtml=earned.map(x=>'<div class="table-row expense-row"><div><strong>أجرة مستحقة · '+esc(contractorById(x.contractorId)?.name||'صنايعي غير محدد')+'</strong><small>'+esc(x.date)+' · '+esc(itemById(x.itemId)?.name||'بند غير محدد')+' · معتمد '+money(x.amount)+'</small></div><div class="ledger-row-actions"><button class="text-btn" data-edit-transaction="laborEntry" data-id="'+esc(x.id)+'">تعديل</button><button class="delete-btn" data-delete-transaction="laborEntry" data-id="'+esc(x.id)+'">حذف</button></div></div>').join('');
 $('advancedLedger').innerHTML='<div class="advanced-ledger-group"><h3>فواتير المشتريات وحساب الموردين</h3>'+(invHtml||'<div class="empty">لا توجد فواتير مشتريات مسجلة.</div>')+'</div><div class="advanced-ledger-group"><h3>الأجور المستحقة والمعتمدة</h3>'+(laborHtml||'<div class="empty">لا توجد أجور مستحقة مسجلة.</div>')+'</div>';
 const logs=state.siteLogs.filter(x=>x.projectId===state.current).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 $('siteLogList').innerHTML=logs.length?logs.map(x=>'<div class="site-log-row"><div><strong>'+esc(x.note)+'</strong><small>'+esc(x.date)+' · '+esc(x.type==='delivery'?'توريد / استلام':x.type==='issue'?'مشكلة / معوق':x.type==='note'?'ملاحظة موقع':'تنفيذ')+'</small><div class="site-log-meta">'+(x.item?'<span>البند: '+esc(x.item)+'</span>':'')+(x.quantity?'<span>الكمية: '+esc(x.quantity)+' '+esc(x.unit)+'</span>':'')+(x.crew?'<span>الطاقم: '+esc(x.crew)+'</span>':'')+'</div></div><div class="ledger-row-actions"><button class="text-btn" data-edit-transaction="siteLog" data-id="'+esc(x.id)+'">تعديل</button><button class="delete-btn" data-delete-transaction="siteLog" data-id="'+esc(x.id)+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد تدوينات موقع حتى الآن.</div>';
 const invoiceSelect=$('quickInvoice');if(invoiceSelect){const selected=invoiceSelect.value;invoiceSelect.innerHTML='<option value="">اختر فاتورة مورد</option>'+invoices.filter(x=>invoiceTotals(x).outstanding>0.005).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.supplier||'مورد')+' · '+esc(x.date)+' · متبقي '+money(invoiceTotals(x).outstanding)+'</option>').join('');if(invoiceSelect.options&&[...invoiceSelect.options].some(o=>o.value===selected))invoiceSelect.value=selected;}
}
function toggleInvoiceSelector(){const wrap=$('quickInvoiceWrap'),kind=$('quickKind').value;if(wrap)wrap.classList.toggle('hidden',kind!=='supplier_payment');}
const baseRenderQuickLists=renderQuickLists;
renderQuickLists=function(){baseRenderQuickLists();renderAdvancedLedger();};
const baseRenderApp=render;
render=function(){baseRenderApp();renderAdvancedLedger();
 const cl=$('collectionList');if(cl)cl.querySelectorAll?.('[data-delete-collection]').forEach(b=>{if(b.parentNode&&!b.parentNode.querySelector('[data-edit-collection]')){const e=document.createElement('button');e.type='button';e.className='text-btn';e.textContent='تعديل';e.dataset.editCollection=b.dataset.deleteCollection;b.parentNode.insertBefore(e,b);}});
 const el=$('expenseList');if(el)el.querySelectorAll?.('[data-delete-expense]').forEach(b=>{if(b.parentNode&&!b.parentNode.querySelector('[data-edit-expense]')){const e=document.createElement('button');e.type='button';e.className='text-btn';e.textContent='تعديل';e.dataset.editExpense=b.dataset.deleteExpense;b.parentNode.insertBefore(e,b);}});const summary=$('dashboardSummary');if(summary){const cost=executionCostForProject(),cash=cashOutflowForProject(),invoice=projectPurchases().reduce((s,x)=>s+x.amount,0),earned=projectLaborEntries().reduce((s,x)=>s+x.amount,0);summary.innerHTML+='<div class="summary-row"><span>تكلفة التنفيذ المستحقة (فواتير + أجور معتمدة + مصروفات مباشرة + السجلات القديمة)</span><strong>'+money(cost)+'</strong></div><div class="summary-row"><span>المدفوع نقداً من المشروع</span><strong>'+money(cash)+'</strong></div><div class="summary-row"><span>إجمالي فواتير المشتريات</span><strong>'+money(invoice)+'</strong></div><div class="summary-row"><span>الأجور المعتمدة</span><strong>'+money(earned)+'</strong></div>';}}
;
const baseRenderReports=renderReports;
renderReports=function(){baseRenderReports();const extra=[...projectPurchases().map(x=>({date:x.date,title:'فاتورة مشتريات · '+(x.supplier||'مورد')+' (تكلفة مستحقة)',person:itemById(x.itemId)?.name||x.item||'',amount:x.amount})),...projectLaborEntries().map(x=>({date:x.date,title:'أجرة معتمدة مستحقة',person:contractorById(x.contractorId)?.name||'',amount:x.amount}))];window.currentReportRows=[...(window.currentReportRows||[]),...extra].sort((a,b)=>(b.date||'').localeCompare(a.date||''));renderReportRows();const metric=$('reportMetrics');if(metric){const inv=projectPurchases().reduce((s,x)=>s+x.amount,0),earned=projectLaborEntries().reduce((s,x)=>s+x.amount,0),out=projectPurchases().reduce((s,x)=>s+invoiceTotals(x).outstanding,0);metric.innerHTML+='<div class="metric"><span>فواتير مشتريات</span><strong>'+money(inv)+'</strong></div><div class="metric"><span>أجور معتمدة</span><strong>'+money(earned)+'</strong></div><div class="metric"><span>متبقي فواتير الموردين</span><strong>'+money(out)+'</strong></div>';}}
;
const baseContractorCard=contractorCard;
contractorCard=function(c){
 const base=baseContractorCard(c),supplier=supplierLedgerTotals(c.id),labor=laborTotalsForContractor(c.id);
 return base.replace('</article>','<div class="advanced-item-stats"><small>فواتير المورد: '+money(supplier.invoiceAmount)+' · مسدد '+money(supplier.linkedPaid)+' · متبقي '+money(supplier.outstanding)+'</small><small>أجرة معتمدة: '+money(labor.earned)+' · مدفوع '+money(labor.paid)+' · متبقي '+money(labor.balance)+' · سُلف '+money(labor.advances)+'</small></div></article>');
};
const baseShowContractorDetail=showContractorDetail;
showContractorDetail=function(id){baseShowContractorDetail(id);const d=$('contractorDetail');d.querySelectorAll?.('[data-ledger-delete]').forEach(b=>{const kind=b.dataset.ledgerKind==='payment'?'payment':'expense';if(b.parentNode&&!b.parentNode.querySelector('[data-edit-transaction]')){const e=document.createElement('button');e.type='button';e.className='text-btn';e.textContent='تعديل';e.dataset.editTransaction=kind;e.dataset.id=b.dataset.ledgerDelete;b.parentNode.insertBefore(e,b);}});const c=contractorById(id);if(c){const s=supplierLedgerTotals(id),l=laborTotalsForContractor(id);d.innerHTML+='<div class="advanced-ledger-group"><h3>ملخص الحسابات المفصولة</h3><div class="summary-list"><div class="summary-row"><span>فواتير المورد</span><strong>'+money(s.invoiceAmount)+'</strong></div><div class="summary-row"><span>المسدد على الفواتير</span><strong>'+money(s.linkedPaid)+'</strong></div><div class="summary-row"><span>المتبقي للمورد</span><strong>'+money(s.outstanding)+'</strong></div><div class="summary-row"><span>أجرة معتمدة</span><strong>'+money(l.earned)+'</strong></div><div class="summary-row"><span>مدفوع أجرة / سُلف</span><strong>'+money(l.paid)+'</strong></div><div class="summary-row"><span>صافي مستحق الأجرة</span><strong>'+money(l.balance)+'</strong></div><div class="summary-row"><span>منها سُلف</span><strong>'+money(l.advances)+'</strong></div></div></div>';}};
const baseItemCard=itemCard;
itemCard=function(i){const html=baseItemCard(i),inv=projectPurchases().filter(x=>x.itemId===i.id).reduce((s,x)=>s+x.amount,0),earned=projectLaborEntries().filter(x=>x.itemId===i.id).reduce((s,x)=>s+x.amount,0);return html.replace('</article>','<div class="advanced-item-stats"><small>فواتير المشتريات: '+money(inv)+'</small><small>الأجرة المعتمدة: '+money(earned)+'</small></div></article>');};
const baseShowItemDetail=showItemDetail;
showItemDetail=function(id){baseShowItemDetail(id);const d=$('itemDetail'),i=itemById(id);if(!i||d.classList.contains('hidden'))return;d.querySelectorAll?.('[data-item-ledger-delete]').forEach(b=>{const kind=b.dataset.ledgerKind==='payment'?'payment':'expense';if(b.parentNode&&!b.parentNode.querySelector('[data-edit-transaction]')){const e=document.createElement('button');e.type='button';e.className='text-btn';e.textContent='تعديل';e.dataset.editTransaction=kind;e.dataset.id=b.dataset.itemLedgerDelete;b.parentNode.insertBefore(e,b);}});const invoices=projectPurchases().filter(x=>x.itemId===id),earned=projectLaborEntries().filter(x=>x.itemId===id);d.innerHTML+='<div class="advanced-ledger-group"><h3>فواتير المشتريات المرتبطة</h3>'+(invoices.map(x=>{const t=invoiceTotals(x);return '<div class="table-row"><div><strong>'+esc(x.supplier||'مورد')+'</strong><small>'+esc(x.date)+' · فاتورة '+money(t.amount)+' · مسدد '+money(t.paid)+' · متبقي '+money(t.outstanding)+'</small></div></div>'}).join('')||'<div class="empty">لا توجد فواتير.</div>')+'</div><div class="advanced-ledger-group"><h3>الأجور المعتمدة</h3>'+(earned.map(x=>'<div class="table-row"><div><strong>'+esc(contractorById(x.contractorId)?.name||'صنايعي')+'</strong><small>'+esc(x.date)+' · '+money(x.amount)+'</small></div></div>').join('')||'<div class="empty">لا توجد أجور معتمدة.</div>')+'</div>';};
function saveNewSiteLog(data){
 const valid=validateDailyLog(data);if(!valid.ok){alert(valid.reason);return false;}
 const itemName=String(data.item||'').trim(),item=findNamedRecord(currentItems(),itemName);
 state.siteLogs.push({id:uid('log'),projectId:state.current,date:data.date,itemId:item?.id||'',item:item?.name||itemName,quantity:data.quantity?Number(data.quantity):0,unit:String(data.unit||''),crew:String(data.crew||''),type:data.type||'execution',note:String(data.note||'').trim()});
 save();return true;
}
$('quickKind').addEventListener('change',toggleInvoiceSelector);
$('siteLogDate').value=today();
$('siteLogForm').addEventListener('submit',e=>{e.preventDefault();const ok=saveNewSiteLog({date:$('siteLogDate').value,item:$('siteLogItem').value,quantity:$('siteLogQty').value,unit:$('siteLogUnit').value,crew:$('siteLogCrew').value,type:$('siteLogType').value,note:$('siteLogNote').value});if(ok){e.target.reset();$('siteLogDate').value=today();renderAdvancedLedger();}});
$('clearSiteLog').onclick=()=>{$('siteLogForm').reset();$('siteLogDate').value=today()};
$('quickInvoice')?.addEventListener('change',()=>{const invoice=state.purchases.find(x=>x.id===$('quickInvoice').value);if(invoice){$('quickPerson').value=invoice.supplier||'';$('quickItem').value=itemById(invoice.itemId)?.name||invoice.item||'';}});
function editTransaction(kind,id){
 const list={purchase:state.purchases,laborEntry:state.laborEntries,siteLog:state.siteLogs,collection:state.collections,expense:state.expenses,payment:state.payments}[kind],record=list?.find(x=>x.id===id);if(!record)return;
 const amountKinds=['purchase','laborEntry','collection','expense','payment'];let amount=record.amount;
 if(amountKinds.includes(kind)){const value=window.prompt('المبلغ الجديد بالجنيه',String(record.amount));if(value===null)return;amount=Number(value);if(!Number.isFinite(amount)||amount<=0){alert('المبلغ يجب أن يكون أكبر من صفر.');return;}}
 const date=window.prompt('التاريخ (YYYY-MM-DD)',record.date||today());if(date===null)return;
 const dateParts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),parsed=dateParts?new Date(Number(dateParts[1]),Number(dateParts[2])-1,Number(dateParts[3])):null;
 if(!parsed||parsed.getFullYear()!==Number(dateParts[1])||parsed.getMonth()!==Number(dateParts[2])-1||parsed.getDate()!==Number(dateParts[3])){alert('التاريخ غير صحيح.');return;}
 const note=window.prompt('ملاحظات / وصف',record.note||'');if(note===null)return;
 let quantity=record.quantity,crew=record.crew,unit=record.unit;
 if(kind==='siteLog'){const q=window.prompt('الكمية المنفذة (اتركها فارغة إذا لا تنطبق)',String(record.quantity||''));if(q===null)return;if(q!==''&&(!Number.isFinite(Number(q))||Number(q)<=0)){alert('الكمية يجب أن تكون أكبر من صفر.');return;}quantity=q===''?0:Number(q);crew=window.prompt('الصنايعي / الطاقم',record.crew||'');if(crew===null)return;unit=window.prompt('الوحدة',record.unit||'');if(unit===null)return;}
 if(kind==='purchase'&&state.payments.filter(x=>x.invoiceId===id).reduce((s,x)=>s+x.amount,0)>amount+.005){alert('قيمة الفاتورة لا يمكن أن تقل عن الدفعات المسددة عليها.');return;}
 if(kind==='payment'&&record.invoiceId){const invoice=state.purchases.find(x=>x.id===record.invoiceId),alreadyPaid=state.payments.filter(x=>x.invoiceId===record.invoiceId&&x.id!==id).reduce((s,x)=>s+x.amount,0);if(invoice&&alreadyPaid+amount>invoice.amount+.005){alert('إجمالي الدفعات سيتجاوز قيمة الفاتورة.');return;}}
 if(amountKinds.includes(kind))record.amount=amount;if(kind==='collection')record.reserved=amount*(Number(record.rate)||0)/100;
 record.date=date;record.note=note;if(kind==='siteLog'){record.quantity=quantity;record.crew=crew;record.unit=unit;}
 save();renderQuickLists();if(kind==='collection'||kind==='expense'||kind==='purchase'||kind==='laborEntry')renderReports();
}
document.addEventListener?.('click',e=>{
 const edit=e.target.closest?.('[data-edit-transaction]');if(edit){editTransaction(edit.dataset.editTransaction,edit.dataset.id);return;}
 const del=e.target.closest?.('[data-delete-transaction]');if(del){const kind=del.dataset.deleteTransaction,id=del.dataset.id,list={purchase:state.purchases,laborEntry:state.laborEntries,siteLog:state.siteLogs}[kind],record=list?.find(x=>x.id===id);if(!record)return;if(!confirm('حذف هذا السجل؟ لن يتم حذف أي دفعة مرتبطة بفاتورة تلقائياً.'))return;const target={purchase:state.purchases,laborEntry:state.laborEntries,siteLog:state.siteLogs}[kind];if(kind==='purchase'&&state.payments.some(x=>x.invoiceId===id)){alert('لا يمكن حذف فاتورة عليها دفعات. احذف أو عدّل الدفعات المرتبطة أولاً.');return;}const index=target.findIndex(x=>x.id===id);if(index>=0)target.splice(index,1);save();renderQuickLists();}
});
$('collectionList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-collection]');if(edit){editTransaction('collection',edit.dataset.editCollection);return;}});
$('expenseList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-expense]');if(edit){editTransaction('expense',edit.dataset.editExpense);return;}});
const baseRenderLists=render;



// Render the additive diary and accounting views on first load; no storage migration is performed.
render();renderReports();
