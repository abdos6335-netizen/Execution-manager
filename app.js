const KEY='execution-manager-v02';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0)+' ج.م';
const today=()=>new Date().toISOString().slice(0,10);
const uid=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loadState(){
 let raw=null;try{raw=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('execution-manager-v01')||'null')}catch{}
 if(!raw)raw={projects:[{id:'p1',name:'المشروع الأول',rate:10}],current:'p1',collections:[],expenses:[],items:[],contractors:[],payments:[]};
 raw.projects=raw.projects||[{id:'p1',name:'المشروع الأول',rate:10}];raw.current=raw.current||raw.projects[0].id;
 raw.collections=(raw.collections||[]).map(x=>({...x,amount:Number(x.amount)||0,reserved:Number(x.reserved??(Number(x.amount||0)*Number(x.rate||0)/100))||0,rate:Number(x.rate)||0}));
 raw.expenses=(raw.expenses||[]).map(x=>({...x,id:x.id||uid('ex'),amount:Number(x.amount)||0,kind:x.kind||'legacy',itemId:x.itemId||'',type:x.type==='خامات'?'materials':x.type==='مصنعية'?'labor':(x.type||'other')}));
 raw.items=raw.items||[];raw.contractors=raw.contractors||[];raw.payments=raw.payments||[];
 return raw;
}
let state=loadState();
function project(){return state.projects.find(p=>p.id===state.current)||state.projects[0]}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function currentItems(){return state.items.filter(x=>x.projectId===state.current)}
function currentContractors(){return state.contractors.filter(x=>x.projectId===state.current)}
function itemById(id){return state.items.find(x=>x.id===id)}
function contractorById(id){return state.contractors.find(x=>x.id===id)}
function paymentsForItem(id,type){return state.payments.filter(p=>p.itemId===id&&(!type||p.type===type))}
function paidForItem(id,type){return paymentsForItem(id,type).reduce((s,p)=>s+p.amount,0)}
function agreement(item,type){return Number(item?.[type==='materials'?'materialsAmount':'laborAmount']||0)}
function spentForProject(){const direct=state.expenses.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);const paid=state.payments.filter(x=>x.projectId===state.current).reduce((s,x)=>s+x.amount,0);return direct+paid}
function setPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==page));document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));window.scrollTo({top:0,behavior:'smooth'})}
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
 $('itemsList').innerHTML=its.length?its.map(itemCard).join(''):'<div class="empty wide">لا توجد بنود لهذا المشروع. ابدأ بإضافة أول بند.</div>';
 $('contractorsList').innerHTML=cons.length?cons.map(contractorCard).join(''):'<div class="empty wide">لا يوجد مقاولون مسجلون لهذا المشروع.</div>';
 $('itemMaterialsContractor').innerHTML='<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');$('itemLaborContractor').innerHTML='<option value="">غير محدد</option>'+cons.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
 $('expenseItem').innerHTML='<option value="">مصروف عام للمشروع</option>'+its.map(i=>'<option value="'+i.id+'">'+esc(i.name)+'</option>').join('');
 $('collectionList').innerHTML=cs.length?cs.slice().reverse().map(x=>entryRow(x.date,'تحصيل عميل',x.amount,'ربح محجوز '+money(x.reserved)+' · '+x.rate+'%')).join(''):'<div class="empty">لا توجد تحصيلات حتى الآن.</div>';
 $('expenseList').innerHTML=ex.length?ex.slice().reverse().map(x=>entryRow(x.date,(itemById(x.itemId)?.name||x.item||'مصروف عام')+' — '+typeLabel(x.type),x.amount,x.payee||x.note||'')).join(''):'<div class="empty">لا توجد مصروفات مباشرة مسجلة.</div>';
}
function typeLabel(t){return t==='materials'?'مونة / خامات':t==='labor'?'مصنعية':'أخرى'}
function itemCard(i){
 const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(i.id,'materials'),lp=paidForItem(i.id,'labor'),c=contractorById(i.contractorId);
 return '<article class="record-card"><div class="card-top"><span class="pill">'+esc(i.status||'لم يبدأ')+'</span><span class="muted">'+esc(i.category||'بند تنفيذ')+'</span></div><h3>'+esc(i.name)+'</h3><p class="muted">'+esc(i.qty||1)+' '+esc(i.unit||'')+' · '+esc(i.method||'')+'</p><div class="split-stats"><div><small>المونة</small><b>'+money(m)+'</b><small>مدفوع '+money(mp)+' · متبقي '+money(Math.max(0,m-mp))+'</small></div><div><small>الأجرة</small><b>'+money(l)+'</b><small>مدفوع '+money(lp)+' · متبقي '+money(Math.max(0,l-lp))+'</small></div></div><div class="card-foot"><span>'+'المونة: '+esc(mc?.name||'غير محدد')+' · الأجرة: '+esc(c?.name||'غير محدد')+'</span><button class="text-btn" data-item-detail="'+i.id+'">التفاصيل والحركات ←</button></div></article>';
}
function contractorTotals(c){
 const items=state.items.filter(i=>i.projectId===state.current&&(i.laborContractorId===c.id||i.materialsContractorId===c.id||i.contractorId===c.id));
 const agreements=items.reduce((s,i)=>s+((i.laborContractorId||i.contractorId)===c.id?agreement(i,'labor'):0)+((i.materialsContractorId||i.contractorId)===c.id?agreement(i,'materials'):0),0);
 const paid=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===c.id).reduce((s,p)=>s+p.amount,0);
 return {items,agreements,paid,balance:agreements-paid};
}
function contractorCard(c){
 const t=contractorTotals(c);
 return '<article class="record-card"><div class="card-top"><span class="pill">'+esc(c.trade||'مقاول / صنايعي')+'</span></div><h3>'+esc(c.name)+'</h3><p class="muted">'+esc(c.phone||'لا يوجد رقم هاتف')+'</p><div class="split-stats"><div><small>إجمالي الاتفاقات المرتبطة</small><b>'+money(t.agreements)+'</b></div><div><small>المدفوع / المتبقي</small><b>'+money(t.paid)+' / '+money(t.balance)+'</b></div></div><div class="card-foot"><span>'+t.items.length+' بند مرتبط</span><button class="text-btn" data-contractor-detail="'+c.id+'">كشف الحساب ←</button></div></article>';
}
function openItemEditor(item){
 $('itemEditor').classList.remove('hidden');$('itemDetail').classList.add('hidden');
 $('itemFormTitle').textContent=item?'تعديل بيانات البند':'إضافة بند جديد';$('itemId').value=item?.id||'';
 $('itemName').value=item?.name||'';$('itemCategory').value=item?.category||'';$('itemQty').value=item?.qty??1;$('itemUnit').value=item?.unit||'م²';$('itemMethod').value=item?.method||'بالمتر / الوحدة';$('itemMaterialsContractor').value=item?.materialsContractorId||item?.contractorId||'';$('itemLaborContractor').value=item?.laborContractorId||item?.contractorId||'';$('itemStatus').value=item?.status||'لم يبدأ';$('itemMaterials').value=item?.materialsAmount??0;$('itemSupplier').value=item?.supplier||'';$('itemLabor').value=item?.laborAmount??0;$('itemNotes').value=item?.notes||'';
 $('itemEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function showItemDetail(id){
 const i=itemById(id);if(!i)return;const m=agreement(i,'materials'),l=agreement(i,'labor'),mp=paidForItem(id,'materials'),lp=paidForItem(id,'labor'),all=paymentsForItem(id);
 $('itemEditor').classList.add('hidden');const d=$('itemDetail');d.classList.remove('hidden');
 d.innerHTML='<div class="surface-head"><div><span class="eyebrow">ITEM LEDGER</span><h2>'+esc(i.name)+'</h2></div><button class="icon-btn" data-close="itemDetail">✕</button></div><div class="detail-actions"><button class="btn btn-light" data-edit-item="'+id+'">تعديل بيانات البند</button><button class="btn btn-primary" data-add-payment="'+id+'">＋ تسجيل دفعة</button></div><div class="split-stats large"><div><small>حساب المونة</small><h3>'+money(m)+'</h3><p>مدفوع '+money(mp)+' · متبقي '+money(m-mp)+'</p></div><div><small>حساب الأجرة</small><h3>'+money(l)+'</h3><p>مدفوع '+money(lp)+' · متبقي '+money(l-lp)+'</p></div></div><div class="surface-inset"><h3>تسجيل دفعة على البند</h3><form id="paymentForm" class="form-grid compact"><input type="hidden" name="itemId" value="'+id+'"><label>نوع الحساب<select name="type"><option value="materials">المونة والخامات</option><option value="labor">الأجرة</option></select></label><label>المقاول / المستلم<select name="contractorId"><option value="">غير محدد</option>'+currentContractors().map(c=>'<option value="'+c.id+'" '+(c.id===i.contractorId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label>المبلغ<input name="amount" type="number" min=".01" step=".01" required></label><label>التاريخ<input name="date" type="date" value="'+today()+'" required></label><label class="span-2">ملاحظات<input name="note" placeholder="دفعة / سلفة / مستخلص"></label><div class="form-actions"><button class="btn btn-primary">حفظ الدفعة</button></div></form></div><h3>سجل الدفعات</h3><div class="table-wrap">'+(all.length?all.slice().reverse().map(p=>entryRow(p.date,(p.type==='materials'?'مونة وخامات':'أجرة')+' · '+(contractorById(p.contractorId)?.name||'مستلم غير محدد'),p.amount,p.note||'')).join(''):'<div class="empty">لا توجد دفعات مسجلة لهذا البند.</div>')+'</div><p class="hint">'+esc(i.notes||'')+'</p>';
 d.querySelector('[data-close]').onclick=()=>d.classList.add('hidden');
 d.querySelector('[data-edit-item]').onclick=()=>openItemEditor(i);
 d.querySelector('[data-add-payment]').onclick=()=>d.querySelector('[name=amount]').focus();
 d.querySelector('#paymentForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),type=f.get('type'),amount=Number(f.get('amount')),contractorId=f.get('contractorId')||i.contractorId||'';const remaining=agreement(i,type)-paidForItem(i.id,type);if(amount>remaining+0.005&&!confirm('الدفعة أكبر من المتبقي في هذا الحساب بمقدار '+money(amount-remaining)+'. هل تريد تسجيلها كسلفة / دفعة مقدمة؟'))return;state.payments.push({id:uid('pay'),projectId:state.current,itemId:i.id,type,contractorId,amount,date:f.get('date'),note:f.get('note')});save();showItemDetail(id)};
 d.scrollIntoView({behavior:'smooth',block:'start'});
}
function showContractorDetail(id){
 const c=contractorById(id);if(!c)return;const t=contractorTotals(c),pays=state.payments.filter(p=>p.projectId===state.current&&p.contractorId===id);
 const rows=t.items.map(i=>'<div class="table-row"><div><strong>'+esc(i.name)+'</strong><small>مونة '+money(agreement(i,'materials'))+' · أجرة '+money(agreement(i,'labor'))+'</small></div><b>مدفوع '+money(pays.filter(p=>p.itemId===i.id).reduce((s,p)=>s+p.amount,0))+'</b></div>').join('');
 $('contractorDetail').classList.remove('hidden');$('contractorDetail').innerHTML='<div class="surface-head"><div><span class="eyebrow">CONTRACTOR STATEMENT</span><h2>'+esc(c.name)+'</h2><p class="muted">'+esc(c.trade||'')+' · '+esc(c.phone||'')+'</p></div><button class="icon-btn" data-close="contractorDetail">✕</button></div><div class="metric-grid mini"><div class="metric"><span>إجمالي الاتفاقات</span><strong>'+money(t.agreements)+'</strong></div><div class="metric"><span>إجمالي المدفوع</span><strong>'+money(t.paid)+'</strong></div><div class="metric"><span>المتبقي</span><strong>'+money(t.balance)+'</strong></div></div><h3>البنود المسندة</h3><div class="table-wrap">'+(rows||'<div class="empty">لا توجد بنود مرتبطة بهذا المقاول.</div>')+'</div><h3>سجل الدفعات</h3><div class="table-wrap">'+(pays.length?pays.slice().reverse().map(p=>entryRow(p.date,(itemById(p.itemId)?.name||'بند')+' · '+(p.type==='materials'?'مونة':'أجرة'),p.amount,p.note||'')).join(''):'<div class="empty">لا توجد دفعات لهذا المقاول.</div>')+'</div>';
 $('contractorDetail').querySelector('[data-close]').onclick=()=> $('contractorDetail').classList.add('hidden');$('contractorDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
$('projectSelect').onchange=e=>{state.current=e.target.value;save()};
$('addProject').onclick=()=>{const name=prompt('اسم المشروع الجديد؟');if(!name?.trim())return;const p={id:uid('prj'),name:name.trim(),rate:10};state.projects.push(p);state.current=p.id;save()};
$('newItemBtn').onclick=()=>openItemEditor(null);$('newContractorBtn').onclick=()=>{$('contractorEditor').classList.remove('hidden');$('contractorForm').reset();$('contractorEditor').scrollIntoView({behavior:'smooth'})};
$('itemsList').addEventListener('click',e=>{const d=e.target.closest('[data-item-detail]'),ed=e.target.closest('[data-edit-item]');if(d)showItemDetail(d.dataset.itemDetail);if(ed)openItemEditor(itemById(ed.dataset.editItem))});
$('contractorsList').addEventListener('click',e=>{const d=e.target.closest('[data-contractor-detail]');if(d)showContractorDetail(d.dataset.contractorDetail)});
$('itemForm').onsubmit=e=>{e.preventDefault();const id=$('itemId').value,old=itemById(id);const data={id:id||uid('item'),projectId:state.current,name:$('itemName').value.trim(),category:$('itemCategory').value.trim(),qty:Number($('itemQty').value)||0,unit:$('itemUnit').value,method:$('itemMethod').value,materialsContractorId:$('itemMaterialsContractor').value,laborContractorId:$('itemLaborContractor').value,status:$('itemStatus').value,materialsAmount:Number($('itemMaterials').value)||0,supplier:$('itemSupplier').value.trim(),laborAmount:Number($('itemLabor').value)||0,notes:$('itemNotes').value.trim()};if(old)Object.assign(old,data);else state.items.push(data);$('itemEditor').classList.add('hidden');save()};
$('contractorForm').onsubmit=e=>{e.preventDefault();state.contractors.push({id:uid('con'),projectId:state.current,name:$('contractorName').value.trim(),phone:$('contractorPhone').value.trim(),trade:$('contractorTrade').value.trim(),notes:$('contractorNotes').value.trim()});$('contractorEditor').classList.add('hidden');e.target.reset();save()};
$('collectionDate').value=today();$('expenseDate').value=today();
$('collectionForm').onsubmit=e=>{e.preventDefault();const amount=Number($('collectionAmount').value),rate=Number(project().rate);state.collections.push({id:uid('col'),project:state.current,amount,rate,reserved:amount*rate/100,date:$('collectionDate').value,note:$('collectionNote').value});e.target.reset();$('collectionDate').value=today();save()};
$('expenseForm').onsubmit=e=>{e.preventDefault();state.expenses.push({id:uid('ex'),projectId:state.current,itemId:$('expenseItem').value,item:itemById($('expenseItem').value)?.name||'',type:$('expenseType').value,amount:Number($('expenseAmount').value),payee:$('expensePayee').value,date:$('expenseDate').value,note:$('expenseNote').value,kind:'direct'});e.target.reset();$('expenseDate').value=today();save()};
$('settingsForm').onsubmit=e=>{e.preventDefault();project().name=$('projectName').value.trim();project().rate=Number($('profitRate').value);save();alert('تم حفظ إعدادات المشروع')};
$('exportData').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='execution-manager-backup-'+today()+'.json';a.click();URL.revokeObjectURL(url)};
$('importData').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const imported=JSON.parse(await file.text());if(!Array.isArray(imported.projects)||!Array.isArray(imported.collections))throw Error('invalid');if(!confirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. هل تريد المتابعة؟'))return;state=imported;localStorage.setItem(KEY,JSON.stringify(state));render();alert('تم استيراد النسخة الاحتياطية')}catch{alert('ملف النسخة الاحتياطية غير صالح')}e.target.value=''};
render();
