/* SureTask: connects the website to the server
   (accounts, bank details, task submissions, withdrawals, wallet). */
(function(){
var $=function(i){return document.getElementById(i)};
var DASH=/^#\/(dashboard|submissions|wallet|profile|redeem)/;
var STATE=['stJobs','stRetry','stOK','stDone','stTaskState','stCur','stRsv','stRsvTask','stSubs','stAppr1','stAppr2','stT3form','stRes','stRes3','stT1'];

function api(path,opt){
  opt=opt||{};opt.credentials='same-origin';
  return fetch(path,opt).then(function(r){
    return r.json().catch(function(){return {};}).then(function(d){d.__s=r.status;return d;});
  },function(){return {ok:false,error:'No internet connection. Please try again.',__s:0};});
}
function post(p,b){
  if(p==='/api/register'&&b&&!b.bank){window.stReg=b;ss('stRegHold',b);return Promise.resolve({ok:true,__s:200,deferred:true,user:{id:'pending',created_at:new Date().toISOString()}});}
  return api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
}
function ss(k,v){try{if(v==null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));}catch(e){}}
function gs(k){try{return JSON.parse(sessionStorage.getItem(k));}catch(e){return null;}}
function wipe(){STATE.forEach(function(k){ss(k,null);});}
function fe(input,msg){var e=input.parentNode.querySelector('.err');if(e)e.textContent=msg||'';input.setAttribute('aria-invalid',msg?'true':'false');}
function flash(el,t){el.textContent=t;el.hidden=false;clearTimeout(el._t);el._t=setTimeout(function(){el.hidden=true;},4000);}
function money(n){return '\u20A6'+Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});}
function when(t){return new Date(t).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});}
function profileFor(u){return {id:'ST-'+String(u.id).slice(0,6).toUpperCase(),since:Date.parse(u.created_at)||Date.now()};}

['lgEmail','email','lgPass','password','confirm'].forEach(function(i){var e=$(i);if(e){e.setAttribute('autocapitalize','none');e.setAttribute('autocorrect','off');e.setAttribute('spellcheck','false');}});

/* ---------- Register (runs after the page's own checks pass) ---------- */
var rf=$('regForm');
rf.addEventListener('submit',function(){
  if(rf.querySelector('[aria-invalid="true"]'))return;           /* the page's own checks failed */
  var f=rf.elements;
  window.stCred={email:f.email.value.trim(),password:f.password.value};
  window.stRegP=post('/api/register',{name:f.name.value.trim(),email:f.email.value.trim(),phone:'',password:f.password.value,username:(f.username?f.username.value.trim().toLowerCase():'')});
  window.stRegP.then(function(d){
    if(d.ok){wipe();ss('stProfile',profileFor(d.user));ss('stT1',String(Date.parse(d.user.created_at)||Date.now()));return;}
    location.hash='#/register';
    fe(f.email,d.error||'Could not create your account.');
  });
});

/* ---------- Bank details ---------- */
var pf=$('payForm');
pf.addEventListener('submit',function(){
  if(!pf.elements.bank.disabled)return;           /* not valid */
  var b=pf.elements.bank;
  var pb={bank:b.options[b.selectedIndex].text,account:pf.elements.account.value,acname:pf.elements.acname.value.trim()};
  Promise.resolve(window.stRegP).catch(function(){}).then(function(){return post('/api/payout',pb);}).then(function(d){
    if(d.__s===401&&window.stCred){return post('/api/login',window.stCred).then(function(l){return l.ok?post('/api/payout',pb):d;});}
    return d;
  }).then(function(d){
    if(!d.ok)alert(d.error||'Could not save your bank details. Please add them again from your profile.');
  });
});

/* ---------- Screenshot the person chose or pasted ---------- */
var shot=null,pass=false;
$('rFile').addEventListener('change',function(){shot=this.files[0]||null;});
document.addEventListener('paste',function(e){
  if($('viewRedeem').hidden||!e.clipboardData)return;
  var it=[].slice.call(e.clipboardData.items||[]).filter(function(x){return x.type.indexOf('image/')===0;})[0];
  if(it)shot=it.getAsFile();
},true);
function compress(file){
  return new Promise(function(res){
    var img=new Image(),u=URL.createObjectURL(file);
    img.onload=function(){
      var s=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');
      c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      c.toBlob(function(b){URL.revokeObjectURL(u);res(b||file);},'image/jpeg',0.82);
    };
    img.onerror=function(){URL.revokeObjectURL(u);res(file);};
    img.src=u;
  });
}

/* ---------- All form submits we take over (capture phase) ---------- */
document.addEventListener('submit',function(e){
  var f=e.target,id=f.id;

  if(id==='loginForm'){
    e.preventDefault();e.stopImmediatePropagation();
    var em=f.elements.email,pw=f.elements.password;
    fe(em,/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())?'':'Enter a valid email address.');
    fe(pw,pw.value?'':'Enter your password.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())||!pw.value)return;
    post('/api/login',{email:em.value.trim(),password:pw.value}).then(function(d){
      if(!d.ok){fe(pw,d.error||'Could not log in.');return;}
      var u=d.user;
      wipe();
      ss('stUser',{name:u.name,email:u.email,bank:u.bank,account:u.account,acname:u.acname});ss('stT1',String(Date.parse(u.created_at)||Date.now()));
      ss('stProfile',profileFor(u));
      f.reset();
      location.hash='#/dashboard';
      location.replace('/dashboard#/dashboard');
    });
    return;
  }

  if(id==='rForm'){
    if(pass)return;                                /* second pass after the server accepted it */
    var tid=$('rId').value.trim();
    if(!tid||!shot||!$('rAgree').checked)return;   /* the page shows its own errors */
    e.preventDefault();e.stopImmediatePropagation();
    var btn=$('rBtn');btn.disabled=true;btn.textContent='Submitting...';
    var no=gs('stCur')||1;
    compress(shot).then(function(blob){
      var fd=new FormData();
      fd.append('taskId',tid);fd.append('taskNo',String(no));fd.append('screenshot',blob,'proof.jpg');
      if(no===3){var x=gs('stT3form');if(x)fd.append('extra',JSON.stringify({name:x.name,phone:x.phone}));}
      return api('/api/submit',{method:'POST',body:fd});
    }).then(function(d){
      if(d.ok){pass=true;try{f.requestSubmit();}finally{pass=false;}shot=null;refresh();return;}
      btn.disabled=false;btn.textContent='Redeem Reward';
      if(d.__s===401){location.hash='#/login';return;}
      $('rIdErr').textContent=d.error||'Could not submit. Please try again.';
    });
    return;
  }

  if(id==='wForm'){
    e.preventDefault();e.stopImmediatePropagation();
    var a=$('wAmt'),er=$('wErr'),v=parseInt(a.value,10);
    er.style.color='';
    if(isNaN(v)||v<5000){er.textContent='The minimum withdrawal is \u20A65,000.';return;}
    if(!$('wAcct').value){er.textContent='Add your payout account first.';return;}
    if(window.stWBusy)return;window.stWBusy=true;
    var ov=document.getElementById('delayOv');if(ov)ov.hidden=false;
    new Promise(function(r){setTimeout(r,10000);}).then(function(){return post('/api/withdraw',{amount:v});}).finally(function(){if(ov)ov.hidden=true;window.stWBusy=false;}).then(function(d){
      if(!d.ok){er.textContent=d.error||'Could not send your request.';return;}
      a.value='';er.style.color='#15803d';er.textContent='Withdrawal request sent. You will be paid to your bank account.';
      refresh();
    });
    return;
  }

  if(id==='pwForm'){
    e.preventDefault();e.stopImmediatePropagation();
    var c=f.elements.cur,n=f.elements.nw,cf=f.elements.cf;
    fe(c,c.value?'':'Enter your current password.');
    fe(n,n.value.length>=8?'':'Use at least 8 characters.');
    fe(cf,cf.value===n.value?'':'Passwords do not match.');
    if(!c.value||n.value.length<8||cf.value!==n.value)return;
    post('/api/password',{current:c.value,next:n.value}).then(function(d){
      if(!d.ok){fe(c,d.error||'Could not update password.');return;}
      f.reset();flash($('pwMsg'),'Password updated.');
    });
  }
},true);

/* ---------- Profile name / email (after the page's own checks) ---------- */
$('profForm').addEventListener('submit',function(){
  var n=$('pname'),m=$('pemail');
  if(n.getAttribute('aria-invalid')==='true'||m.getAttribute('aria-invalid')==='true')return;
  post('/api/profile',{name:n.value.trim(),email:m.value.trim()}).then(function(d){if(!d.ok)fe(m,d.error||'Could not save changes.');});
});

/* ---------- PalmPay name and phone (task 3) ---------- */
var t3=$('t3Form');
if(t3)t3.addEventListener('submit',function(){
  var n=$('t3n').value.trim(),p=$('t3p').value.replace(/\s/g,'');
  if(!/^[A-Za-z][A-Za-z .'-]{2,}$/.test(n)||!/^(0|\+?234)[789][01]\d{8}$/.test(p))return;
  post('/api/palmpay',{name:n,phone:p});
});

/* ---------- Logout ---------- */
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('.slogout');if(!a)return;
  e.preventDefault();
  post('/api/logout',{}).then(function(){
    wipe();ss('stUser',null);ss('stProfile',null);
    location.replace('/');
  });
},true);

/* ---------- Keep the page in step with the server ---------- */
var pushed=false;
function paint(d){
  var b=money(d.user.balance),el,cr=0,db=0;
  if((el=document.querySelector('.balpill b')))el.textContent=b;
  if((el=document.querySelector('.wbox b')))el.textContent=b;
  d.transactions.forEach(function(t){if(t.amount>0)cr+=t.amount;else db-=t.amount;});
  var ws=document.querySelectorAll('#viewWallet .wst b');
  if(ws.length>2){ws[0].textContent=b;ws[1].textContent=money(cr);ws[2].textContent=money(db);}
  var cs=document.querySelectorAll('#viewWallet .wcard'),hc=cs[cs.length-1],p=hc&&hc.querySelector('p');
  if(p){
    p.style.whiteSpace='pre-line';
    p.textContent=d.transactions.length?d.transactions.map(function(t){return (t.amount>0?'+':'-')+money(Math.abs(t.amount))+'  \u00B7  '+(t.note||t.type)+'  \u00B7  '+when(t.created_at);}).join('\n'):'No wallet activity yet.';
  }
  var wp=document.querySelector('#viewWallet .whist p');
  if(wp){
    var L={pending:'Pending',paid:'Paid',rejected:'Rejected (refunded)'};
    wp.style.whiteSpace='pre-line';
    wp.textContent=d.withdrawals.length?d.withdrawals.map(function(w){return money(w.amount)+'  \u00B7  '+(L[w.status]||w.status)+'  \u00B7  '+when(w.created_at);}).join('\n'):'No withdrawal requests yet.';
  }
}
function notifyApproved(d){
  var seen=[];try{seen=JSON.parse(localStorage.getItem('stApprSeen'))||[];}catch(e){}
  var fresh=d.submissions.filter(function(s){return s.status==='approved'&&seen.indexOf(s.id)<0;});
  if(!fresh.length)return;
  var add=0;
  fresh.forEach(function(s){
    seen.push(s.id);
    if((Date.parse(s.reviewed_at)||0)>Date.now()-86400000)add+=Number(s.reward)||0;
  });
  try{localStorage.setItem('stApprSeen',JSON.stringify(seen));}catch(e){}
  if(!add)return;
  var can=Number(d.user.balance)>=5000;
  var old=document.getElementById('stPop');if(old)old.remove();
  var p=document.createElement('div');p.id='stPop';
  p.innerHTML='<b style="display:block;font-size:15px;margin-bottom:4px">\uD83C\uDF89 '+money(add)+' approved!</b>'+
    (can?'You can now withdraw your earnings. Tap here to withdraw.':'Added to your wallet. You can withdraw once your balance reaches \u20A65,000.');
  var card=document.querySelector('.balpill'),top=70,right=16;
  if(card&&card.offsetParent){var r=card.getBoundingClientRect();top=r.bottom+10;right=Math.max(12,window.innerWidth-r.right);}
  p.style.cssText='position:fixed;z-index:99999;top:'+top+'px;right:'+right+'px;max-width:280px;background:#15803d;color:#fff;padding:14px 16px;border-radius:14px;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer';
  p.onclick=function(){location.hash='#/wallet';p.remove();};
  document.body.appendChild(p);
  setTimeout(function(){if(p.parentNode)p.remove();},10000);
}
/* ---------- Notifications (bell) ---------- */
var NOTE_UID=null;
var TASKN={1:'Download Kuda App',2:'Create new email account',3:'Use PalmPay Reward'};
function noteKey(){return 'stNotes_'+NOTE_UID;}
function noteGet(){try{return JSON.parse(localStorage.getItem(noteKey()))||[];}catch(e){return [];}}
function notePut(a){try{localStorage.setItem(noteKey(),JSON.stringify(a.slice(0,40)));}catch(e){}}
function noteEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function noteBadge(){
  var b=document.getElementById('stBadge');if(!b)return;
  var n=noteGet().filter(function(x){return !x.r;}).length;
  b.textContent=n>9?'9+':n;b.style.display=n?'flex':'none';
}
function noteDraw2(){
  var p=document.getElementById('stNotes');if(!p)return;
  var a=noteGet();
  p.style.width='375px';
  var head='<div style="padding:16px;text-align:center;font-weight:700;font-size:16px;color:#111827;border-bottom:1px solid #e5e7eb">Latest changes</div>';
  var body=a.length?a.map(function(x){
    var pend=(x.y==='sub'||x.y==='wd');
    var t=String(x.t||'');if(!/[.!?]$/.test(t))t+='.';
    var m=String(x.m||'');if(m.length>600)m=m.slice(0,600).replace(/\s+\S*$/,'')+'...';
    return '<div style="padding:12px 14px;line-height:1.5;font-size:14px;color:#6b7280;'+(x.r?'':'background:#faf5ff;')+'"><span style="display:inline-block;padding:1px 10px;border-radius:99px;font-size:13px;color:#fff;background:'+(pend?'#d97706':'#a855f7')+'">'+(pend?'Pending':'Update')+'</span> <b style="color:#111827">'+noteEsc(t)+'</b> '+noteEsc(m)+'</div>';
  }).join(''):'<div style="padding:26px 16px;text-align:center;color:#6b7280;font-size:14px">No updates yet.</div>';
  p.innerHTML=head+'<div style="border-left:4px solid #5b0f4e">'+body+'</div>';
}
function noteDraw(){noteDraw2();}
function noteDraw_old(){
  var p=document.getElementById('stNotes');if(!p)return;
  var a=noteGet();
  p.innerHTML='<div style="padding:14px 16px;font-weight:800;border-bottom:1px solid #dde3f0">Notifications</div>'+
  (a.length?a.map(function(x){
    return '<div style="display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid #eef1f7;'+(x.r?'':'background:#eef4ff')+'"><span style="font-size:20px;line-height:1.2">'+x.i+'</span><div><b style="display:block;font-size:14px">'+noteEsc(x.t)+'</b><span style="display:block;font-size:13px;color:#55607a;line-height:1.4">'+noteEsc(x.m)+'</span><small style="color:#8a94ad;font-size:11.5px">'+when(x.a)+'</small></div></div>';
  }).join(''):'<div style="padding:26px 16px;text-align:center;color:#55607a;font-size:14px">No notifications yet.</div>');
}
function noteUI(){
  var bell=document.querySelector('.bell');if(!bell||document.getElementById('stBadge'))return;
  bell.style.position='relative';
  var badge=document.createElement('span');badge.id='stBadge';
  badge.style.cssText='position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center';
  bell.appendChild(badge);
  var panel=document.createElement('div');panel.id='stNotes';panel.hidden=true;
  panel.style.cssText='position:absolute;right:0;top:52px;width:330px;max-width:92vw;max-height:420px;overflow:auto;background:#fff;color:#101a33;border:1px solid #dde3f0;border-radius:14px;box-shadow:0 18px 40px -22px rgba(29,78,216,.45);z-index:50;text-align:left';
  bell.parentNode.appendChild(panel);
  bell.addEventListener('click',function(e){
    e.stopPropagation();panel.hidden=!panel.hidden;
    if(!panel.hidden){
      noteDraw();
      var a=noteGet();a.forEach(function(x){x.r=1;});notePut(a);noteBadge();
    }
  });
  document.addEventListener('click',function(e){if(!panel.hidden&&!panel.contains(e.target))panel.hidden=true;});
}
function noteToast(n){
  var old=document.getElementById('stToast');if(old)old.remove();
  var t=document.createElement('div');t.id='stToast';
  t.innerHTML='<b style="display:block;font-size:14px;margin-bottom:3px">'+n.i+' '+noteEsc(n.t)+'</b>'+noteEsc(n.m);
  t.style.cssText='position:fixed;z-index:99998;top:70px;right:16px;max-width:300px;background:#0a1224;color:#fff;padding:14px 16px;border-radius:14px;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer';
  t.onclick=function(){t.remove();};
  document.body.appendChild(t);
  setTimeout(function(){if(t.parentNode)t.remove();},8000);
}
function noteSync(d){
  NOTE_UID=d.user.id;noteUI();
  var a=noteGet(),have={},fresh=[],week=Date.now()-7*86400000;
  a.forEach(function(x){have[x.k]=1;});
  function add(k,ic,t,m,at,ty){
    at=at||Date.now();
    if(have[k]||at<week)return;
    have[k]=1;var n={k:k,i:ic,t:t,m:m,a:at,r:0,y:ty};a.push(n);fresh.push(n);
  }
  d.submissions.forEach(function(s){
    var nm=s.task_name;
    add('sub-'+s.id,'\u23F3','Reward pending','Your proof for "'+nm+'" was received. Your '+money(s.reward)+' reward is being verified and will land in your wallet once approved.',Date.parse(s.created_at),'sub');
    if(s.status==='approved')add('ok-'+s.id,'\uD83C\uDF89','Reward paid!','Great news! '+money(s.reward)+' for "'+nm+'" has been approved and paid to your wallet. You can withdraw it anytime.',Date.parse(s.reviewed_at),'ok');
    if(s.status==='rejected')add('rej-'+s.id,'\u274C','Submission rejected',(OPAYMSG[s.reject_reason]?OPAYMSG[s.reject_reason]:s.reject_reason==='Screenshot shows an old PalmPay account'?'This phone number is already registered on PalmPay, so your screenshot for "'+nm+'" shows an old account. Register a new PalmPay account using your name and a new phone number, then submit again. Note: submit your name and the new phone number and get your task id to track your task!!!':'Your proof for "'+nm+'" was not accepted: '+(s.reject_reason||'proof not accepted')+'. You can start the task again.'),Date.parse(s.reviewed_at),'rej');
  });
  d.withdrawals.forEach(function(w){
    add('wd-'+w.id,'\uD83D\uDCB8','Withdrawal placed','Your withdrawal of '+money(w.amount)+' has been received and is being processed. It will be sent to your bank account shortly.',Date.parse(w.created_at),'wd');
    if(w.status==='paid')add('wdp-'+w.id,'\u2705','Withdrawal paid','Done! '+money(w.amount)+' has been sent to your bank account. Check your bank app.',Date.now(),'wdp');
    if(w.status==='rejected')add('wdr-'+w.id,'\u21A9\uFE0F','Withdrawal refunded','Your withdrawal of '+money(w.amount)+' could not be processed. The money is back in your wallet.',Date.now(),'wdr');
  });
  var j=gs('stJobs')||{};
  Object.keys(j).forEach(function(n){
    if(j[n].fail&&!j[n].sub)add('fail-'+n+'-'+j[n].end,'\u26A0\uFE0F','Task not completed','Time ran out on "'+(TASKN[n]||'your task')+'" before you submitted proof. Tap the task to start it again.',j[n].end,'fail');
  });
  a.sort(function(x,y){return y.a-x.a;});
  notePut(a);noteBadge();
  var panel=document.getElementById('stNotes');if(panel&&!panel.hidden)noteDraw();
  var show=fresh.filter(function(n){return n.y!=='ok'&&n.a>Date.now()-120000;})[0];
  if(show)noteToast(show);
}
function apply(d){
  try{
  var su=d.user,scu=gs('stUser')||{},scp=gs('stProfile')||{},snp=profileFor(su);
  var localOnly=!su.account&&scu.account;
  if(!localOnly&&(scu.name!==su.name||scu.email!==su.email||scu.bank!==su.bank||scu.account!==su.account||scu.acname!==su.acname||scp.id!==snp.id)){
    ss('stUser',{name:su.name,email:su.email,bank:su.bank,account:su.account,acname:su.acname});
    ss('stProfile',snp);
    location.reload();return;
  }
}catch(e){}
try{noteSync(d);}catch(e){}
  try{window.stSrv=d.submissions;}catch(e){}
  try{notifyApproved(d);}catch(e){}
  var ok=gs('stOK')||[];
  d.submissions.forEach(function(s){
    if(s.status==='approved'&&ok.indexOf(s.task_no)<0&&window.stApproveTask){
      window.stApproveTask(s.task_no);
      if(s.task_no===1)ss('stAppr1',String(Date.parse(s.reviewed_at)||Date.now()));
      ok=gs('stOK')||[];
    }
  });
  ss('stT1',String(Date.parse(d.user.created_at)||Date.now()));var t2=d.submissions.filter(function(s){return s.task_no===2&&s.status==='approved';})[0];
ss('stAppr2',t2?String(Date.parse(t2.reviewed_at)||Date.now()):null);
  var seen=[];try{seen=JSON.parse(localStorage.getItem('stRejSeen'))||[];}catch(e){}
  var rej=d.submissions.filter(function(s){return s.status==='rejected'&&seen.indexOf(s.id)<0;});
  if(rej.length){
    var j=gs('stJobs')||{},o=gs('stTaskState')||{};
    rej.forEach(function(s){seen.push(s.id);delete j[s.task_no];delete o[s.task_no];});
    ss('stJobs',j);ss('stTaskState',o);ss('stRsv',null);ss('stRsvTask',null);
    try{localStorage.setItem('stRejSeen',JSON.stringify(seen));}catch(e){}
    alert(OPAYMSG[rej[0].reject_reason]?OPAYMSG[rej[0].reject_reason]:rej[0].reject_reason==='Screenshot shows an old PalmPay account'?'This phone number is already registered on PalmPay. Register a new PalmPay account using your name and a new phone number, then submit again. Note: submit your name and the new phone number and get your task id to track your task!!!':'Your submission "'+rej[0].task_name+'" was rejected: '+(rej[0].reject_reason||'proof not accepted')+'. You can start the task again.');
    location.reload();return;
  }
  var l=gs('stUser')||{};
  if(!pushed&&!d.user.account&&l.account&&l.bank&&l.acname){pushed=true;post('/api/payout',{bank:l.bank,account:l.account,acname:l.acname});}
}
function refresh(){
  if(!DASH.test(location.hash))return;
  api('/api/me').then(function(d){
    if(d.__s===403&&d.need==='payout'){ss('stNeedPayout','1');if(location.hash!=='#/payout')location.hash='#/payout';return;}
    if(d.__s===401){location.hash='#/login';return;}
    if(d.ok){paint(d);apply(d);}
  });
}
/* keep started/submitted tasks 2 and 3 showing "Reward pending" on Explore Jobs */
var CLK_SVG='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="19"/><path d="M24 13v11l7 4"/></svg>';
function keepPending(){
  var j=gs('stJobs')||{};
  [2,3].forEach(function(n){
    var job=j[n];if(!job||job.fail)return;
    var b=document.querySelector('#cards button[data-n="'+n+'"]');
    var a=b&&b.closest('article');if(!a)return;
    var chip=a.querySelector('.lockchip'),lb=a.querySelector('.lockbox');
    if(!chip||!lb)return;
    if(chip.classList.contains('tpend')&&lb.textContent.indexOf('Reward pending')>-1)return;
    chip.className='lockchip tpend';chip.textContent='OPEN';
    lb.className='lockbox lpend';lb.innerHTML=CLK_SVG+'<span>Reward pending</span>';
  });
}
/* tasks 2 and 3 behave like task 1: Reward pending, Start task goes back to the reservation page, locked after redeeming */
function keepTasks(){
  keepPending();
  var j=gs('stJobs')||{};
  [2,3].forEach(function(n){
    var job=j[n];if(!job||job.fail)return;
    var b=document.querySelector('#cards button[data-n="'+n+'"]');
    var a=b&&b.closest('article');if(!a)return;
    [].forEach.call(a.querySelectorAll('.tc-act button'),function(x){x.disabled=!!job.sub;});
  });
}
var cardsBox=$('cards');
if(cardsBox)new MutationObserver(keepTasks).observe(cardsBox,{childList:true});
setInterval(keepTasks,300);
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('#cards .tc-act button[data-n]');
  if(!b)return;
  var n=+b.getAttribute('data-n');
  if(n!==2&&n!==3)return;
  var job=(gs('stJobs')||{})[n];
  if(job&&job.fail)return;
  if(job&&job.sub){e.preventDefault();e.stopImmediatePropagation();return;}
  var r=gs('stRsv');
  if(r&&r.end>Date.now()){e.preventDefault();e.stopImmediatePropagation();if(window.stOpenTask)window.stOpenTask();}
},true);

/* My Submissions: show real approved / pending / rejected tasks from the server */
var subTab='a';
(function(){var st=document.createElement('style');st.textContent='#viewSubs .sempty{display:none!important}';document.head.appendChild(st);})();
function subEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function subsRender(){
  var v=document.getElementById('viewSubs');if(!v||v.hidden||!window.stSrv)return;
  var S=window.stSrv,A=S.filter(function(s){return s.status==='approved';}),
      P=S.filter(function(s){return s.status==='pending';}),
      R=S.filter(function(s){return s.status==='rejected';});
  var c;
  if((c=v.querySelector('.sst.ok b')))c.textContent=A.length;
  if((c=v.querySelector('.sst.pe b')))c.textContent=P.length;
  if((c=v.querySelector('.sst.di b')))c.textContent=R.length;
  var tabs=document.getElementById('stabs');
  [['a','Approved',A],['p','Pending',P],['d','Disputes',R]].forEach(function(t){
    var b=tabs.querySelector('[data-t="'+t[0]+'"]');
    if(b){b.textContent=t[1]+' ('+t[2].length+')';b.setAttribute('aria-selected',subTab===t[0]?'true':'false');}
  });
  var empty=v.querySelector('.sempty'),box=document.getElementById('stSrv');
  if(!box){box=document.createElement('div');box.id='stSrv';empty.parentNode.insertBefore(box,empty.nextSibling);}
  var sib=empty.nextElementSibling;
  while(sib){if(sib.id!=='stSrv')sib.style.setProperty('display','none','important');sib=sib.nextElementSibling;}
  var list=subTab==='a'?A:subTab==='p'?P:R;
  var chip={a:['PAID','#eafaf1','#16794a','#bfead2'],p:['PENDING REVIEW','#fff4d6','#a35f00','#f3dd9b'],d:['REJECTED','#fde8e8','#b4232f','#f5c2c7']}[subTab];
  var none={a:'No approved submissions yet',p:'No pending submissions',d:'No disputes'}[subTab];
  box.innerHTML=list.length?list.map(function(s){
    var when2=subTab==='p'?s.created_at:(s.reviewed_at||s.created_at);
    var extra=subTab==='a'?' \u00B7 '+money(s.reward)+' paid to wallet':subTab==='d'&&s.reject_reason?' \u00B7 '+subEsc(s.reject_reason):'';
    return '<div class="subrow"><div class="subtx"><b>'+subEsc(s.task_name)+'</b><span>Task ID: '+subEsc(s.task_code)+extra+'<br>'+when(when2)+'</span></div><span class="subst" style="background:'+chip[1]+';color:'+chip[2]+';border-color:'+chip[3]+'">'+chip[0]+'</span></div>';
  }).join(''):'<div style="text-align:center;padding:40px 16px;color:#55607a;font-weight:600">'+none+'</div>';
}
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('#stabs button[data-t]');
  if(b){subTab=b.getAttribute('data-t');setTimeout(subsRender,0);}
},true);
setInterval(subsRender,300);
/* TASK POSTER badge on unlocked cards 1 to 3 */
var POSTERS={1:'Toyosi Wills',2:'King\u2019s Digital',3:'Ediomo Empire'};
(function(){
  var st=document.createElement('style');
  st.textContent='.tposter{display:inline-flex;flex-direction:column;align-items:center;gap:3px;background:var(--cc,#16a34a);color:#fff;border-radius:12px;padding:7px 14px 8px;line-height:1.1;white-space:nowrap}.tposter i{font-style:normal;background:rgba(0,0,0,.62);color:#fff;font-size:9.5px;font-weight:700;letter-spacing:.08em;padding:2px 8px;border-radius:5px}.tposter b{display:block;font-family:var(--head);font-size:15px;font-weight:800;color:inherit;margin:0}.tc.c2 .tposter{color:#2a1d00}.tc.c2 .tposter i{background:rgba(42,29,0,.8);color:#fff}';
  document.head.appendChild(st);
})();
function posters(){
  [1,2,3].forEach(function(n){
    var b=document.querySelector('#cards button[data-n="'+n+'"]');
    var a=b&&b.closest('article');if(!a)return;
    var slot=a.querySelector('.tc-top > span:first-child');if(!slot)return;
    var unl=!!a.querySelector('h3'),has=!!slot.querySelector('.tposter');
    if(unl&&!has)slot.innerHTML='<span class="tposter"><i>TASK POSTER</i><b>'+POSTERS[n]+'</b></span>';
    else if(!unl&&has)slot.innerHTML='';
  });
}
var cardsEl=document.getElementById('cards');
if(cardsEl)new MutationObserver(posters).observe(cardsEl,{childList:true});
setInterval(posters,300);
window.addEventListener('hashchange',refresh);
/* Task 2 removed: keep its card hidden */
(function(){var st=document.createElement('style');st.textContent='.tc-gone{display:none!important}';document.head.appendChild(st);})();
function hideTask2(){
  var b=document.querySelector('#cards button[data-n="2"]');
  var a=b&&b.closest('article');
  if(a)a.classList.add('tc-gone');
}
var cardsBox2=document.getElementById('cards');
if(cardsBox2)new MutationObserver(hideTask2).observe(cardsBox2,{childList:true});
setInterval(hideTask2,200);
/* ---------- Task 4: Download Email App ---------- */
TASKN[4]='Register New OPay Account';
var OPAYMSG={'Registered without the referral code':'You did not use our referral code when you registered your OPay account, so your reward could not be approved. Register a new OPay account with a new phone number, and enter the referral code while you register.','Screenshot shows an old OPay account':'Your screenshot shows an OPay account that was already registered. Register a brand new OPay account with a new phone number, enter the referral code, then submit again.'};
POSTERS[4]='Timiyelin Santos';
var OPAY_CODE='9122645672';
function t4Open(){return !!OPAY_CODE&&(gs('stOK')||[]).indexOf(3)>-1;}
function skin4(){
  var b=document.querySelector('#cards button[data-n="4"]');
  var a=b&&b.closest('article');if(!a||a.getAttribute('data-st'))return;
  if(!t4Open())return;
  var chip=a.querySelector('.lockchip'),lb=a.querySelector('.lockbox'),h=a.querySelector('h3'),meta=a.querySelector('.tc-meta');
  if(!chip||!lb||!meta)return;
  if(!h){h=document.createElement('h3');meta.parentNode.insertBefore(h,meta);}
  if(h.textContent!=='Register New OPay Account')h.textContent='Register New OPay Account';
  if(chip.textContent!=='OPEN'){chip.className='lockchip open';chip.textContent='OPEN';}
  if(lb.textContent.indexOf('Task unlocked')<0){lb.className='lockbox';lb.innerHTML='<span>Task unlocked</span>';}
  [].forEach.call(a.querySelectorAll('.tc-act button'),function(x){x.disabled=false;});
}
function poster4(){
  var b=document.querySelector('#cards button[data-n="4"]');
  var a=b&&b.closest('article');if(!a)return;
  var slot=a.querySelector('.tc-top > span:first-child');if(!slot)return;
  var unl=!!a.querySelector('h3'),has=!!slot.querySelector('.tposter');
  if(unl&&!has)slot.innerHTML='<span class="tposter"><i>TASK POSTER</i><b>'+POSTERS[4]+'</b></span>';
  else if(!unl&&has)slot.innerHTML='';
}
function close4(){
  var v=document.getElementById('viewTask4');if(v)v.hidden=true;
  var x=document.getElementById('viewExplore');if(x)x.hidden=false;
  window.scrollTo(0,0);
}
function mkTask4(){
  var v=document.getElementById('viewTask4');if(v)return v;
  var v3=document.getElementById('viewTask3');if(!v3)return null;
  if(!document.getElementById('opStyle')){
    var sx=document.createElement('style');sx.id='opStyle';
    sx.textContent='.opref{margin:18px 0 0;background:#fff8e1;border:2px solid #f2b640;border-radius:16px;padding:18px 20px;color:#5b3a00}.opref h2{font-size:18px;font-weight:800;margin:0 0 6px;color:#7a4a00}.opref p{margin:0 0 12px;font-size:15px;line-height:1.5}.oprow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.oprow code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:clamp(20px,5vw,28px);font-weight:800;letter-spacing:.08em;background:#fff;border:1px solid #f2b640;border-radius:12px;padding:8px 16px;color:#1e2a8a;overflow-wrap:anywhere}.opref .opwarn{margin:14px 0 0;background:#fde8e8;border:1px solid #f5c2c7;border-radius:10px;padding:10px 12px;color:#7f1d1d;font-weight:600}.opok{color:#15803d;font-weight:700;font-size:14px}';
    document.head.appendChild(sx);
  }
  v=document.createElement('div');v.id='viewTask4';v.hidden=true;
  v.innerHTML='<div class="tkwrap">'+
   '<div class="tkhead"><div><p class="tklab">Task</p><h1 class="tkname">Register New OPay Account</h1></div>'+
   '<div class="tkearn"><small>YOU WILL EARN</small><b>&#8358;3,000.00</b><span>&#8358;3,000.00 will be credited after approval.</span></div></div>'+
   '<div class="opref"><h2>Important: use our referral code</h2><p>Enter this referral code when you register on OPay:</p>'+
   '<div class="oprow"><code id="opCode"></code><button type="button" class="rsvcopy" id="opCopy" aria-label="Copy referral code" title="Copy"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button><span class="opok" id="opOk" role="status" hidden>Copied</span></div>'+
   '<p class="opwarn">If you register without this code, your task will be rejected and you will not receive your &#8358;3,000 reward. The code can&rsquo;t be added after you sign up, so enter it while you register.</p></div>'+
   '<div class="tkgrid">'+
   '<div class="tkcard"><h2><span class="tki" aria-hidden="true">&#128203;</span>Instructions</h2><ol class="tksteps">'+
   '<li>Download the official OPay app from the Google Play Store or the App Store.</li>'+
   '<li>Tap Sign up and create a brand new OPay account with a new phone number that has never been used on OPay.</li>'+
   '<li>Do not use an account you already have or an existing account.</li>'+
   '<li>Complete the registration and wait until you reach your OPay home screen.</li>'+
   '<li>Do not share your password, OTP, BVN, card details, or any personal bank information in your screenshots.</li>'+
   '</ol></div>'+
   '<div class="tkcard"><h2><span class="tkchk" aria-hidden="true">&#10003;</span>Proof Required</h2><div class="tkproof">'+
   '<p style="margin:0 0 14px">Upload one screenshot of your new OPay profile, showing your name or phone number. Do not show your PIN or password.</p>'+
   '<b>Your proof will be rejected if:</b><ul class="tkrej">'+
   '<li>You registered without the referral code.</li>'+
   '<li>The screenshot shows an old OPay account.</li>'+
   '<li>The screenshot is edited, cropped to hide details or blurry.</li>'+
   '<li>It doesn&rsquo;t show your name or phone number.</li>'+
   '<li>It belongs to someone else, or the same screenshot is used for more than one submission.</li>'+
   '</ul></div></div></div>'+
   '<div class="tkact"><button type="button" class="btn btn-line" id="tk4Back">&larr; Back to tasks</button><button type="button" class="btn btn-main" id="tk4Start">Start task</button></div></div>';
  v3.parentNode.insertBefore(v,v3.nextSibling);
  document.getElementById('opCode').textContent=OPAY_CODE;
  document.getElementById('opCopy').onclick=function(){
    var okEl=document.getElementById('opOk');
    function done(){okEl.hidden=false;setTimeout(function(){okEl.hidden=true;},2500);}
    function fallback(){
      var ta=document.createElement('textarea');ta.value=OPAY_CODE;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');done();}catch(e){}
      document.body.removeChild(ta);
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(OPAY_CODE).then(done,fallback);}else{fallback();}
  };
  document.getElementById('tk4Back').onclick=close4;
  document.getElementById('tk4Start').onclick=function(){
    v.hidden=true;window.__t4=true;
    var s=document.getElementById('tkStart');if(s)s.click();
  };
  return v;
}
function mkTask4_old(){
  var v=document.getElementById('viewTask4');if(v)return v;
  var v3=document.getElementById('viewTask3');if(!v3)return null;
  v=document.createElement('div');v.id='viewTask4';v.hidden=true;
  v.innerHTML='<div class="tkwrap">'+
   '<div class="tkhead"><div><p class="tklab">Task</p><h1 class="tkname">Download Email App</h1></div>'+
   '<div class="tkearn"><small>YOU WILL EARN</small><b>&#8358;2,200.00</b><span>&#8358;2,200.00 will be credited after approval.</span></div></div>'+
   '<div class="tkgrid">'+
   '<div class="tkcard"><h2><span class="tki" aria-hidden="true">&#128203;</span>Instructions</h2><ol class="tksteps">'+
   '<li>Open the Google Play Store (Android) or the App Store (iPhone).</li>'+
   '<li>Search for the email app (Gmail, Outlook or Yahoo Mail).</li>'+
   '<li>Tap Install and wait for the download to finish.</li>'+
   '<li>When the button changes to Open, take a screenshot of the app page. Do not tap Uninstall.</li>'+
   '</ol></div>'+
   '<div class="tkcard"><h2><span class="tkchk" aria-hidden="true">&#10003;</span>Proof Required</h2><div class="tkproof">'+
   '<p style="margin:0 0 14px">Upload one screenshot of the email app page in the store, showing the app name and the Open button.</p>'+
   '<b>Your proof will be rejected if:</b><ul class="tkrej">'+
   '<li>It shows Install or Update instead of Open.</li>'+
   '<li>The app name is cut off or can&rsquo;t be read.</li>'+
   '<li>The screenshot is edited, blurry, or taken from someone else&rsquo;s phone.</li>'+
   '<li>The same screenshot is used for more than one submission.</li>'+
   '</ul></div></div></div>'+
   '<div class="tkact"><button type="button" class="btn btn-line" id="tk4Back">&larr; Back to tasks</button><button type="button" class="btn btn-main" id="tk4Start">Start task</button></div></div>';
  v3.parentNode.insertBefore(v,v3.nextSibling);
  document.getElementById('tk4Back').onclick=close4;
  document.getElementById('tk4Start').onclick=function(){
    v.hidden=true;window.__t4=true;
    var s=document.getElementById('tkStart');if(s)s.click();
  };
  return v;
}
function open4(){
  var x=document.getElementById('viewExplore');if(x)x.hidden=true;
  var v=mkTask4();if(v)v.hidden=false;
  window.scrollTo(0,0);
}
var cardsBox4=document.getElementById('cards');
if(cardsBox4){
  cardsBox4.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.tc-act button[data-n="4"]');
    if(!b||b.disabled||!t4Open())return;
    var a=b.closest('article'),st=a&&a.getAttribute('data-st');
    if(st&&st!=='prog')return;
    e.stopPropagation();e.preventDefault();
    var r=gs('stRsv');
    if(r&&r.end>Date.now()&&gs('stCur')===4&&window.stOpenTask){window.stOpenTask();return;}
    open4();
  },true);
  new MutationObserver(function(){skin4();poster4();}).observe(cardsBox4,{childList:true});
}
var tks4=document.getElementById('tkStart');
if(tks4)tks4.addEventListener('click',function(){window.__t4=false;},true);
window.addEventListener('hashchange',function(){var v=document.getElementById('viewTask4');if(v)v.hidden=true;});
var nav4=document.getElementById('navExplore');
if(nav4)nav4.addEventListener('click',function(){var v=document.getElementById('viewTask4');if(v&&!v.hidden)close4();});
setInterval(function(){skin4();poster4();},300);
/* ---------- Task 5: Purchase Airtime From OPay ---------- */
TASKN[5]='Purchase Airtime From OPay';
POSTERS[5]='Vincent Robson';
if(typeof OPAYMSG!=='undefined'){OPAYMSG['Airtime bought for a different phone number']='Your airtime was bought for a different phone number. For this task, buy normal airtime of \u20A6100 for the same new phone number you used to register your OPay account, not another number. Then submit a new screenshot that shows that number.';OPAYMSG['Voucher airtime purchased instead of normal airtime']='You bought voucher airtime, but this task needs normal airtime. Open Airtime Top Up in OPay, buy normal airtime of \u20A6100 for your new registered number, then submit a new screenshot.';}
function t5Open(){return (gs('stOK')||[]).indexOf(4)>-1;}
function skin5(){
  var b=document.querySelector('#cards button[data-n="5"]');
  var a=b&&b.closest('article');if(!a||a.getAttribute('data-st'))return;
  if(!t5Open())return;
  var chip=a.querySelector('.lockchip'),lb=a.querySelector('.lockbox'),h=a.querySelector('h3'),meta=a.querySelector('.tc-meta');
  if(!chip||!lb||!meta)return;
  if(!h){h=document.createElement('h3');meta.parentNode.insertBefore(h,meta);}
  if(h.textContent!=='Purchase Airtime From OPay')h.textContent='Purchase Airtime From OPay';
  if(chip.textContent!=='OPEN'){chip.className='lockchip open';chip.textContent='OPEN';}
  if(lb.textContent.indexOf('Task unlocked')<0){lb.className='lockbox';lb.innerHTML='<span>Task unlocked</span>';}
  [].forEach.call(a.querySelectorAll('.tc-act button'),function(x){x.disabled=false;});
}
function poster5(){
  var b=document.querySelector('#cards button[data-n="5"]');
  var a=b&&b.closest('article');if(!a)return;
  var slot=a.querySelector('.tc-top > span:first-child');if(!slot)return;
  var unl=!!a.querySelector('h3'),has=!!slot.querySelector('.tposter');
  if(unl&&!has)slot.innerHTML='<span class="tposter"><i>TASK POSTER</i><b>'+POSTERS[5]+'</b></span>';
  else if(!unl&&has)slot.innerHTML='';
}
function close5(){
  var v=document.getElementById('viewTask5');if(v)v.hidden=true;
  var x=document.getElementById('viewExplore');if(x)x.hidden=false;
  window.scrollTo(0,0);
}
function mkTask5(){
  var v=document.getElementById('viewTask5');if(v)return v;
  var anchor=document.getElementById('viewTask4')||document.getElementById('viewTask3');if(!anchor)return null;
  if(!document.getElementById('ap5Style')){
    var sx=document.createElement('style');sx.id='ap5Style';
    sx.textContent='.novch{margin:18px 0 0;background:#fde8e8;border:2px solid #dc2626;border-radius:16px;padding:18px 20px;color:#7f1d1d}.novch h2{margin:0 0 6px;font-size:20px;font-weight:800;color:#b91c1c}.novch p{margin:0;font-size:15.5px;line-height:1.5;font-weight:600}.costnote{margin:14px 0 0;background:#fff8e1;border:1px solid #f3dd9b;border-radius:12px;padding:12px 14px;color:#7a4a00;font-size:14.5px;line-height:1.5;font-weight:600}';
    document.head.appendChild(sx);
  }
  v=document.createElement('div');v.id='viewTask5';v.hidden=true;
  v.innerHTML='<div class="tkwrap">'+
   '<div class="tkhead"><div><p class="tklab">Task</p><h1 class="tkname">Purchase Airtime From OPay</h1></div>'+
   '<div class="tkearn"><small>YOU WILL EARN</small><b>&#8358;1,000.00</b><span>&#8358;1,000.00 will be credited after approval.</span></div></div>'+
   '<div class="novch"><h2>Do NOT buy voucher airtime</h2><p>Buy normal airtime only, from Airtime Top Up. If you buy voucher airtime, your task will be rejected and you will not receive your &#8358;1,000 reward.</p></div>'+
   '<div class="costnote">You will spend &#8358;100 of your own money on this task. The airtime goes to your own new OPay number, so you keep it.</div>'+
   '<div class="tkgrid">'+
   '<div class="tkcard"><h2><span class="tki" aria-hidden="true">&#128203;</span>Instructions</h2><ol class="tksteps">'+
   '<li>Open the OPay app and sign in to your new registered account.</li>'+
   '<li>Go to Airtime Top Up.</li>'+
   '<li>Buy normal airtime of &#8358;100 for your new registered number.</li>'+
   '<li>Wait until the app shows that the purchase was successful.</li>'+
   '<li>Take a screenshot of the success or receipt screen.</li>'+
   '<li>Do not show your PIN, password, OTP or card details in your screenshot.</li>'+
   '</ol></div>'+
   '<div class="tkcard"><h2><span class="tkchk" aria-hidden="true">&#10003;</span>Proof Required</h2><div class="tkproof">'+
   '<p style="margin:0 0 14px">Upload one screenshot of the successful airtime purchase, showing the amount, the date and time, and that it was normal airtime (not voucher airtime). Do not show your PIN or password.</p>'+
   '<b>Your proof will be rejected if:</b><ul class="tkrej">'+
   '<li>The purchase failed, is still pending, or isn&rsquo;t shown.</li>'+
   '<li>It shows voucher airtime or any other purchase.</li>'+
   '<li>The amount is different from the one in the task.</li>'+
   '<li>The screenshot is edited, cropped to hide details, or blurry.</li>'+
   '<li>It belongs to someone else, or the same screenshot is used for more than one submission.</li>'+
   '</ul></div></div></div>'+
   '<div class="tkact"><button type="button" class="btn btn-line" id="tk5Back">&larr; Back to tasks</button><button type="button" class="btn btn-main" id="tk5Start">Start task</button></div></div>';
  anchor.parentNode.insertBefore(v,anchor.nextSibling);
  document.getElementById('tk5Back').onclick=close5;
  document.getElementById('tk5Start').onclick=function(){
    v.hidden=true;window.__t5=true;
    var s=document.getElementById('tkStart');if(s)s.click();
  };
  return v;
}
function open5(){
  var x=document.getElementById('viewExplore');if(x)x.hidden=true;
  var v=mkTask5();if(v)v.hidden=false;
  window.scrollTo(0,0);
}
var cardsBox5=document.getElementById('cards');
if(cardsBox5){
  cardsBox5.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.tc-act button[data-n="5"]');
    if(!b||b.disabled||!t5Open())return;
    var a=b.closest('article'),st=a&&a.getAttribute('data-st');
    if(st&&st!=='prog')return;
    e.stopPropagation();e.preventDefault();
    var r=gs('stRsv');
    if(r&&r.end>Date.now()&&gs('stCur')===5&&window.stOpenTask){window.stOpenTask();return;}
    open5();
  },true);
  new MutationObserver(function(){skin5();poster5();}).observe(cardsBox5,{childList:true});
}
var tks5=document.getElementById('tkStart');
if(tks5)tks5.addEventListener('click',function(){window.__t5=false;},true);
window.addEventListener('hashchange',function(){var v=document.getElementById('viewTask5');if(v)v.hidden=true;});
var nav5=document.getElementById('navExplore');
if(nav5)nav5.addEventListener('click',function(){var v=document.getElementById('viewTask5');if(v&&!v.hidden)close5();});
setInterval(function(){skin5();poster5();},300);
/* Account is created only when payout details are confirmed */
window.stReg=window.stReg||null;
function payErr(el,msg){var e=el.parentNode.querySelector('.err');if(e)e.textContent=msg||'';el.setAttribute('aria-invalid',msg?'true':'false');return !msg;}
function guardPayout(){
  if(location.hash!=='#/payout')return;
  if(window.stReg||window.stPayDone||gs('stRegHold')||gs('stNeedPayout'))return;
  location.replace('/');
}
window.addEventListener('hashchange',guardPayout);
guardPayout();
document.addEventListener('submit',function(e){
  var f=e.target;if(!f||f.id!=='payForm')return;
  e.preventDefault();e.stopImmediatePropagation();
  if(window.stPayBusy)return;
  var bank=f.elements.bank,acct=f.elements.account,nm=f.elements.acname;
  var a=payErr(bank,bank.value?'':'Choose your bank.');
  var b=payErr(acct,/^\d{10}$/.test(acct.value)?'':'Enter your 10-digit account number.');
  var c=payErr(nm,/^[A-Za-z][A-Za-z .'-]{2,}$/.test(nm.value.trim())?'':'Enter the account name as it appears at your bank.');
  var d1=true,d2=true;var d3=!!window.stSecOk;$('secErr').textContent=d3?'':'Please complete the security check.';
if(!(a&&b&&c&&d1&&d2&&d3))return;
  var reg=window.stReg||gs('stRegHold');if(!reg){var rfm=$('regForm');if(rfm&&rfm.elements.email.value&&rfm.elements.password.value){reg={name:rfm.elements.name.value.trim(),email:rfm.elements.email.value.trim(),phone:rfm.elements.phone.value,password:rfm.elements.password.value};}}
  if(!reg&&!gs('stNeedPayout')){location.replace('/');return;}
  var bt=$('payBtn'),busy=$('payBusy'),done=$('payDone');
  var bankName=bank.options[bank.selectedIndex].text,acNo=acct.value,acName=nm.value.trim();
  function lock(x){bank.disabled=x;acct.disabled=x;nm.disabled=x;bt.disabled=x;}
  window.stPayBusy=true;lock(true);done.hidden=true;busy.hidden=false;
  var body={bank:bankName,account:acNo,acname:acName},req;
  if(reg){body.name=reg.name;body.email=reg.email;body.phone=reg.phone;body.password=reg.password;body.username=reg.username||'';req=post('/api/register',body);}
  else{req=post('/api/payout',body);}
  var wait=new Promise(function(r){setTimeout(r,8000);});
  Promise.all([req,wait]).then(function(x){
    var d=x[0];if(!d.ok)window.stPayBusy=false;
    if(!d.ok){
      busy.hidden=true;lock(false);
      if(reg){
        alert(d.error||'Could not create your account. Please try again.');
        if(d.__s===409||d.__s===400){window.stReg=null;location.hash='#/register';}
      }else if(d.__s===401){alert('Please log in again.');location.replace('/');}
      else{alert(d.error||'Could not save your bank details. Please try again.');}
      return;
    }
    busy.hidden=true;done.hidden=false;
    var u=d.user||{},old=gs('stUser')||{};
    var nu={name:(reg&&reg.name)||old.name||u.name||'',email:(reg&&reg.email)||old.email||u.email||'',bank:bankName,account:acNo,acname:acName.toUpperCase()};
    wipe();ss('stUser',nu);
    if(u.id)ss('stProfile',profileFor(u));
    ss('stNeedPayout',null);ss('stRegHold',null);window.stPayDone=true;
    setTimeout(function(){location.replace('/dashboard#/dashboard');},2200);
  });
},true);
/* Next / Previous buttons: loading box for 4 seconds */
(function(){
  var pass=false,busy=false;
  document.addEventListener('click',function(e){
    if(pass)return;
    var b=e.target.closest&&e.target.closest('#pager button');
    if(!b||b.disabled)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(busy)return;
    busy=true;
    var ov=document.getElementById('delayOv');if(ov)ov.hidden=false;
    var id=b.id;
    setTimeout(function(){
      if(ov)ov.hidden=true;busy=false;
      var t=document.getElementById(id)||b;
      pass=true;
      try{t.click();}finally{pass=false;}
    },4000);
  },true);
})();
/* Payout page extras: username, worker access code, security check */
(function(){
  var pf=$('payForm'),anchor=$('payBtn');
  if(!pf||!anchor||$('pyUser'))return;
  var st=document.createElement('style');
  st.textContent='.sechk{background:#f3ecd9;color:#1f2937;border-left:4px solid #16a34a;border-radius:12px;padding:14px 16px;margin:4px 0 16px}.sechk-h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;margin-bottom:10px}.sechk-h svg{width:16px;height:16px}.sechk-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sechk canvas{border-radius:6px;border:1px solid #d8cfb5;max-width:100%}.sechk-new{font:inherit;font-size:13px;font-weight:600;color:#15803d;background:#fff;border:1.5px solid #16a34a;border-radius:8px;padding:6px 12px;cursor:pointer}.sechk-in{width:100%;font:inherit;font-size:15px;color:#1f2937;background:#fff;border:1px solid #d8cfb5;border-radius:10px;padding:11px 14px;margin-top:12px}.sechk-in:focus{outline:none;border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.2)}.sechk-btn{font:inherit;font-size:14px;font-weight:700;color:#fff;background:#16a34a;border:0;border-radius:10px;padding:10px 22px;margin-top:12px;cursor:pointer}.sechk-btn:disabled{opacity:.7;cursor:wait}.sechk-ok{display:flex;align-items:center;gap:12px;background:#f5f5f5;border:1px solid #d9d9d9;border-radius:10px;padding:14px 16px;margin-top:12px;font-weight:600}.sechk-tick{flex:none;width:32px;height:32px;border-radius:50%;background:#16a34a;color:#fff;display:grid;place-items:center;font-size:18px;font-weight:800}.secerr{display:block;color:#b4232f;font-size:12.5px;margin-top:8px}';
  document.head.appendChild(st);
  var box=document.createElement('div');
  box.innerHTML=
   
   
   '<div class="sechk"><div class="sechk-h"><svg viewBox="0 0 24 24" fill="#16a34a" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V5z"/></svg>Security check</div>'+
   '<div class="sechk-row"><canvas id="secCv" width="150" height="44"></canvas><button type="button" class="sechk-new" id="secNew">&#8635; New code</button></div>'+
   '<div id="secForm"><input class="sechk-in" id="secIn" type="text" placeholder="Type the code above" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="button" class="sechk-btn" id="secBtn">Check</button></div>'+
   '<div class="sechk-ok" id="secOk" hidden><span class="sechk-tick">&#10003;</span>Success!</div>'+
   '<span class="secerr" id="secErr" role="alert"></span></div>';
  while(box.firstChild)anchor.parentNode.insertBefore(box.firstChild,anchor);
  function secDraw(){
    var cv=$('secCv'),x=cv.getContext('2d'),W=cv.width,H=cv.height,S='ABCDEFGHJKLMNPRSTUVWXYZ23456789',c='',i;
    for(i=0;i<6;i++)c+=S.charAt(Math.floor(Math.random()*S.length));
    x.clearRect(0,0,W,H);x.fillStyle='#e7dfc9';x.fillRect(0,0,W,H);
    for(i=0;i<5;i++){x.strokeStyle='rgba(60,60,60,'+(0.25+Math.random()*0.3)+')';x.beginPath();x.moveTo(Math.random()*W,Math.random()*H);x.lineTo(Math.random()*W,Math.random()*H);x.stroke();}
    var cols=['#1f2937','#7c2d12','#14532d','#1e3a8a','#6b21a8'];
    for(i=0;i<6;i++){x.save();x.translate(12+i*22,H/2+8);x.rotate((Math.random()-0.5)*0.5);x.font='bold '+(24+Math.floor(Math.random()*6))+'px Georgia,serif';x.fillStyle=cols[Math.floor(Math.random()*cols.length)];x.fillText(c.charAt(i),0,0);x.restore();}
    for(i=0;i<40;i++){x.fillStyle='rgba(0,0,0,'+Math.random()*0.35+')';x.fillRect(Math.random()*W,Math.random()*H,1.5,1.5);}
  }
  secDraw();
  $('secNew').onclick=function(){window.stSecOk=false;$('secOk').hidden=true;$('secForm').hidden=false;$('secIn').value='';$('secErr').textContent='';secDraw();};
  $('secBtn').onclick=function(){
    var er=$('secErr'),b=$('secBtn');
    if(!$('secIn').value.trim()){er.textContent='Type the code shown above.';return;}
    er.textContent='';b.disabled=true;b.textContent='Checking...';
    setTimeout(function(){b.disabled=false;b.textContent='Check';window.stSecOk=true;$('secForm').hidden=true;$('secOk').hidden=false;},1200);
  };
})();
/* Registration page: first/other name, username check, I'm not a robot */
(function(){
  var rf=$('regForm');if(!rf)return;
  var first=$('firstname'),other=$('othername'),full=$('name'),un=$('username'),ok=$('unOk'),hint=$('unHint'),cb=$('robotCb'),rerr=$('robotErr');
  if(!first||!other||!full||!un||!ok||!hint||!cb||!rerr)return;
  var HINT=hint.textContent,robotOk=false,UN=/^[a-z][a-z0-9_]{2,19}$/,UNMSG='Use 3 to 20 letters, numbers or underscores, starting with a letter.';
  function errEl(el){return el.closest('.fld').querySelector('.err');}
  function setErr(el,msg){var e=errEl(el);if(e)e.textContent=msg||'';el.setAttribute('aria-invalid',msg?'true':'false');return !msg;}
  function nm(v){return /^[A-Za-z][A-Za-z '-]{1,}$/.test(v);}
  function sync(){full.value=(first.value.trim()+' '+other.value.trim()).trim();}
  first.addEventListener('input',sync);other.addEventListener('input',sync);
  un.addEventListener('input',function(){
    var v=un.value.trim().toLowerCase(),good=UN.test(v);
    ok.hidden=!good;
    if(!v){setErr(un,'');hint.textContent=HINT;return;}
    if(good){setErr(un,'');hint.textContent='Looks good \u2713';}
    else{setErr(un,UNMSG);hint.textContent=HINT;}
  });
  var subBtn=rf.querySelector('button[type="submit"]');
  function setRobot(on){robotOk=on;cb.setAttribute('aria-checked',on?'true':'false');cb.innerHTML=on?'\u2713':'';cb.style.borderColor=on?'#16a34a':'#c1c1c1';if(subBtn)subBtn.disabled=!on;}
  setRobot(false);
  function robotClick(){
    if(robotOk||cb.getAttribute('data-busy'))return;
    cb.setAttribute('data-busy','1');rerr.textContent='';
    cb.innerHTML='<span style="width:16px;height:16px;border:3px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:sp .8s linear infinite;display:block"></span>';
    setTimeout(function(){cb.removeAttribute('data-busy');setRobot(true);},7000);
  }
  cb.addEventListener('click',robotClick);
  $('robotLab').addEventListener('click',robotClick);
  document.addEventListener('submit',function(e){
    if(e.target!==rf)return;
    sync();
    var a=setErr(first,nm(first.value.trim())?'':'Enter your first name.');
    var b=setErr(other,nm(other.value.trim())?'':'Enter your other name.');
    var c=setErr(un,UN.test(un.value.trim().toLowerCase())?'':UNMSG);
    rerr.textContent=robotOk?'':'Please confirm you are not a robot.';
    if(!(a&&b&&c&&robotOk)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
})();
setInterval(refresh,20000);
/* Back button: task pages count as a history step, so Back returns to the tasks list */
(function(){
  var VIEWS=[['viewReserve','rsvBack'],['viewTask3','t3Back'],['viewTask2','tk2Back'],['viewTask','tkBack']];
  var pushed=false,fromPop=false;
  function open(){for(var i=0;i<VIEWS.length;i++){var v=$(VIEWS[i][0]);if(v&&!v.hidden)return VIEWS[i];}return null;}
  function check(){
    var o=open();
    if(o&&!pushed){pushed=true;try{history.pushState({st:'sub'},'',location.href);}catch(e){}}
    else if(!o&&pushed){pushed=false;if(!fromPop&&history.state&&history.state.st==='sub'){try{history.back();}catch(e){}}}
  }
  var mo=new MutationObserver(check);
  VIEWS.forEach(function(x){var v=$(x[0]);if(v)mo.observe(v,{attributes:true,attributeFilter:['hidden']});});
  window.addEventListener('hashchange',function(){pushed=false;},true);
  window.addEventListener('popstate',function(){
    var o=open();
    if(o){fromPop=true;pushed=false;var b=$(o[1]);if(b)b.click();setTimeout(function(){fromPop=false;},0);}
  });
})();
refresh();
})();
