const KEY='execution-manager-v01';
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{projects:[{id:'p1',name:'المشروع الأول',rate:10}],current:'p1',collections:[],expenses:[]};
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(n)+' ج.م';
const project=()=>state.projects.find(p=>p.id===state.current);
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function dateNow(){return new Date().toISOString().slice(0,10)}
function render(){
 $('projectSelect').innerHTML=state.projects.map(p=>`<option value="${p.id}" ${p.id===state.current?'selected':''}>${esc(p.name)}</option>`).join('');
 $('projectName').value=project().name;$('profitRate').value=project().rate;
 const cs=state.collections.filter(x=>x.project===state.current), es=state.expenses.filter(x=>x.project===state.current);
 const collected=cs.reduce((s,x)=>s+x.amount,0), reserved=cs.reduce((s,x)=>s+x.reserved,0), expenses=es.reduce((s,x)=>s+x.amount,0);
 $('totalCollected').textContent=money(collected);$('reservedProfit').textContent=money(reserved);$('totalExpenses').textContent=money(expenses);$('available').textContent=money(collected-reserved-expenses);
 $('summary').textContent=`عدد التحصيلات: ${cs.length} — عدد المصروفات: ${es.length} — نسبة الربح الحالية: ${project().rate}%`;
 $('collectionList').innerHTML=cs.slice().reverse().map(x=>entry(x.date,x.note||'تحصيل عميل',x.amount,`ربح محجوز: ${money(x.reserved)} (${x.rate}%)`)).join('');
 $('expenseList').innerHTML=es.slice().reverse().map(x=>entry(x.date,`${x.item} — ${x.type}${x.payee?' — '+x.payee:''}`,x.amount,x.note||'')).join('');
}
function entry(date,title,amount,sub){return `<div class="entry"><div><strong>${esc(title)}</strong><small>${esc(date)} ${sub?'· '+esc(sub):''}</small></div><b>${money(amount)}</b></div>`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(b.dataset.page).classList.remove('hidden')});
$('projectSelect').onchange=e=>{state.current=e.target.value;save()};
$('addProject').onclick=()=>{const name=prompt('اسم المشروع الجديد؟');if(!name?.trim())return;const p={id:'p'+Date.now(),name:name.trim(),rate:10};state.projects.push(p);state.current=p.id;save()};
$('collectionDate').value=dateNow();$('expenseDate').value=dateNow();
$('collectionForm').onsubmit=e=>{e.preventDefault();const amount=Number($('collectionAmount').value),rate=Number(project().rate);state.collections.push({project:state.current,amount,rate,reserved:amount*rate/100,date:$('collectionDate').value,note:$('collectionNote').value});e.target.reset();$('collectionDate').value=dateNow();save()};
$('expenseForm').onsubmit=e=>{e.preventDefault();state.expenses.push({project:state.current,item:$('expenseItem').value,type:$('expenseType').value,amount:Number($('expenseAmount').value),payee:$('expensePayee').value,date:$('expenseDate').value,note:$('expenseNote').value});e.target.reset();$('expenseDate').value=dateNow();save()};
$('settingsForm').onsubmit=e=>{e.preventDefault();project().name=$('projectName').value.trim();project().rate=Number($('profitRate').value);save();alert('تم حفظ الإعدادات')};
render();