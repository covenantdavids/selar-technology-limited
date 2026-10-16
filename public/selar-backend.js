/* Selar Technology Limited: connects the website to the server
   (accounts, bank details, task submissions, withdrawals, wallet). */
(function(){
var $=function(i){return document.getElementById(i)};
var DASH=/^#\/(dashboard|submissions|wallet|profile|redeem)/;
var STATE=['stJobs','stRetry','stOK','stDone','stTaskState','stCur','stRsv','stRsvTask','stSubs','stAppr1','stRes','stRes3'];

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

/* ---------- Register (runs after the page's own checks pass) ---------- */
var rf=$('regForm');
rf.addEventListener('submit',function(){
  if(rf.querySelector('[aria-invalid="true"]'))return;           /* the page's own checks failed */
  var f=rf.elements;
  post('/api/register',{name:f.name.value.trim(),email:f.email.value.trim(),phone:f.phone.value,password:f.password.value}).then(function(d){
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
  post('/api/payout',{bank:b.options[b.selectedIndex].text,account:pf.elements.account.value,acname:pf.elements.acname.value.trim()}).then(function(d){
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
      setTimeout(function(){location.reload();},50);
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
      if(d.ok){pass=true;try{f.requestSubmit();}finally{pass=false;}shot=null;return;}
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
    location.hash='#top';location.reload();
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
function apply(d){
  try{notifyApproved(d);}catch(e){}
  var ok=gs('stOK')||[];
  d.submissions.forEach(function(s){
    if(s.status==='approved'&&ok.indexOf(s.task_no)<0&&window.stApproveTask){
      window.stApproveTask(s.task_no);
      if(s.task_no===1)ss('stAppr1',String(Date.parse(s.reviewed_at)||Date.now()));
      ok=gs('stOK')||[];
    }
  });
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
window.addEventListener('hashchange',refresh);
setInterval(refresh,20000);
refresh();
})();
