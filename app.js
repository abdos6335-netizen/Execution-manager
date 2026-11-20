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
function project(){return state.projects.find(p=>p.id===state.current)||state.projects[0]}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render();if(typeof renderReports==='function')renderReports()}
function currentItems(){return state.items.filter(x=>x.projectId===state.current)}
function currentContractors(){return state.contractors.filter(x=>x.projectId===state.current)}
function itemById(id){return state.items.find(x=>x.id===id)}
function contractorById(id){return state.contractors.find(x=>x.id===id)}
function paymentsForItem(id,type){return state.payments.filter(p=>p.itemId===id&&(!type||p.type===type))}
function paidForItem(id,type){return paymentsForItem(id,type).reduce((s,p)=>s+p.amount,0)}
function agreement(item,type){return Number(item?.[type==='materials'?'materialsAmount':'laborAmount']||0)}
function spentForProject(){const direct=state.expenses.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);const paid=state.payments.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);return direct+paid}
function setPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==page));document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('moreNavButton')?.classList.toggle('active',['collections','expenses','settings'].includes(page));if(['dashboard','items','contractors','collections','expenses'].includes(page))renderReports();$('moreNavMenu')?.classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'})}
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
 const its=currentItems(),cons=currentContractors(),agreed=its.reduce((s,x)=>s+agreement(x,'materials')+agreement(x,'labor'),0),paid=state.payments.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);
 $('dashboardSummary').innerHTML=[['عدد بنود التنفيذ',its.length],['عدد المقاولين والصنايعية',cons.length],['إجمالي اتفاقات البنود',money(agreed)],['المدفوع للمقاولين',money(paid)],['المتبقي من الاتفاقات',money(Math.max(0,agreed-paid))]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 const activity=[...cs.map(x=>({date:x.date,title:'تحصيل من العميل',amount:x.amount})),...ex.map(x=>({date:x.date,title:'مصروف: '+(x.item||'عام'),amount:-x.amount})),...state.payments.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:'دفعة '+(x.type==='materials'?'مونة':'أجرة'),amount:-x.amount}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);
 $('recentActivity').innerHTML=activity.length?activity.map(x=>'<div class="activity-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date)+'</small></div><b class="'+(x.amount<0?'negative':'positive')+'">'+(x.amount<0?'−':'+')+money(Math.abs(x.amount))+'</b></div>').join(''):'<div class="empty">لا توجد حركات مسجلة حتى الآن.</div>';
 const iq=normArabic($('itemsSearch')?.value||''),cq=normArabic($('contractorsSearch')?.value||'');const visibleItems=its.filter(x=>!iq||normArabic([x.name,x.category,...(x.aliases||[])].join(' ')).includes(iq)),visiblePeople=cons.filter(x=>!cq||normArabic([x.name,x.trade,...(x.aliases||[])].join(' ')).includes(cq));
 $('itemsList').innerHTML=visibleItems.length?visibleItems.map(itemCard).join(''):'<div class="empty wide">لا توجد بنود مطابقة للبحث.</div>';
 $('contractorsList').innerHTML=visiblePeople.length?visiblePeople.map(contractorCard).join(''):'<div class="empty wide">لا توجد أسماء مطابقة للبحث.</div>';
 $('itemMaterialsContractor').innerHTML='<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');$('itemLaborContractor').innerHTML='<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
 $('expenseItem').innerHTML='<option value="">مصروف عام للمشروع</option>'+its.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('');
 $('collectionList').innerHTML=cs.length?cs.slice().reverse().map(x=>'<div class="table-row expense-row"><div><strong>تحصيل عميل</strong><small>'+esc(x.date||'')+' · ربح محجوز '+money(x.reserved)+' · '+esc(x.rate)+'%</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-delete-collection="'+esc(x.id)+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد تحصيلات حتى الآن.</div>';
 $('expenseList').innerHTML=ex.length?ex.slice().reverse().map(x=>'<div class="table-row expense-row"><div><strong>'+esc((itemById(x.itemId)?.name||x.item||'مصروف عام')+' — '+typeLabel(x.type))+'</strong><small>'+esc(x.date||'')+(x.payee?' · '+esc(x.payee):'')+(x.note?' · '+esc(x.note):'')+'</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-delete-expense="'+esc(x.id)+'" aria-label="حذف المصروف">حذف</button></div></div>').join(''):'<div class="empty">لا توجد مصروفات مباشرة مسجلة.</div>';
 renderQuickLists();
}
function typeLabel(t){return t==='materials'?'مونة / خامات':t==='labor'?'مصنعية':'أخرى'}
function itemCard(i){
 const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(i.id,'materials'),lp=paidForItem(i.id,'labor'),c=contractorById(i.laborContractorId||i.contractorId),mc=contractorById(i.materialsContractorId||i.contractorId);
 return '<article class="record-card"><div class="card-top"><span class="pill">'+esc(i.status||'لم يبدأ')+'</span><span class="muted">'+esc(i.category||'بند تنفيذ')+'</span></div><h3>'+esc(i.name)+'</h3><p class="muted">'+esc(i.qty||1)+' '+esc(i.unit||'')+' · '+esc(i.method||'')+'</p><div class="split-stats"><div><small>المونة</small><b>'+money(m)+'</b><small>مدفوع '+money(mp)+' · متبقي '+money(Math.max(0,m-mp))+'</small></div><div><small>الأجرة</small><b>'+money(l)+'</b><small>مدفوع '+money(lp)+' · متبقي '+money(Math.max(0,l-lp))+'</small></div></div><div class="card-foot"><span>'+'المونة: '+esc(mc?.name||'غير محدد')+' · الأجرة: '+esc(c?.name||'غير محدد')+'</span><button class="text-btn" data-item-detail="'+esc(i.id)+'">التفاصيل والحركات ←</button></div></article>';
}
function expensesForContractor(c){const names=[c.name,...(c.aliases||[])].map(normArabic).filter(Boolean);return state.expenses.filter(x=>x.projectId===state.current&&(x.payeeId===c.id||(x.payee&&names.includes(normArabic(x.payee)))));}
function contractorTotals(c){
 const direct=expensesForContractor(c),directItemIds=new Set(direct.map(x=>x.itemId).filter(Boolean));
 const items=state.items.filter(i=>i.projectId===state.current&&(i.laborContractorId===c.id||i.materialsContractorId===c.id||i.contractorId===c.id||directItemIds.has(i.id)));
 const agreements=items.reduce((s,i)=>s+((i.laborContractorId||i.contractorId)===c.id?agreement(i,'labor'):0)+((i.materialsContractorId||i.contractorId)===c.id?agreement(i,'materials'):0),0);
 const payments=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===c.id).reduce((s,p)=>s+p.amount,0);
 const paid=payments+direct.reduce((s,x)=>s+x.amount,0);
 return {items,agreements,paid,payments,directExpenses:direct,balance:agreements-paid};
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
 const i=itemById(id);if(!i)return;const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(id,'materials'),lp=paidForItem(id,'labor'),all=paymentsForItem(id);
 $('itemEditor').classList.add('hidden');const d=$('itemDetail');d.classList.remove('hidden');
 d.innerHTML='<div class="surface-head"><div><span class="eyebrow">ITEM LEDGER</span><h2>'+esc(i.name)+'</h2></div><button class="icon-btn" data-close="itemDetail">✕</button></div><div class="detail-actions"><button class="btn btn-light" data-edit-item="'+esc(id)+'">تعديل بيانات البند</button><button class="btn btn-primary" data-add-payment="'+esc(id)+'">＋ تسجيل دفعة</button></div><div class="split-stats large"><div><small>حساب المونة</small><h3>'+money(m)+'</h3><p>مدفوع '+money(mp)+' · متبقي '+money(m-mp)+'</p></div><div><small>حساب الأجرة</small><h3>'+money(l)+'</h3><p>مدفوع '+money(lp)+' · متبقي '+money(l-lp)+'</p></div></div><div class="surface-inset"><h3>تسجيل دفعة على البند</h3><form id="paymentForm" class="form-grid compact"><input type="hidden" name="itemId" value="'+esc(id)+'"><label>نوع الحساب<select name="type"><option value="materials">المونة والخامات</option><option value="labor">الأجرة</option></select></label><label>المقاول / المستلم<select name="contractorId"><option value="">غير محدد</option>'+currentContractors().map(c=>'<option value="'+esc(c.id)+'" '+(c.id===(i.materialsContractorId||i.contractorId)?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label>المبلغ<input name="amount" type="number" min=".01" step=".01" required></label><label>التاريخ<input name="date" type="date" value="'+today()+'" required></label><label class="span-2">ملاحظات<input name="note" placeholder="دفعة / سلفة / مستخلص"></label><div class="form-actions"><button class="btn btn-primary">حفظ الدفعة</button></div></form></div><h3>سجل الدفعات</h3><div class="table-wrap">'+(all.length?all.slice().reverse().map(p=>'<div class="table-row expense-row"><div><strong>'+esc((p.type==='materials'?'مونة وخامات':'أجرة')+' · '+(contractorById(p.contractorId)?.name||'مستلم غير محدد'))+'</strong><small>'+esc(p.date||'')+(p.note?' · '+esc(p.note):'')+'</small></div><div class="expense-row-actions"><b>'+money(p.amount)+'</b><button type="button" class="delete-btn" data-delete-payment="'+esc(p.id)+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد دفعات مسجلة لهذا البند.</div>')+'</div><p class="hint">'+esc(i.notes||'')+'</p>';
 d.querySelectorAll('[data-delete-payment]').forEach(btn=>btn.onclick=()=>{const payment=state.payments.find(p=>p.id===btn.dataset.deletePayment&&p.projectId===state.current);if(!payment||!confirm('حذف الدفعة بقيمة '+money(payment.amount)+'؟ سيتم تحديث حسابات المشروع.'))return;state.payments=state.payments.filter(p=>p.id!==payment.id);save();showItemDetail(id)});d.querySelector('[data-close]').onclick=()=>d.classList.add('hidden');d.querySelector('[name=type]').onchange=ev=>{d.querySelector('[name=contractorId]').value=ev.target.value==='materials'?(i.materialsContractorId||i.contractorId||''):(i.laborContractorId||i.contractorId||'')};
 d.querySelector('[data-edit-item]').onclick=()=>openItemEditor(i);
 d.querySelector('[data-add-payment]').onclick=()=>d.querySelector('[name=amount]').focus();
 d.querySelector('#paymentForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),type=f.get('type'),amount=Number(f.get('amount')),contractorId=f.get('contractorId')||(type==='materials'?(i.materialsContractorId||i.contractorId):(i.laborContractorId||i.contractorId))||'';if(contractorId){if(type==='materials')i.materialsContractorId=contractorId;else i.laborContractorId=contractorId;}const remaining=agreement(i,type)-paidForItem(i.id,type);if(amount>remaining+0.005&&!confirm('الدفعة أكبر من المتبقي في هذا الحساب بمقدار '+money(amount-remaining)+'. هل تريد تسجيلها كسلفة / دفعة مقدمة؟'))return;state.payments.push({id:uid('pay'),projectId:state.current,itemId:i.id,type,contractorId,amount,date:f.get('date'),note:f.get('note')});save();showItemDetail(id)};
 d.scrollIntoView({behavior:'smooth',block:'start'});
}
function showContractorDetail(id){
 const c=contractorById(id);if(!c)return;const t=contractorTotals(c),pays=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===id),direct=t.directExpenses;
 const rows=t.items.map(i=>{const mat=(i.materialsContractorId||i.contractorId)===c.id,lab=(i.laborContractorId||i.contractorId)===c.id,directPaid=direct.filter(x=>x.itemId===i.id).reduce((s,x)=>s+x.amount,0),paid=pays.filter(p=>p.itemId===i.id).reduce((s,p)=>s+p.amount,0)+directPaid;return '<div class="table-row"><div><strong>'+esc(i.name)+'</strong><small>'+(mat?'مونة '+money(agreement(i,'materials'))+' · ':'')+(lab?'أجرة '+money(agreement(i,'labor')):'')+'</small></div><b>مدفوع '+money(paid)+'</b></div>'}).join('');
 $('contractorDetail').classList.remove('hidden');$('contractorDetail').innerHTML='<div class="surface-head"><div><span class="eyebrow">CONTRACTOR STATEMENT</span><h2>'+esc(c.name)+'</h2><p class="muted">'+esc(c.trade||'')+' · '+esc(c.phone||'')+'</p></div><div class="inline-actions"><button class="btn btn-light" id="editContractor">تعديل البيانات</button><button class="icon-btn" data-close="contractorDetail">✕</button></div></div><div class="metric-grid mini"><div class="metric"><span>إجمالي الاتفاقات</span><strong>'+money(t.agreements)+'</strong></div><div class="metric"><span>إجمالي المدفوع</span><strong>'+money(t.paid)+'</strong></div><div class="metric"><span>المتبقي</span><strong>'+money(t.balance)+'</strong></div></div><h3>البنود المسندة</h3><div class="table-wrap">'+(rows||'<div class="empty">لا توجد بنود مرتبطة بهذا المقاول.</div>')+'</div><h3>سجل المدفوعات والمشتريات</h3><div class="table-wrap">'+(pays.length||direct.length?[...pays.map(p=>({id:p.id,date:p.date,title:(itemById(p.itemId)?.name||'بند')+' · '+(p.type==='materials'?'مونة':'أجرة'),amount:p.amount,note:p.note||'',kind:'payment'})),...direct.map(x=>({id:x.id,date:x.date,title:(itemById(x.itemId)?.name||x.item||'مصروف عام')+' · مصروف مباشر',amount:x.amount,note:x.note||'',kind:'expense'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>'<div class="table-row expense-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date||'')+(x.note?' · '+esc(x.note):'')+'</small></div><div class="expense-row-actions"><b>'+money(x.amount)+'</b><button type="button" class="delete-btn" data-ledger-delete="'+esc(x.id)+'" data-ledger-kind="'+x.kind+'">حذف</button></div></div>').join(''):'<div class="empty">لا توجد دفعات أو مشتريات مسجلة لهذا الشخص.</div>')+'</div>';
 $('contractorDetail').querySelectorAll('[data-ledger-delete]').forEach(btn=>btn.onclick=()=>{const isPayment=btn.dataset.ledgerKind==='payment',idToDelete=btn.dataset.ledgerDelete;if(!confirm('حذف هذه الحركة؟ سيتم تحديث كشف الحساب وإجماليات المشروع.'))return;if(isPayment)state.payments=state.payments.filter(x=>x.id!==idToDelete);else state.expenses=state.expenses.filter(x=>x.id!==idToDelete);save();showContractorDetail(id)});$('contractorDetail').querySelector('[data-close]').onclick=()=> $('contractorDetail').classList.add('hidden');$('contractorDetail').querySelector('#editContractor').onclick=()=>{ $('contractorId').value=c.id;$('contractorName').value=c.name;$('contractorAliases').value=(c.aliases||[]).join('، ');$('contractorPhone').value=c.phone||'';$('contractorTrade').value=c.trade||'';$('contractorNotes').value=c.notes||'';$('contractorFormTitle').textContent='تعديل بيانات '+c.name;$('contractorEditor').classList.remove('hidden');$('contractorEditor').scrollIntoView({behavior:'smooth'});};$('contractorDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
$('projectSelect').onchange=e=>{state.current=e.target.value;save();renderQuickLists();renderReports()};
$('itemsSearch').addEventListener('input',render);$('contractorsSearch').addEventListener('input',render);
$('addProject').onclick=()=>{const name=prompt('اسم المشروع الجديد؟');if(!name?.trim())return;const p={id:uid('prj'),name:name.trim(),rate:10};state.projects.push(p);state.current=p.id;save()};
$('newItemBtn').onclick=()=>openItemEditor(null);$('newContractorBtn').onclick=()=>{ $('contractorEditor').classList.remove('hidden');$('contractorForm').reset();$('contractorId').value='';$('contractorFormTitle').textContent='إضافة مقاول أو صنايعي';$('contractorEditor').scrollIntoView({behavior:'smooth'})};
$('itemsList').addEventListener('click',e=>{const d=e.target.closest('[data-item-detail]'),ed=e.target.closest('[data-edit-item]');if(d)showItemDetail(d.dataset.itemDetail);if(ed)openItemEditor(itemById(ed.dataset.editItem))});
$('contractorsList').addEventListener('click',e=>{const d=e.target.closest('[data-contractor-detail]');if(d)showContractorDetail(d.dataset.contractorDetail)});
$('itemForm').onsubmit=e=>{e.preventDefault();const id=$('itemId').value,old=itemById(id);const data={id:id||uid('item'),projectId:state.current,name:$('itemName').value.trim(),aliases:$('itemAliases').value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean),category:$('itemCategory').value.trim(),qty:Number($('itemQty').value)||0,unit:$('itemUnit').value,method:$('itemMethod').value,materialsContractorId:$('itemMaterialsContractor').value,laborContractorId:$('itemLaborContractor').value,status:$('itemStatus').value,materialsAmount:Number($('itemMaterials').value)||0,supplier:$('itemSupplier').value.trim(),laborAmount:Number($('itemLabor').value)||0,notes:$('itemNotes').value.trim()};if(old)Object.assign(old,data);else state.items.push(data);$('itemEditor').classList.add('hidden');save()};
$('contractorForm').onsubmit=e=>{e.preventDefault();const id=$('contractorId').value,old=contractorById(id),data={id:id||uid('con'),projectId:state.current,name:$('contractorName').value.trim(),aliases:$('contractorAliases').value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean),phone:$('contractorPhone').value.trim(),trade:$('contractorTrade').value.trim(),notes:$('contractorNotes').value.trim()};if(old)Object.assign(old,data);else state.contractors.push(data);$('contractorEditor').classList.add('hidden');e.target.reset();$('contractorId').value='';save()};
$('collectionDate').value=today();$('expenseDate').value=today();
$('collectionForm').onsubmit=e=>{e.preventDefault();const amount=Number($('collectionAmount').value),rate=Number(project().rate);state.collections.push({id:uid('col'),project:state.current,amount,rate,reserved:amount*rate/100,date:$('collectionDate').value,note:$('collectionNote').value});e.target.reset();$('collectionDate').value=today();save()};
$('expenseForm').onsubmit=e=>{e.preventDefault();const payee=$('expensePayee').value.trim(),matchedPayee=findNamedRecord(currentContractors(),payee);state.expenses.push({id:uid('ex'),projectId:state.current,itemId:$('expenseItem').value,item:itemById($('expenseItem').value)?.name||'',type:$('expenseType').value,amount:Number($('expenseAmount').value),payee,payeeId:matchedPayee?.id||'',date:$('expenseDate').value,note:$('expenseNote').value,kind:'direct'});e.target.reset();$('expenseDate').value=today();save()};
$('collectionList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete-collection]');if(!btn)return;const id=btn.dataset.deleteCollection,record=state.collections.find(x=>x.id===id&&x.project===state.current);if(!record||!confirm('حذف التحصيل بقيمة '+money(record.amount)+'؟ سيتم تحديث الربح المحجوز والمتاح للتنفيذ.'))return;state.collections=state.collections.filter(x=>x.id!==id);save()});
$('expenseList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete-expense]');if(!btn)return;const id=btn.dataset.deleteExpense;const record=state.expenses.find(x=>x.id===id&&x.projectId===state.current);if(!record)return;if(!confirm('هل أنت متأكد من حذف هذا المصروف بقيمة '+money(record.amount)+'؟ لا يمكن التراجع عن الحذف.'))return;state.expenses=state.expenses.filter(x=>x.id!==id);save()});
$('settingsForm').onsubmit=e=>{e.preventDefault();project().name=$('projectName').value.trim();project().rate=Number($('profitRate').value);save();alert('تم حفظ إعدادات المشروع')};
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
  state=next;render();renderQuickLists();renderReports();
  alert('تم استيراد النسخة الاحتياطية بنجاح');
 }catch(err){alert('تعذر استيراد النسخة الاحتياطية. لم يتم استبدال بياناتك الحالية. تأكد من سلامة الملف وتوفر مساحة تخزين كافية.');}
 finally{e.target.value=''}
};
render();


// Phase 2: unified daily entry + on-demand personal reports.
// Existing records and the original accounting formulas remain unchanged.
function normArabic(s){return String(s||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ًٌٍَُِّْـ]/g,'').replace(/[٬,]/g,'').replace(/\s+/g,' ').trim().toLowerCase()}
function findNamedRecord(list,name){const n=normArabic(name);if(!n)return null;return list.find(x=>normArabic(x.name)===n||(x.aliases||[]).some(a=>normArabic(a)===n))||null;}
function parseAmountFromText(raw){const t=normArabic(raw).replace(/[,٬]/g,'');const patterns=[/(?:بـ|ب|اجمالي|المبلغ|قيمه|قيمة)\s*(\d+(?:\.\d+)?)/,/(\d+(?:\.\d+)?)\s*(?:جنيه|جنيهات|جم|ج\.م)/];for(const re of patterns){const m=t.match(re);if(m)return Number(m[1]);}const nums=t.match(/\d+(?:\.\d+)?/g);return nums?.length?Number(nums[nums.length-1]):null;}
function parseQuickText(){
 const raw=$('quickText').value.trim();if(!raw)return;
 const t=normArabic(raw),amount=parseAmountFromText(raw);
 if(amount!==null&&amount>0&&!$('quickAmount').value)$('quickAmount').value=amount;
 if(/تحصيل|استلمت|قبضت/.test(t))$('quickKind').value='collection';
 else if(/خامات|مونه|اشتريت|شراء|مشتريات|مورد|توريد|جردل|اسمنت|سيراميك/.test(t))$('quickKind').value='materials';
 else if(/اجره|مصنعيه|صنايعي|نقاش|نجار|كهربائي|سباك|دفعت|مقاول/.test(t))$('quickKind').value='labor';
 $('quickNote').value=raw;
}
function renderQuickLists(){
 $('quickItems').innerHTML=currentItems().flatMap(x=>[x.name,...(x.aliases||[])]).map(n=>'<option value="'+esc(n)+'"></option>').join('');
 $('quickPeople').innerHTML=currentContractors().flatMap(x=>[x.name,...(x.aliases||[])]).map(n=>'<option value="'+esc(n)+'"></option>').join('');
 const rows=[...state.expenses.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:x.item||'مصروف عام',amount:-x.amount,sub:typeLabel(x.type)})),...state.payments.filter(x=>x.projectId===state.current).map(x=>({date:x.date,title:contractorById(x.contractorId)?.name||'دفعة مقاول',amount:-x.amount,sub:itemById(x.itemId)?.name||'بند غير محدد'})),...state.collections.filter(x=>x.project===state.current).map(x=>({date:x.date,title:'تحصيل من العميل',amount:x.amount,sub:'تحصيل'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,7);
 $('quickRecent').innerHTML=rows.length?rows.map(x=>'<div class="activity-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.date)+' · '+esc(x.sub)+'</small></div><b class="'+(x.amount<0?'negative':'positive')+'">'+(x.amount<0?'−':'+')+money(Math.abs(x.amount))+'</b></div>').join(''):'<div class="empty">لسه مفيش حركات مسجلة.</div>';
}
function answerReportQuestion(){
 const raw=$('reportQuestion').value.trim(),q=normArabic(raw);
 if(!q){$('reportAnswer').textContent='اكتب سؤالك الأول.';return;}
 const ex=state.expenses.filter(x=>x.projectId===state.current),pays=state.payments.filter(x=>x.projectId===state.current),cols=state.collections.filter(x=>x.project===state.current);
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
 const movements=ex.map(x=>({date:x.date,amount:x.amount,type:x.type,item:x.itemId||normArabic(x.item),person:normArabic(x.payee)})).concat(pays.map(x=>({date:x.date,amount:x.amount,type:x.type,item:x.itemId,person:x.contractorId})));const duplicates=[];const seen=new Set();movements.forEach(x=>{const key=[x.date,x.amount,x.type,x.item,x.person].join('|');if(seen.has(key))duplicates.push(x);else seen.add(key)});const unclassified=ex.filter(x=>!x.itemId&&!x.item&&!x.payee).length;$('reportWarnings').innerHTML=(duplicates.length?'<div class="summary-row"><span>تنبيه: حركات متطابقة محتملة</span><strong>'+duplicates.length+'</strong></div>':'')+(unclassified?'<div class="summary-row"><span>مصروفات بدون بند أو مستلم</span><strong>'+unclassified+'</strong></div>':'')||'<div class="muted">لا توجد تنبيهات واضحة على الحركات الحالية.</div>';
 if(from&&to&&from<=to){const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z'),days=Math.round((end-start)/86400000)+1,prevEnd=new Date(start.getTime()-86400000),prevStart=new Date(start.getTime()-days*86400000),fmt=d=>d.toISOString().slice(0,10),prev=(x)=>x>=fmt(prevStart)&&x<=fmt(prevEnd),prevCost=state.expenses.filter(x=>x.projectId===state.current&&prev(x.date)).reduce((a,x)=>a+x.amount,0)+state.payments.filter(x=>x.projectId===state.current&&prev(x.date)).reduce((a,x)=>a+x.amount,0),nowCost=totalEx+totalPay;$('reportComparison').textContent='الفترة الحالية '+from+' إلى '+to+': تكلفة '+money(nowCost)+'، التحصيل '+money(totalCol)+'. الفترة السابقة '+fmt(prevStart)+' إلى '+fmt(prevEnd)+': تكلفة '+money(prevCost)+'. فرق التكلفة '+money(nowCost-prevCost)+'.';}else{$('reportComparison').textContent='حدد تاريخ بداية ونهاية للمقارنة مع الفترة السابقة بنفس المدة.';}
 if($('collectionReportSummary'))$('collectionReportSummary').innerHTML=[['إجمالي التحصيل',money(totalCol)],['الربح المحجوز',money(cols.reduce((s,x)=>s+x.reserved,0))],['عدد التحصيلات',cols.length]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 if($('expenseReportSummary'))$('expenseReportSummary').innerHTML=[['المصروفات المباشرة',money(totalEx)],['دفعات المونة والأجرة',money(totalPay)],['إجمالي تكلفة التنفيذ',money(totalEx+totalPay)]].map(x=>'<div class="summary-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
 window.currentReportRows=all;renderReportRows();
}
function renderReportRows(){const q=normArabic($('reportSearch')?.value||''),from=$('reportFrom')?.value||'',to=$('reportTo')?.value||'';const rows=(window.currentReportRows||[]).filter(x=>{const hay=normArabic([x.title,x.person,x.date].join(' '));return (!q||hay.includes(q))&&(!from||x.date>=from)&&(!to||x.date<=to)});$('reportTransactions').innerHTML=rows.length?rows.map(x=>entryRow(x.date,x.title,x.amount,x.person)).join(''):'<div class="empty">لا توجد حركات مطابقة للتصفية.</div>';
}
$('quickDate').value=today();
$('quickText').addEventListener('input',parseQuickText);
$('quickForm').addEventListener('submit',e=>{
 e.preventDefault();const kind=$('quickKind').value,amount=Number($('quickAmount').value),itemName=$('quickItem').value.trim(),personName=$('quickPerson').value.trim(),date=$('quickDate').value,note=$('quickNote').value.trim();
 if(!amount||amount<=0||!date)return;
 if(kind==='collection'){const rate=Number(project().rate);state.collections.push({id:uid('col'),project:state.current,amount,rate,reserved:amount*rate/100,date,note});}
 else {
  let item=null,person=null;
  const existingItem=itemName?findNamedRecord(currentItems(),itemName):null,existingPerson=personName?findNamedRecord(currentContractors(),personName):null;
  if(itemName&&!existingItem&&!confirm('البند "'+itemName+'" غير مسجل. هل تريد إنشاءه وربط الحركة به؟'))return;
  if(personName&&!existingPerson&&!confirm('الشخص / المورد "'+personName+'" غير مسجل. هل تريد إنشاء ملف له؟'))return;
  item=existingItem;if(itemName&&!item){item={id:uid('item'),projectId:state.current,name:itemName,aliases:[],category:'',qty:1,unit:'',method:'',materialsAmount:0,laborAmount:0,status:'جاري التنفيذ'};}
  person=existingPerson;if(personName&&!person){person={id:uid('con'),projectId:state.current,name:personName,aliases:[],phone:'',trade:kind==='labor'?'صنايعي':'مورد',notes:''};}
  if(item&&!existingItem)state.items.push(item);if(person&&!existingPerson)state.contractors.push(person);
  if(kind==='labor'&&item&&person){
   state.payments.push({id:uid('pay'),projectId:state.current,itemId:item.id,type:'labor',contractorId:person.id,amount,date,note});
  }else{
   state.expenses.push({id:uid('ex'),projectId:state.current,itemId:item?.id||'',item:item?.name||itemName,type:kind==='materials'?'materials':kind==='labor'?'labor':'other',amount,payee:person?.name||personName,payeeId:person?.id||'',date,note,kind:'direct'});
  }
 }
 $('quickForm').reset();$('quickDate').value=today();$('quickText').value='';save();renderQuickLists();alert('تم تسجيل الحركة.');
});
$('voiceEntry').addEventListener('click',()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('voiceStatus').textContent='التسجيل الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome أو اكتب الحركة.';return;}
 const rec=new SR();rec.lang='ar-EG';rec.interimResults=false;rec.maxAlternatives=1;
 $('voiceStatus').textContent='بتسمعك دلوقتي… اتكلم بوضوح.';
 rec.onresult=e=>{$('quickText').value=e.results[0][0].transcript;parseQuickText();$('voiceStatus').textContent='تم تحويل الكلام لنص. راجع البيانات قبل التسجيل.'};
 rec.onerror=()=>{$('voiceStatus').textContent='حصلت مشكلة في التعرف على الصوت. اكتب الحركة يدويًا.'};
 rec.onend=()=>{if($('voiceStatus').textContent.includes('بتسمعك'))$('voiceStatus').textContent='انتهى التسجيل.'};
 rec.start();
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
const APPEARANCE_KEY='em:appearance',APPEARANCE_DEFAULT={mode:'light',accent:'#302e32',background:'#e3e3e4',font:'ibm',scale:100};
const APPEARANCE_PRESETS={glass:{accent:'#302e32',background:'#e3e3e4'},sage:{accent:'#3f5a4a',background:'#dfe6df'},sand:{accent:'#6b5a43',background:'#ebe4d8'},slate:{accent:'#38465c',background:'#dde2ea'},rose:{accent:'#7a3b4f',background:'#ede2e5'}};
function getAppearance(){try{return {...APPEARANCE_DEFAULT,...JSON.parse(localStorage.getItem(APPEARANCE_KEY)||'{}')}}catch{return {...APPEARANCE_DEFAULT}}}
function applyAppearance(){
 const a=getAppearance(),mode=a.mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):a.mode,dark=mode==='dark',bg=dark?'#1b1b1d':a.background,accent=a.accent||'#302e32';
 const mix=(x,y,t)=>{const p=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)],A=p(x),B=p(y);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
 const rgb=accent.match(/[0-9a-f]{2}/gi)?.map(x=>parseInt(x,16)/255)||[.2,.2,.2],linear=rgb.map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4),accentInk=.2126*linear[0]+.7152*linear[1]+.0722*linear[2]>.45?'#14161a':'#fff';
 const root=document.documentElement,vars={'--canvas':bg,'--paper':dark?'#232325':'#f0f1f0','--ink':dark?'#f2f2f4':'#161618','--muted':dark?'#9a9aa0':'#86868b','--line':dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.085)','--nav':dark?'#262628':'#ececed','--nav2':dark?'#303033':'#e4e5e4','--accent':accent,'--accent-ink':accentInk,'--accent-soft':dark?mix('#1b1b1d',accent,.22):mix(bg,accent,.14),'--shadow':dark?'0 1px 0 rgba(255,255,255,.06) inset,0 14px 30px -12px rgba(0,0,0,.65)':'0 1px 0 rgba(255,255,255,.95) inset,0 12px 28px -12px rgba(20,20,26,.20)','--scale':String((Number(a.scale)||100)/100)};
 Object.entries(vars).forEach(([k,v])=>root.style.setProperty(k,v));
 const fonts={ibm:['IBM Plex Sans Arabic','IBM+Plex+Sans+Arabic:wght@400;500;600;700'],alexandria:['Alexandria','Alexandria:wght@300;400;500;600'],readex:['Readex Pro','Readex+Pro:wght@300;400;500;600'],noto:['Noto Sans Arabic','Noto+Sans+Arabic:wght@300;400;500;600'],almarai:['Almarai','Almarai:wght@300;400;700'],cairo:['Cairo','Cairo:wght@300;400;500;600'],tajawal:['Tajawal','Tajawal:wght@300;400;500;700'],system:['system-ui','']};
 const f=fonts[a.font]||fonts.ibm;root.style.setProperty('--app-font','Inter,"'+f[0]+'",system-ui,sans-serif');root.dataset.dark=dark?'1':'0';root.style.colorScheme=dark?'dark':'light';
 if(f[1]&&!document.getElementById('em-font-'+a.font)){const l=document.createElement('link');l.id='em-font-'+a.font;l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family='+f[1]+'&display=swap';document.head.appendChild(l)}
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=bg;
}
function syncAppearanceControls(){const a=getAppearance();[['appearanceMode','mode'],['appearanceAccent','accent'],['appearanceBackground','background'],['appearanceFont','font'],['appearanceScale','scale']].forEach(([id,key])=>{const el=$(id);if(el)el.value=a[key]});if($('appearanceScaleValue'))$('appearanceScaleValue').textContent=a.scale+'%'}
function saveAppearance(patch){localStorage.setItem(APPEARANCE_KEY,JSON.stringify({...getAppearance(),...patch}));applyAppearance();syncAppearanceControls()}
[['appearanceMode','mode'],['appearanceAccent','accent'],['appearanceBackground','background'],['appearanceFont','font'],['appearanceScale','scale']].forEach(([id,key])=>$(id)?.addEventListener('input',e=>{saveAppearance({[key]:key==='scale'?Number(e.target.value):e.target.value});if(key==='scale'&&$('appearanceScaleValue'))$('appearanceScaleValue').textContent=e.target.value+'%'}));
document.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>{const p=APPEARANCE_PRESETS[b.dataset.palette];if(p)saveAppearance(p)}));
$('resetAppearance')?.addEventListener('click',()=>{localStorage.removeItem(APPEARANCE_KEY);applyAppearance();syncAppearanceControls()});
applyAppearance();syncAppearanceControls();
if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(getAppearance().mode==='system')applyAppearance()});
renderReports();
