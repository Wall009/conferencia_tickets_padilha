var S={U:'Utilizado',D:'Disponível',C:'Cancelado'};
var rows=[],sel=null,openOrd={},ordFilter={},stFilter=null,sortKey='ped',sortDir=1;
var hours={},days={},resf={},plate=null,tab='cli',dFrom='',dTo='',tFrom='',tTo='',pedf={};
var RES=[];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmt(n){return n.toLocaleString('pt-BR')}
function fdt(s){if(!s)return '';var a=s.split(' ');var d=a[0].split('-');return d[2]+'/'+d[1]+'/'+d[0]+' '+a[1]}
function cnt(rs){var o={t:0,U:0,D:0,C:0};rs.forEach(function(r){o.t++;o[r[5]]++});return o}
function pct(a,b){return b?Math.round(a/b*100):0}
function nk(o){return Object.keys(o).length}
function hr(r){return +r[6].substr(11,2)}
function dy(r){return r[6].substr(0,10)}
function timeActive(){return nk(hours)>0||nk(days)>0||plate!==null||dFrom!==''||dTo!==''||tFrom!==''||tTo!==''}

// skip: 'h' ignora filtro de horas, 'd' ignora filtro de dias (para os gráficos mostrarem a distribuição completa)
function pass(r,skip){
  if(nk(pedf)&&!pedf[r[0]])return false;
  if(nk(resf)&&!resf[r[3]])return false;
  if(conf==='ok'&&!confOk(r))return false;
  if(conf==='pend'&&!pend(r))return false;
  var h=nk(hours)&&skip!=='h', d=nk(days)&&skip!=='d', p=plate!==null, rg=dFrom!==''||dTo!==''||tFrom!==''||tTo!=='';
  if(h||d||p||rg){
    if(r[5]!=='U')return false;
    if(h&&!hours[hr(r)])return false;
    if(d&&!days[dy(r)])return false;
    if(p&&r[7]!==plate)return false;
    if(rg){
      var dd=dy(r),tt=r[6].substr(11,5);
      if(dFrom&&dd<dFrom)return false;
      if(dTo&&dd>dTo)return false;
      var ts=dd+' '+tt;
      if(ts<(dFrom||'0000-00-00')+' '+(tFrom||'00:00'))return false;
      if(ts>(dTo||'9999-99-99')+' '+(tTo||'23:59'))return false;
    }
  }
  return true;
}
function filtered(skip){return rows.filter(function(r){return pass(r,skip)})}
function group(rs,k){var m={};rs.forEach(function(r){(m[r[k]]=m[r[k]]||[]).push(r)});return m}


var conf=null,divs=[];
function lida(r){return !!r[9]}
function pend(r){return r[5]==='U'&&!lida(r)}
function confOk(r){return r[5]==='U'&&lida(r)}
function confTag(r){
  if(confOk(r))return '<span class="tag U">Conferido</span>';
  if(lida(r))return '<span class="tag X">Divergência</span>';
  return r[5]==='U'?'<span class="tag P">Pendente</span>':'';
}
function rangeSel(){
  var a=document.getElementById('h1').value,b=document.getElementById('h2').value;
  hours={};
  if(a!==''||b!==''){var x=a===''?+b:+a,y=b===''?+a:+b;if(x>y){var t=x;x=y;y=t}for(var i=x;i<=y;i++)hours[i]=1}
  renderAll();
}
document.querySelectorAll('[data-pre]').forEach(function(el){el.onclick=function(){
  var p=el.getAttribute('data-pre').split('-'),x=+p[0],y=+p[1],all=true;
  for(var i=x;i<=y;i++)if(!hours[i])all=false;
  hours={};if(!all)for(var i=x;i<=y;i++)hours[i]=1;
  renderAll();
}});
document.getElementById('clear').onclick=function(){pedf={};document.getElementById('ped').value='';hours={};days={};resf={};plate=null;stFilter=null;conf=null;dFrom=dTo=tFrom=tTo='';['d1','d2','t1','t2'].forEach(function(i){document.getElementById(i).value=''});renderAll()};

function renderAll(){renderFilters();renderKpis();renderCharts();renderList();renderDetail();renderOrders();}

function renderFilters(){
  // selects refletem faixa contínua
  var hs=Object.keys(hours).map(Number).sort(function(a,b){return a-b});
  var h1=document.getElementById('h1'),h2=document.getElementById('h2');
  var cont=hs.length&&hs[hs.length-1]-hs[0]+1===hs.length;
  h1.value=cont?hs[0]:'';h2.value=cont?hs[hs.length-1]:'';
  document.querySelectorAll('[data-pre]').forEach(function(el){
    var p=el.getAttribute('data-pre').split('-'),x=+p[0],y=+p[1],n=y-x+1;
    el.classList.toggle('on',hs.length===n&&hs[0]===x&&hs[hs.length-1]===y);
  });
  document.getElementById('resChips').innerHTML=RES.map(function(r){return '<button class="fb'+(resf[r]?' on':'')+'" data-r="'+esc(r)+'">'+esc(r)+'</button>'}).join(' ');
  document.querySelectorAll('[data-r]').forEach(function(el){el.onclick=function(){var r=el.getAttribute('data-r');if(resf[r])delete resf[r];else resf[r]=1;renderAll()}});
  var pt=document.getElementById('plateTag');
  pt.innerHTML=plate?'<button class="fb on" id="pclr">Placa '+esc(plate)+' ✕</button>':'';
  if(plate)document.getElementById('pclr').onclick=function(){plate=null;renderAll()};
  document.getElementById('confChips').innerHTML=[['ok','Conferidos'],['pend','Pendentes']].map(function(k){return '<button class="fb'+(conf===k[0]?' on':'')+'" data-cf="'+k[0]+'">'+k[1]+'</button>'}).join(' ');
  document.querySelectorAll('[data-cf]').forEach(function(el){el.onclick=function(){var k=el.getAttribute('data-cf');conf=conf===k?null:k;stFilter=null;renderAll()}});
  var any=conf||nk(pedf)||hs.length||nk(days)||nk(resf)||plate||stFilter||dFrom||dTo||tFrom||tTo;
  document.getElementById('clear').style.display=any?'':'none';
  var note=document.getElementById('note');
  if(timeActive()){
    var parts=[];
    if(nk(pedf))parts.push('PED '+Object.keys(pedf).join(', '));
    if(hs.length)parts.push('horários: '+hs.map(function(h){return ('0'+h).slice(-2)+'h'}).join(', '));
    if(nk(days))parts.push('dias: '+Object.keys(days).sort().map(function(d){return d.split('-').reverse().slice(0,2).join('/')}).join(', '));
    if(plate)parts.push('placa '+plate);
    var fd=function(s){return s.split('-').reverse().join('/')};
    if(dFrom||dTo||tFrom||tTo)parts.push('período: '+(dFrom?fd(dFrom):'início')+' '+(tFrom||'00:00')+' até '+(dTo?fd(dTo):'fim')+' '+(tTo||'23:59'));
    note.style.display='block';
    note.textContent='Filtro de data/horário/placa considera apenas tickets utilizados ('+parts.join(' · ')+').';
  }else note.style.display='none';
}

function renderKpis(){
  var f=filtered(),c=cnt(f),off=timeActive();
  var defs=[[null,'Total de tickets',c.t,''],['U','Utilizados',c.U,'u'],['D','Disponíveis',c.D,''],['C','Cancelados',c.C,'c']];
  var h=defs.map(function(k){
    var dis=off&&(k[0]==='D'||k[0]==='C');
    return '<div class="kpi '+k[3]+(stFilter===k[0]&&k[0]?' on':'')+(dis?' off':'')+'" data-k="'+(k[0]||'')+'"><b>'+(dis?'—':fmt(k[2]))+'</b><span>'+k[1]+'</span></div>';
  }).join('');
  h+='<div class="kpi"><b>'+(off?'—':pct(c.U,c.t-c.C)+'%')+'</b><span>Taxa de utilização</span></div>';
  h+='<div class="kpi u'+(conf==='ok'?' on':'')+'" data-c="ok"><b>'+fmt(f.filter(confOk).length)+'</b><span>Conferidos</span></div>';
  h+='<div class="kpi pe'+(conf==='pend'?' on':'')+'" data-c="pend"><b>'+fmt(f.filter(pend).length)+'</b><span>Pendentes de retorno</span></div>';
  h+='<div class="kpi c" data-c="div"><b>'+fmt(divs.length)+'</b><span>Divergências (todas)</span></div>';
  document.getElementById('kpis').innerHTML=h;
  document.querySelectorAll('.kpi[data-c]').forEach(function(el){el.onclick=function(){var k=el.getAttribute('data-c');if(k==='div')return setTab('div');conf=conf===k?null:k;stFilter=null;renderAll()}});
  document.querySelectorAll('.kpi[data-k]').forEach(function(el){el.onclick=function(){
    if(el.classList.contains('off'))return;conf=null;
    var k=el.getAttribute('data-k')||null;stFilter=(stFilter===k)?null:k;renderAll();
  }});
  document.getElementById('sub').textContent=fmt(c.U)+' utilizados · '+fmt(c.t)+' tickets'+(sel?' · '+sel:'');
}
function qty(c){return stFilter?c[stFilter]:c.U}
function qlabel(){return stFilter?S[stFilter].toLowerCase()+'s':'utilizados'}

function drawCols(boxId,lblId,items,selMap,onclick){
  var mx=Math.max.apply(null,items.map(function(i){return i.n}).concat([1])),anySel=nk(selMap)>0;
  document.getElementById(boxId).innerHTML=items.map(function(i){
    var on=selMap[i.k];
    return '<div class="col'+(on?' on':(anySel?' dim':''))+'" data-k="'+esc(i.k)+'" title="'+esc(i.tip)+': '+i.n+' utilizados"><em>'+(i.n||'')+'</em><i style="height:'+Math.max(i.n/mx*88,i.n?2:0)+'px"></i></div>';
  }).join('');
  document.getElementById(lblId).innerHTML=items.map(function(i){return '<span>'+esc(i.lbl)+'</span>'}).join('');
  document.querySelectorAll('#'+boxId+' .col').forEach(function(el){el.onclick=function(){onclick(el.getAttribute('data-k'))}});
}
function renderCharts(){
  var scope=sel?' — '+sel:' — todos os clientes';
  document.getElementById('hTitle').textContent='Utilizações por hora do dia'+scope;
  document.getElementById('dTitle').textContent='Utilizações por dia';
  var base=function(skip){return filtered(skip).filter(function(r){return r[5]==='U'&&(!sel||r[2]===sel)})};
  var hc={};base('h').forEach(function(r){hc[hr(r)]=(hc[hr(r)]||0)+1});
  var hi=[];for(var i=0;i<24;i++)hi.push({k:i,n:hc[i]||0,lbl:i%3===0?('0'+i).slice(-2):'',tip:('0'+i).slice(-2)+'h'});
  drawCols('hCols','hLbls',hi,hours,function(k){k=+k;if(hours[k])delete hours[k];else hours[k]=1;renderAll()});
  var dc={};base('d').forEach(function(r){dc[dy(r)]=(dc[dy(r)]||0)+1});
  var dk=Object.keys(dc).sort();
  var di=dk.map(function(d){var p=d.split('-');return {k:d,n:dc[d],lbl:p[2]+'/'+p[1],tip:p[2]+'/'+p[1]+'/'+p[0]}});
  drawCols('dCols','dLbls',di,days,function(k){if(days[k])delete days[k];else days[k]=1;renderAll()});
}

function aggClients(){
  var m=group(filtered(),2);
  return Object.keys(m).map(function(n){return {name:n,rows:m[n],c:cnt(m[n])}});
}
function renderList(){
  var q=document.getElementById('q').value.toLowerCase();
  var l=aggClients().filter(function(c){return c.name.toLowerCase().indexOf(q)>-1});
  l.sort(function(a,b){return qty(b.c)-qty(a.c)||a.name.localeCompare(b.name)});
  var mx=Math.max.apply(null,l.map(function(c){return c.c.t}).concat([1]));
  document.getElementById('clist').innerHTML=l.map(function(c){
    return '<div class="cli'+(sel===c.name?' on':'')+'" data-n="'+esc(c.name)+'"><div class="n"><span>'+esc(c.name)+'</span><em>'+fmt(qty(c.c))+' '+qlabel()+'</em></div>'+
    '<div class="m">'+fmt(c.c.t)+' tickets · '+pct(c.c.U,c.c.t-c.c.C)+'% usados · '+c.rows.filter(confOk).length+' conferidos · '+c.rows.filter(pend).length+' pendentes</div>'+
    '<div class="bar" style="width:'+(c.c.t/mx*100)+'%"><i class="u" style="width:'+pct(c.c.U,c.c.t)+'%"></i><i class="c" style="width:'+pct(c.c.C,c.c.t)+'%"></i></div></div>';
  }).join('')||'<div class="empty">Nenhum cliente com esses filtros.</div>';
  document.querySelectorAll('.cli').forEach(function(el){el.onclick=function(){var n=el.getAttribute('data-n');sel=(sel===n)?null:n;openOrd={};renderAll()}});
}

function renderDetail(){
  var box=document.getElementById('detail');
  if(!sel){box.innerHTML='<div class="empty">Clique em um cliente à esquerda para ver os tickets por pedido.<br>Use os filtros e gráficos acima para recortar por horário, dia, resíduo ou placa.</div>';return}
  var c=filtered().filter(function(r){return r[2]===sel}),t=cnt(c);
  if(!c.length){box.innerHTML='<h2>'+esc(sel)+'</h2><div class="empty">Sem tickets com os filtros atuais.</div>';return}
  var pm=group(c.filter(function(r){return r[7]}),7);
  var pk=Object.keys(pm).sort(function(a,b){return pm[b].length-pm[a].length});
  var om=group(c,0);
  var os=Object.keys(om).map(function(p){var rs=om[p],res={};rs.forEach(function(r){res[r[3]]=1});return {ped:+p,res:Object.keys(res).join(' / '),rows:rs,c:cnt(rs)}}).sort(function(a,b){return a.ped-b.ped});
  var h='<h2>'+esc(sel)+'</h2><div class="sub2">'+os.length+' pedido(s)</div>'+
  '<div class="chips"><div class="chip">Total<b>'+fmt(t.t)+'</b></div><div class="chip u">Utilizados<b>'+fmt(t.U)+'</b></div>'+(timeActive()?'':'<div class="chip">Disponíveis<b>'+fmt(t.D)+'</b></div>'+(t.C?'<div class="chip c">Cancelados<b>'+t.C+'</b></div>':''))+'</div>';
  if(pk.length)h+='<div class="plates"><div class="t">Placas (clique para filtrar):</div>'+pk.map(function(p){return '<button class="fb'+(plate===p?' on':'')+'" data-pl="'+esc(p)+'">'+esc(p)+' · '+pm[p].length+'</button>'}).join(' ')+'</div>';
  os.forEach(function(o){
    var open=openOrd[o.ped];
    h+='<div class="ped'+(open?' open':'')+'" data-p="'+o.ped+'"><div class="pedh"><span class="arrow">▶</span><div><div class="nm">Pedido '+o.ped+' <button class="fb pf'+(pedf[o.ped]&&nk(pedf)===1?' on':'')+'" data-pf="'+o.ped+'" title="Filtrar só este pedido">'+(pedf[o.ped]&&nk(pedf)===1?'✕ filtrado':'filtrar PED')+'</button></div><div class="res">'+esc(o.res)+' · '+fmt(o.c.t)+' tickets'+(timeActive()?'':' · '+o.c.D+' disponíveis'+(o.c.C?' · '+o.c.C+' cancelados':''))+'</div>'+
    '<div class="bar"><i class="u" style="width:'+pct(o.c.U,o.c.t)+'%"></i><i class="c" style="width:'+pct(o.c.C,o.c.t)+'%"></i></div></div>'+
    '<div class="q"><b>'+fmt(o.c.U)+'</b><span> / '+fmt(o.c.t)+' utilizados</span><div class="res">'+o.rows.filter(confOk).length+' conferidos · '+o.rows.filter(pend).length+' pendentes</div></div></div>';
    if(open)h+='<div class="pbody">'+ticketTable(o)+'</div>';
    h+='</div>';
  });
  box.innerHTML=h;
  box.querySelectorAll('.pedh').forEach(function(el){el.onclick=function(){var p=el.parentNode.getAttribute('data-p');openOrd[p]=!openOrd[p];renderDetail()}});
  box.querySelectorAll('.filt .fb').forEach(function(el){el.onclick=function(e){e.stopPropagation();ordFilter[el.getAttribute('data-p')]=el.getAttribute('data-s')||null;renderDetail()}});
  box.querySelectorAll('.pf').forEach(function(el){el.onclick=function(e){e.stopPropagation();var p=+el.getAttribute('data-pf');var on=pedf[p]&&nk(pedf)===1;pedf={};if(!on)pedf[p]=1;document.getElementById('ped').value=on?'':String(p);renderAll()}});
  box.querySelectorAll('[data-pl]').forEach(function(el){el.onclick=function(){var p=el.getAttribute('data-pl');plate=(plate===p)?null:p;renderAll()}});
  box.querySelectorAll('.plk').forEach(function(el){el.onclick=function(){plate=el.getAttribute('data-pl');renderAll()}});
}

function ticketTable(o){
  var f=ordFilter[o.ped]!==undefined?ordFilter[o.ped]:(stFilter||(conf?null:'U'));
  var rs=o.rows.filter(function(r){return !f||r[5]===f}).sort(function(a,b){return (a[6]<b[6]?-1:a[6]>b[6]?1:0)||a[1]-b[1]});
  var h='<div class="filt">';
  [[null,'Todos ('+o.c.t+')'],['U','Utilizados ('+o.c.U+')'],['D','Disponíveis ('+o.c.D+')'],['C','Cancelados ('+o.c.C+')']].forEach(function(k){
    if((k[0]==='C'&&!o.c.C)||(k[0]==='D'&&!o.c.D))return;
    h+='<button class="fb'+((f||null)===k[0]?' on':'')+'" data-p="'+o.ped+'" data-s="'+(k[0]||'')+'">'+k[1]+'</button>';
  });
  h+='</div>';
  if(!rs.length)return h+'<div class="empty">Nenhum ticket nesta situação.</div>';
  var lim=500;
  h+='<table><thead><tr><th>Viagem</th><th>Resíduo</th><th>Situação</th><th>Utilizado em</th><th>Placa</th><th>Código</th><th>Conferência</th></tr></thead><tbody>';
  rs.slice(0,lim).forEach(function(r){
    h+='<tr><td>'+r[1]+'</td><td>'+esc(r[3])+'</td><td><span class="tag '+r[5]+'">'+S[r[5]]+'</span></td><td>'+esc(fdt(r[6]))+'</td><td>'+(r[7]?'<span class="plk" data-pl="'+esc(r[7])+'" title="Filtrar por esta placa">'+esc(r[7])+'</span>':'')+'</td><td>'+esc(r[4])+'</td><td>'+confTag(r)+'</td></tr>'+
      (r[8]?'<tr><td></td><td class="w" colspan="6" style="color:var(--mut)">'+esc(r[8])+'</td></tr>':'');
  });
  h+='</tbody></table>';
  if(rs.length>lim)h+='<div class="more">Mostrando os primeiros '+lim+' de '+rs.length+'.</div>';
  return h;
}

function renderOrders(){
  var q=document.getElementById('q2').value.toLowerCase();
  var om=group(filtered(),0);
  var l=Object.keys(om).map(function(p){var rs=om[p],res={};rs.forEach(function(r){res[r[3]]=1});return {ped:+p,ok:rs.filter(confOk).length,pe:rs.filter(pend).length,client:rs[0][2],res:Object.keys(res).join(' / '),c:cnt(rs)}})
   .filter(function(o){return String(o.ped).indexOf(q)>-1||o.client.toLowerCase().indexOf(q)>-1});
  l.sort(function(a,b){
    var x,y;
    if(sortKey==='ped'){x=a.ped;y=b.ped}else if(sortKey==='client'){x=a.client;y=b.client}
    else if(sortKey==='t'){x=a.c.t;y=b.c.t}else if(sortKey==='U'){x=a.c.U;y=b.c.U}else if(sortKey==='D'){x=a.c.D;y=b.c.D}else{x=pct(a.c.U,a.c.t);y=pct(b.c.U,b.c.t)}
    return (x>y?1:x<y?-1:0)*sortDir;
  });
  var th=function(k,t){return '<th class="s" data-s="'+k+'">'+t+(sortKey===k?(sortDir>0?' ▲':' ▼'):'')+'</th>'};
  var h='<table><thead><tr>'+th('ped','Pedido')+th('client','Cliente')+'<th>Resíduo</th>'+th('t','Total')+th('U','Utilizados')+th('D','Disponíveis')+'<th>Canc.</th>'+th('p','% uso')+'<th>Conferidos</th><th>Pendentes</th></tr></thead><tbody>';
  l.forEach(function(o){
    h+='<tr class="cl" data-c="'+esc(o.client)+'" data-p="'+o.ped+'"><td><b>'+o.ped+'</b></td><td class="w">'+esc(o.client)+'</td><td>'+esc(o.res)+'</td><td>'+fmt(o.c.t)+'</td><td style="color:var(--use);font-weight:700">'+fmt(o.c.U)+'</td><td>'+fmt(o.c.D)+'</td><td>'+(o.c.C||'')+'</td><td style="min-width:110px"><div class="bar" style="margin:0"><i class="u" style="width:'+pct(o.c.U,o.c.t)+'%"></i></div>'+pct(o.c.U,o.c.t)+'%</td><td>'+o.ok+'</td><td>'+o.pe+'</td></tr>';
  });
  h+='</tbody></table>';
  if(!l.length)h='<div class="empty">Nenhum pedido com esses filtros.</div>';
  document.getElementById('ptable').innerHTML=h;
  document.querySelectorAll('#ptable th.s').forEach(function(el){el.onclick=function(){var k=el.getAttribute('data-s');if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=(k==='ped'||k==='client')?1:-1}renderOrders()}});
  document.querySelectorAll('#ptable tr.cl').forEach(function(el){el.onclick=function(){
    sel=el.getAttribute('data-c');openOrd={};openOrd[el.getAttribute('data-p')]=true;setTab('cli');renderAll();
    document.getElementById('detail').scrollIntoView({behavior:'smooth',block:'start'});
  }});
}

function setTab(t){
  tab=t;
  document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-t')===t)});
  document.getElementById('v-cli').style.display=t==='cli'?'':'none';
  document.getElementById('v-ped').style.display=t==='ped'?'':'none';
  document.getElementById('v-div').style.display=t==='div'?'':'none';
}
document.querySelectorAll('.tab').forEach(function(b){b.onclick=function(){setTab(b.getAttribute('data-t'))}});
document.getElementById('q').oninput=renderList;
document.getElementById('q2').oninput=renderOrders;

var ROT={OK:'OK, conferido',DISPONIVEL:'DIVERGÊNCIA: consta Disponível',CANCELADO:'DIVERGÊNCIA: ticket cancelado',NAO_ENCONTRADO:'DIVERGÊNCIA: não está na planilha',SITUACAO_DESCONHECIDA:'DIVERGÊNCIA: situação desconhecida'};
function renderDivs(){
  document.getElementById('tabDiv').textContent='Divergências ('+divs.length+')';
  document.getElementById('dtable').innerHTML=divs.length?'<table><thead><tr><th>Motivo</th><th>Cliente</th><th>Pedido</th><th>Viagem</th><th>Código</th><th>Lido em</th></tr></thead><tbody>'+divs.map(function(d){
    var r=d.r;return '<tr><td class="w"><span class="tag X">'+esc(ROT[d.res]||d.res)+'</span></td><td class="w">'+esc(r?r[2]:'—')+'</td><td>'+(r?r[0]:'—')+'</td><td>'+(r?r[1]:'—')+'</td><td>'+esc(d.codigo)+'</td><td>'+esc(new Date(d.lido_em).toLocaleString('pt-BR'))+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">Nenhuma divergência.</div>';
}

function iniciarFiltros(){
  var a=document.getElementById('h1'),b=document.getElementById('h2'),o='<option value="">—</option>';
  for(var i=0;i<24;i++)o+='<option value="'+i+'">'+('0'+i).slice(-2)+'h</option>';
  a.innerHTML=o;b.innerHTML=o;a.onchange=b.onchange=rangeSel;
  document.getElementById('ped').oninput=function(){pedf={};(this.value.match(/\d+/g)||[]).forEach(function(n){pedf[+n]=1});renderAll()};
  [['d1','dFrom'],['d2','dTo'],['t1','tFrom'],['t2','tTo']].forEach(function(p){document.getElementById(p[0]).onchange=function(){
    var v=this.value||'';if(p[1]==='dFrom')dFrom=v;else if(p[1]==='dTo')dTo=v;else if(p[1]==='tFrom')tFrom=v;else tTo=v;renderAll();}});
}
iniciarFiltros();

// recebe a base e as leituras do servidor e redesenha sem perder filtros nem a rolagem
function aplicarDados(base,leituras){
  var porId={};leituras.forEach(function(l){porId[l.id]=l});
  var achou={};
  base.forEach(function(v){var l=porId[v[9]];var r_=v.slice(0,9);r_[9]=l?l.lido_em:'';achou[v[9]]=r_});
  rows=base.map(function(v){return achou[v[9]]});
  RES=Object.keys(group(rows,3)).sort(function(x,y){return rows.filter(function(r){return r[3]===y}).length-rows.filter(function(r){return r[3]===x}).length});
  divs=leituras.filter(function(l){return l.resultado!=='OK'}).map(function(l){return {r:achou[l.id],res:l.resultado,codigo:l.codigo,lido_em:l.lido_em}});
  var pl={};rows.forEach(function(r){pl[r[0]]=r[2]});
  document.getElementById('pedlist').innerHTML=Object.keys(pl).map(Number).sort(function(x,y){return x-y}).map(function(p){return '<option value="'+p+'">'+p+' — '+esc(pl[p])+'</option>'}).join('');
  var lista=document.getElementById('clist'),y=lista.scrollTop;
  renderAll();renderDivs();lista.scrollTop=y;
}
