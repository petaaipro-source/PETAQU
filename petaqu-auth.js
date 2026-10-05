/* PETAQU - Login OTP email + Google + Username/Password (Supabase Auth). Sekali verifikasi, sesi tetap aktif sampai tombol Keluar ditekan. */
(function(){"use strict";
const CFG={url:"https://fhulmqwuzswxrqjcioww.supabase.co",anon:"sb_publishable_VkN9kEL6V9WZf-GwHtDfIw_TB2FcS3L"};  // Supabase > Project Settings > API
const DOM="petaqu.my.id",SK="pq_cloud_session",KEY="peta_auth_ok",$=id=>document.getElementById(id);
const siap=()=>!/ISI_/.test(CFG.url+CFG.anon);
if(siap())window.PETAQU_CFG=CFG;   // sekaligus mengaktifkan sinkron awan (petaqu-cloud.js) dengan sesi yang sama
const post=(p,b,tok)=>fetch(CFG.url+p,{method:"POST",headers:Object.assign({apikey:CFG.anon,"Content-Type":"application/json"},tok?{Authorization:"Bearer "+tok}:{}),body:JSON.stringify(b||{})});
const getS=()=>{try{return JSON.parse(localStorage.getItem(SK))}catch{return null}};
const hapus=()=>{localStorage.removeItem(SK);localStorage.removeItem(KEY)};
function simpan(d,email){localStorage.setItem(SK,JSON.stringify({access_token:d.access_token,refresh_token:d.refresh_token,uid:d.user&&d.user.id,email:email||(d.user&&d.user.email),exp:Date.now()+(d.expires_in||3600)*1e3}));localStorage.setItem(KEY,"1")}
async function perpanjang(){   // perpanjang token otomatis; offline = tetap masuk
  const s=getS();if(!s||!s.refresh_token||(s.exp&&s.exp-Date.now()>3e5))return;
  try{const r=await post("/auth/v1/token?grant_type=refresh_token",{refresh_token:s.refresh_token});
    if(r.ok)simpan(await r.json(),s.email);else if(r.status===400||r.status===401||r.status===403){hapus();location.reload()}}catch{}
}
async function validasi(){   // sesi palsu / dicabut / akun belum disetujui admin -> keluar. Offline atau server error = dibiarkan
  const s=getS();if(!s||!s.access_token||navigator.onLine===false)return;
  try{
    const H={apikey:CFG.anon,Authorization:"Bearer "+s.access_token};
    const u=await fetch(CFG.url+"/auth/v1/user",{headers:H});
    if(u.status===401||u.status===403||u.status===404){hapus();location.reload();return}
    if(!u.ok)return;
    const id=(await u.json()).id;
    const r=await fetch(CFG.url+"/rest/v1/profiles?select=role&id=eq."+encodeURIComponent(id),{headers:H});
    if(!r.ok)return;const w=await r.json();
    if(!w[0]||!PERAN_OK.includes(w[0].role)){hapus();location.reload()}   // izin dicabut / belum disetujui / profil hilang -> keluar
  }catch{}
}
async function segarkan(){await perpanjang();await validasi()}
let _tmSeg=0;
function mulaiSegarkan(){   // izin dicabut admin berlaku <=2 menit, atau seketika saat tab dibuka kembali
  window.dispatchEvent(new Event("pq-login"));   // petaqu-admin.js: tampilkan panel persetujuan bila yang masuk admin
  if(_tmSeg)return;_tmSeg=setInterval(segarkan,12e4);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&localStorage.getItem(KEY)==="1")segarkan()});
}
const PERAN_OK=["admin","surveyor","viewer"];
async function peranNama(tok,uid){   // nama peran dari server; null bila profil tidak ada / gagal cek
  try{if(!tok||!uid)return null;
    const r=await fetch(CFG.url+"/rest/v1/profiles?select=role&id=eq."+encodeURIComponent(uid),{headers:{apikey:CFG.anon,Authorization:"Bearer "+tok}});
    if(!r.ok)return null;const w=await r.json();return w[0]?w[0].role:null}catch{return null}
}
const peranOk=async(tok,uid)=>PERAN_OK.includes(await peranNama(tok,uid));   // true hanya untuk admin/surveyor/viewer. Gagal cek apa pun = DITOLAK (fail-closed)
const PESAN_TOLAK={
  pending:"Akun kamu sudah terdaftar tetapi MASIH MENUNGGU PERSETUJUAN ADMIN. Kamu bisa masuk setelah admin mengizinkan.",
  trial:"Masa uji coba gratis telah berakhir. Hubungi admin untuk akses penuh.",
  blocked:"Akun ini diblokir oleh admin. Hubungi admin.",
  none:"Akun ini belum terdaftar. Hubungi admin untuk mendapatkan akses."};
const pesanTolak=r=>PESAN_TOLAK[r]||PESAN_TOLAK.none;
async function periksaMasuk(tok,uid){   // {ok} bila diizinkan; bila tidak, sesi dibuang & pesan sesuai status akun
  const r=await peranNama(tok,uid);
  if(PERAN_OK.includes(r))return{ok:true,role:r};
  tolak(tok);return{ok:false,pesan:pesanTolak(r)};
}
const tolak=tok=>{post("/auth/v1/logout?scope=local",{},tok).catch(()=>{})};
const tutupPanel=()=>{try{typeof toggleSidebarCollapse==="function"?toggleSidebarCollapse(true):document.body.classList.add("sidebar-collapsed");typeof toggleSidebar==="function"&&toggleSidebar(false)}catch{}};   // panel samping selalu tertutup saat masuk; buka lewat tombol panel
const fit=()=>setTimeout(()=>{window.map&&(map.invalidateSize({pan:!1}),fitAllBounds())},50);
function pesan(m,ok){const e=$("loginError"),c=$("loginCard");e.querySelector("span").textContent=m;e.style.color=ok?"var(--cyan)":"";e.classList.add("show");if(!ok){c.classList.remove("shake");c.offsetWidth;c.classList.add("shake")}}

window.PQ_AUTH_INIT=function(){
  const scr=$("loginScreen"),form=$("loginForm"),em=$("loginUser"),otpF=$("loginOtpField"),otp=$("loginOtp"),btn=$("loginBtn"),rs=$("loginResend");
  let tahap=1,cd=0,tm=null;
  // --- Login Google: tangkap token yang dikembalikan Supabase lewat URL ---
  const h=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);
  const galatUrl=h.get("error_description")||q.get("error_description");
  if(h.get("access_token")){
    const t=h.get("access_token"),rt=h.get("refresh_token"),ex=+h.get("expires_in")||3600;
    history.replaceState(null,"",location.pathname+location.search);
    (async()=>{try{
      const r=await fetch(CFG.url+"/auth/v1/user",{headers:{apikey:CFG.anon,Authorization:"Bearer "+t}});if(!r.ok)throw 0;
      const u=await r.json();
      // pendaftar Google baru (peran 'trial' / tanpa profil) BUKAN pengguna resmi -> tolak, jangan beri sesi
      const iz=await periksaMasuk(t,u.id);if(!iz.ok){pesan(iz.pesan);return}
      simpan({access_token:t,refresh_token:rt,expires_in:ex,user:u},u.email);
      scr.classList.add("hide");tutupPanel();typeof showWelcomeSplash==="function"&&showWelcomeSplash();fit();mulaiSegarkan();
    }catch{pesan("Login Google gagal, coba lagi")}})();
  }else if(galatUrl){
    history.replaceState(null,"",location.pathname);
    pesan(/banned/i.test(galatUrl)?"Akun ini sedang dikunci (uji coba gratis berakhir / belum disetujui admin). Hubungi admin untuk akses penuh.":/signup|not allowed|database error/i.test(galatUrl)?"Akun Google ini belum terdaftar. Hubungi admin.":"Login Google gagal, coba lagi");
  }
  $("loginGoogle").addEventListener("click",()=>{
    if(!siap())return pesan("Konfigurasi Supabase belum diisi (petaqu-auth.js)");
    location.href=CFG.url+"/auth/v1/authorize?provider=google&redirect_to="+encodeURIComponent(location.origin+location.pathname);
  });
  if(localStorage.getItem(KEY)==="1"&&!getS())localStorage.removeItem(KEY);   // sesi login lama tanpa token -> kunci
  if(localStorage.getItem(KEY)==="1"){scr.classList.add("hide");tutupPanel();typeof resetWsIdleTimer==="function"&&resetWsIdleTimer();fit();segarkan();mulaiSegarkan()}
  const label=(t,ic)=>{btn.querySelector("span").textContent=t;btn.querySelector("i").className="fa-solid "+ic};
  function hitung(){clearInterval(tm);cd=60;rs.disabled=true;rs.textContent="Kirim ulang (60 dtk)";
    tm=setInterval(()=>{cd--;rs.textContent=cd>0?"Kirim ulang ("+cd+" dtk)":"Kirim ulang kode";if(cd<=0){clearInterval(tm);rs.disabled=false}},1e3)}
  async function kirim(){
    if(!siap())return pesan("Konfigurasi Supabase belum diisi (petaqu-auth.js)");
    btn.disabled=true;
    try{
      const r=await post("/auth/v1/otp",{email:em.value.trim().toLowerCase(),create_user:false});
      if(r.status===429)return pesan("Terlalu sering meminta kode, tunggu sebentar lalu coba lagi");
      if(r.status>=500)return pesan("Gagal mengirim email, coba lagi nanti");
      tahap=2;otpF.style.display="";em.readOnly=true;label("Masuk","fa-right-to-bracket");   // tampilan sama untuk email terdaftar/tidak
      pesan("Jika email terdaftar, kode OTP sudah dikirim. Cek Inbox/Spam.",1);hitung();otp.focus();
    }catch{pesan("Tidak ada koneksi internet")}finally{btn.disabled=false}
  }
  async function masuk(){
    const email=em.value.trim().toLowerCase(),token=otp.value.replace(/\D/g,"");
    if(token.length<6)return pesan("Masukkan kode OTP dari email");
    btn.disabled=true;
    try{
      const r=await post("/auth/v1/verify",{type:"email",email,token});if(!r.ok)throw 0;
      const d=await r.json();const iz=await periksaMasuk(d.access_token,d.user&&d.user.id);if(!iz.ok){otp.value="";return pesan(iz.pesan)}
      simpan(d,email);$("loginError").classList.remove("show");scr.classList.add("hide");tutupPanel();otp.value="";
      typeof showWelcomeSplash==="function"&&showWelcomeSplash();fit();mulaiSegarkan();
    }catch{pesan(navigator.onLine?"Kode salah atau sudah kedaluwarsa":"Tidak ada koneksi internet");otp.value="";otp.focus()}finally{btn.disabled=false}
  }

  // --- Login Username + Password (username dipetakan ke email internal username@petaqu.my.id di Supabase) ---
  const tE=$("tabEmail"),tU=$("tabUser"),pwF=$("loginPwForm"),pwU=$("loginPwUser"),pwP=$("loginPwPass"),pwB=$("loginPwBtn"),alt=$("loginAlt"),gbtn=$("loginGoogle");
  function mode(u){
    form.style.display=u?"none":"";pwF.style.display=u?"":"none";alt.style.display=gbtn.style.display=u?"none":"";
    tU.style.background=u?"var(--cyan)":"transparent";tU.style.color=u?"#04121a":"var(--text-dim)";
    tE.style.background=u?"transparent":"var(--cyan)";tE.style.color=u?"var(--text-dim)":"#04121a";
    $("loginError").classList.remove("show");(u?pwU:em).focus();
  }
  tE.addEventListener("click",()=>mode(0));tU.addEventListener("click",()=>mode(1));
  pwF.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!siap())return pesan("Konfigurasi Supabase belum diisi (petaqu-auth.js)");
    const u=pwU.value.trim().toLowerCase(),pw=pwP.value;
    if(!u||!pw)return pesan("Isi username dan password");
    const email=u.includes("@")?u:u+"@"+DOM;
    pwB.disabled=true;
    try{
      const r=await post("/auth/v1/token?grant_type=password",{email,password:pw});
      if(r.status===429)return pesan("Terlalu banyak percobaan, tunggu sebentar lalu coba lagi");
      if(!r.ok)throw 0;
      const d=await r.json();const iz=await periksaMasuk(d.access_token,d.user&&d.user.id);if(!iz.ok){pwP.value="";return pesan(iz.pesan)}
      simpan(d,email);$("loginError").classList.remove("show");scr.classList.add("hide");tutupPanel();pwP.value="";
      typeof showWelcomeSplash==="function"&&showWelcomeSplash();fit();mulaiSegarkan();
    }catch{pesan(navigator.onLine?"Username atau password salah":"Tidak ada koneksi internet");pwP.value="";pwP.focus()}finally{pwB.disabled=false}
  });
  form.addEventListener("submit",e=>{e.preventDefault();tahap===1?kirim():masuk()});
  rs.addEventListener("click",kirim);
  otp.addEventListener("input",()=>{otp.value=otp.value.replace(/\D/g,"").slice(0,8)});
  em.addEventListener("click",()=>{if(tahap===2){tahap=1;em.readOnly=false;otpF.style.display="none";otp.value="";label("Kirim kode","fa-paper-plane")}});   // ganti email
};

window.logoutUser=function(){
  if(!confirm("Keluar dari aplikasi? Kamu perlu login lagi untuk masuk."))return;
  const s=getS(),fin=()=>{hapus();location.reload()};
  s?post("/auth/v1/logout?scope=local",{},s.access_token).then(fin,fin):fin();   // local = hanya perangkat ini
};
})();
