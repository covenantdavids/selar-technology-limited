/* Selar Technology Limited: connects the website to the server
   (accounts, bank details, task submissions, withdrawals, wallet). */
(function(){
var $=function(i){return document.getElementById(i)};
var DASH=/^#\/(dashboard|submissions|wallet|profile|redeem)/;
var STATE=['stJobs','stRetry','stOK','stDone','stTaskState','stCur','stRsv','stRsvTask','stSubs','stAppr1','stAppr2','stT3form','stRes','stRes3'];

function api(path,opt){
  opt=opt||{};opt.credentials='same-origin';
  return fetch(path,opt).then(function(r){
    return r.json().catch(function(){return {};}).then(function(d){d.__s=r.status;return d;});
  },function(){return {ok:false,error:'No internet connection. Please try again.',__s:0};});
}
function post(p,b){return api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});}
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
  window.stRegP=post('/api/register',{name:f.name.value.trim(),email:f.email.value.trim(),phone:f.phone.value,password:f.password.value});
  window.stRegP.then(function(d){
    if(d.ok){wipe();ss('stProfile',profileFor(d.user));return;}
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
      ss('stUser',{name:u.name,email:u.email,bank:u.bank,account:u.account,acname:u.acname});
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
    if(isNaN(v)||v<100){er.textContent='The minimum withdrawal is \u20A6100.';return;}
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
  var can=Number(d.user.balance)>=100;
  var old=document.getElementById('stPop');if(old)old.remove();
  var p=document.createElement('div');p.id='stPop';
  p.innerHTML='<b style="display:block;font-size:15px;margin-bottom:4px">\uD83C\uDF89 '+money(add)+' approved!</b>'+
    (can?'You can now withdraw your earnings. Tap here to withdraw.':'Added to your wallet. You can withdraw once your balance reaches \u20A6100.');
  var card=document.querySelector('.balpill'),top=70,right=16;
  if(card&&card.offsetParent){var r=card.getBoundingClientRect();top=r.bottom+10;right=Math.max(12,window.innerWidth-r.right);}
  p.style.cssText='position:fixed;z-index:99999;top:'+top+'px;right:'+right+'px;max-width:280px;background:#15803d;color:#fff;padding:14px 16px;border-radius:14px;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer';
  p.onclick=function(){location.hash='#/wallet';p.remove();};
  document.body.appendChild(p);
  setTimeout(function(){if(p.parentNode)p.remove();},10000);
}
/* ---------- Notifications (bell) ---------- */
var NOTE_UID=null;
var TASKN={1:'Download Kuda App',2:'Create new email account',3:'Create New PalmPay Account'};
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
    var m=String(x.m||'');if(m.length>230)m=m.slice(0,230).replace(/\s+\S*$/,'')+'...';
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
    if(s.status==='rejected')add('rej-'+s.id,'\u274C','Submission rejected','Your proof for "'+nm+'" was not accepted: '+(s.reject_reason||'proof not accepted')+'. You can start the task again.',Date.parse(s.reviewed_at),'rej');
  });
  d.withdrawals.forEach(function(w){
    add('wd-'+w.id,'\uD83D\uDCB8','Withdrawal placed','Your withdrawal of '+money(w.amount)+' has been received and is being processed. It will be sent to your bank account shortly.',Date.parse(w.created_at),'wd');
    if(w.status==='paid')add('wdp-'+w.id,'\u2705','Withdrawal paid','Done! '+money(w.amount)+' has been sent to your bank account. Check your bank app.',Date.now(),'wdp');
    if(w.status==='rejected')add('wdr-'+w.id,'\u21A9\uFE0F','Withdrawal refunded','Your withdrawal of '+money(w.amount)+' could not be processed. The money is back in your wallet.',Date.now(),'wdr');
  });
  var j=gs('stJobs')||{};
  Object.keys(j).forEach(function(n){
    if(j[n].fail&&!j[n].sub)add('fail-'+n+'-'+j[n].end,'\u26A0\uFE0F',n==3?'Verification failed':'Task not completed',n==3?'We could not verify a new PalmPay account with the details you submitted. Submit your name and the new phone number before registering your new account so we can track your task.':'Time ran out on "'+(TASKN[n]||'your task')+'" before you submitted proof. Tap the task to start it again.',j[n].end,'fail');
  });
  a.sort(function(x,y){return y.a-x.a;});
  notePut(a);noteBadge();
  var panel=document.getElementById('stNotes');if(panel&&!panel.hidden)noteDraw();
  var show=fresh.filter(function(n){return n.y!=='ok'&&n.a>Date.now()-120000;})[0];
  if(show)noteToast(show);
}
function apply(d){
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
    alert('Your submission "'+rej[0].task_name+'" was rejected: '+(rej[0].reject_reason||'proof not accepted')+'. You can start the task again.');
    location.reload();return;
  }
  var l=gs('stUser')||{};
  if(!pushed&&!d.user.account&&l.account&&l.bank&&l.acname){pushed=true;post('/api/payout',{bank:l.bank,account:l.account,acname:l.acname});}
}
function refresh(){
  if(!DASH.test(location.hash))return;
  api('/api/me').then(function(d){
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
setInterval(keepPending,400);

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
window.addEventListener('hashchange',refresh);
setInterval(refresh,20000);
refresh();
})();
