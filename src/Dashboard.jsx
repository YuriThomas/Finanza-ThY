import React from 'react';

/*
 * Dashboard – costruita sulla "Guida alla costruzione dell'area Dashboard".
 * Ogni pagina segue lo stesso schema: KPI in alto, grafico principale al centro,
 * dettaglio in basso. Pagine incluse: Panoramica, Spese, Budget vs consuntivo,
 * Entrate e risparmio, Patrimonio.
 *
 * Regole di calcolo comuni (guida, "Modello dati di base"):
 *  - i giroconti (type 'Transfer') non sono mai entrate né spese;
 *  - le categorie del macro-gruppo "Risparmio" sono versamenti verso obiettivi:
 *    non contano come spesa, ma riducono il "Disponibile del mese";
 *  - ogni importo nelle card è arrotondato all'euro, i decimali restano nel dettaglio.
 */

export const MACROS = [
  { key:'fisse', label:'Fisse', short:'Fisse', color:'#5b8def' },
  { key:'essenziali', label:'Variabili essenziali', short:'Essenziali', color:'#4bb6c9' },
  { key:'discrezionali', label:'Discrezionali', short:'Discrezionali', color:'#c98bd0' },
  { key:'risparmio', label:'Risparmio', short:'Risparmio', color:'#3ecf8e' },
];
const MACRO_BY_KEY = MACROS.reduce((m, x) => { m[x.key] = x; return m; }, {});
const SPEND_MACROS = ['fisse','essenziali','discrezionali'];
const VARIABLE_MACROS = ['essenziali','discrezionali'];

export const DASH_TABS = [
  ['overview','Panoramica'],
  ['spese','Spese'],
  ['budgetvs','Budget vs consuntivo'],
  ['entrate','Entrate e risparmio'],
  ['patrimonio','Patrimonio'],
];

const ACC_CLASS = {
  'Current Account':'liq', 'Card':'liq', 'Cash':'liq', 'Deposit':'liq',
  'Broker':'inv', 'Crypto':'inv', 'Pension Fund':'prev', 'Loan':'debt', 'Other':'altro',
};
const ACC_CLASSES = [
  { key:'liq', label:'Liquidità', color:'#5b8def' },
  { key:'inv', label:'Investimenti', color:'#e2b341' },
  { key:'prev', label:'Previdenza', color:'#4bb6c9' },
  { key:'altro', label:'Altri beni', color:'#8b7cf6' },
];
const LIQUID_TYPES = { 'Current Account':1, 'Card':1, 'Cash':1, 'Deposit':1 };

const MONO = "'JetBrains Mono',monospace";
const PALETTE = ['#5b8def','#3ecf8e','#e2b341','#8b7cf6','#f0616d','#4bb6c9','#e08a4b','#c98bd0'];

/* ---------------- utilità pure ---------------- */
const addM = (ym, d) => {
  let y = parseInt(ym.slice(0,4),10); let m = parseInt(ym.slice(5,7),10) + d;
  y += Math.floor((m-1)/12); m = (((m-1)%12)+12)%12 + 1;
  return y + '-' + String(m).padStart(2,'0');
};
const daysIn = (ym) => new Date(parseInt(ym.slice(0,4),10), parseInt(ym.slice(5,7),10), 0).getDate();
const monthsBack = (end, n) => { const a=[]; for(let i=n-1;i>=0;i--) a.push(addM(end,-i)); return a; };
const nf0 = new Intl.NumberFormat('it-IT',{ style:'currency', currency:'EUR', maximumFractionDigits:0, minimumFractionDigits:0 });
const e0 = (n) => nf0.format(Math.round(n||0)).replace('-','−');
const signed = (n) => Math.abs(n||0) < 0.5 ? nf0.format(0) : (n >= 0 ? '+' : '−') + nf0.format(Math.abs(Math.round(n)));
const pctTxt = (x) => (x==null || !isFinite(x)) ? '—' : Math.round(x) + '%';
const signedPct = (x) => (x==null || !isFinite(x)) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(Math.round(x)) + '%';
const fmtK = (n) => { const a=Math.abs(n); const s=n<0?'−':''; if(a>=1000) return s + (a/1000).toFixed(a>=10000?0:1).replace('.',',') + 'k'; return s + Math.round(a); };
const niceMax = (v) => { if(!(v>0)) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v/p; const s = n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10; return s*p; };
const sum = (arr) => arr.reduce((s,v)=>s+v,0);
const ma3 = (vals) => vals.map((v,i)=> i<2 ? null : (vals[i]+vals[i-1]+vals[i-2])/3);

function buildIndex(txns, parseNum){
  const exp={}, inc={}, incCat={}, byMonth={};
  for(const t of txns){
    const mo=(t.date||'').slice(0,7); if(!mo) continue;
    (byMonth[mo]||(byMonth[mo]=[])).push(t);
    const a=parseNum(t.amount);
    if(t.type==='Expense'){ const k=t.categoryId||'__none__'; const m=exp[mo]||(exp[mo]={}); m[k]=(m[k]||0)+a; }
    else if(t.type==='Income'){ inc[mo]=(inc[mo]||0)+a; const k=t.categoryId||'__none__'; const m=incCat[mo]||(incCat[mo]={}); m[k]=(m[k]||0)+a; }
  }
  return { exp, inc, incCat, byMonth };
}

function buildBalances(accounts, txns, parseNum){
  const delta={};
  const add=(id,mo,v)=>{ if(!id||!mo) return; const m=delta[id]||(delta[id]={}); m[mo]=(m[mo]||0)+v; };
  for(const t of txns){
    const mo=(t.date||'').slice(0,7); const a=parseNum(t.amount);
    if(t.type==='Income') add(t.accountId,mo,a);
    else if(t.type==='Expense') add(t.accountId,mo,-a);
    else if(t.type==='Transfer'){ add(t.accountId,mo,-a); add(t.toAccountId,mo,a); }
  }
  const series={};
  accounts.forEach(acc=>{
    const d=delta[acc.id]||{}; const keys=Object.keys(d).sort();
    let run=0; const pref=keys.map(k=>(run+=d[k]));
    series[acc.id]={ init:parseNum(acc.initialBalance), keys, pref, delta:d };
  });
  const at=(accId, mo)=>{
    const s=series[accId]; if(!s) return 0;
    let v=s.init; for(let i=0;i<s.keys.length;i++){ if(s.keys[i]<=mo) v=s.init+s.pref[i]; else break; }
    return v;
  };
  const inflow=(accId, mo)=>{ const s=series[accId]; return s ? (s.delta[mo]||0) : 0; };
  return { at, inflow };
}

/* ---------------- hook larghezza (grafici nitidi su qualsiasi schermo) ---------------- */
function useWidth(){
  const ref = React.useRef(null);
  const [w, setW] = React.useState(() => (typeof window !== 'undefined') ? Math.max(280, Math.min(640, window.innerWidth - 60)) : 640);
  React.useLayoutEffect(() => {
    const el = ref.current; if(!el) return undefined;
    const upd = () => { const cw = el.clientWidth; if(cw) setW(cw); };
    upd();
    if(typeof ResizeObserver === 'undefined'){ window.addEventListener('resize', upd); return () => window.removeEventListener('resize', upd); }
    const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---------------- piccoli componenti di interfaccia ---------------- */
function levelOf(kind, P){
  if(kind==='ok') return { color:P.green, icon:'✓', label:'In linea' };
  if(kind==='warn') return { color:P.amber, icon:'!', label:'Attenzione' };
  if(kind==='bad') return { color:P.red, icon:'✕', label:'Fuori soglia' };
  return { color:P.muted, icon:'·', label:'' };
}
// Semaforo con icona oltre al colore (leggibile anche per daltonici).
function Light({ level, P, size }){
  const l = levelOf(level, P); const s = size || 18;
  return <span title={l.label} aria-label={l.label} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:s+'px', height:s+'px', borderRadius:'50%', background:l.color, color:'#fff', fontSize:Math.round(s*0.6)+'px', fontWeight:800, flexShrink:0, lineHeight:1 }}>{l.icon}</span>;
}

function Panel({ C, title, sub, right, children, style }){
  return (
    <section style={Object.assign({ background:C.bg2, border:'1px solid '+C.b1, borderRadius:'14px', padding:'18px', minWidth:0 }, style||{})}>
      {(title || right) ? (
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom: sub ? '4px' : '14px' }}>
          {title ? <h3 style={{ margin:0, fontSize:'14.5px', fontWeight:700 }}>{title}</h3> : <span />}
          {right || null}
        </div>
      ) : null}
      {sub ? <div style={{ fontSize:'12px', color:C.t2, marginBottom:'14px', lineHeight:1.45 }}>{sub}</div> : null}
      {children}
    </section>
  );
}

function Empty({ C, text, actionLabel, onAction }){
  return (
    <div style={{ padding:'26px 12px', textAlign:'center', color:C.t2, fontSize:'13px', lineHeight:1.5 }}>
      <div>{text}</div>
      {actionLabel ? <button onClick={onAction} style={{ marginTop:'12px', padding:'8px 14px', borderRadius:'9px', border:'none', background:'#5b8def', color:'#fff', fontWeight:600, fontSize:'12.5px', cursor:'pointer' }}>{actionLabel}</button> : null}
    </div>
  );
}

function Segmented({ C, options, value, onChange }){
  return (
    <div style={{ display:'flex', gap:'2px', background:C.bg1, border:'1px solid '+C.b2, borderRadius:'9px', padding:'3px', flexWrap:'nowrap', overflowX:'auto' }}>
      {options.map(o => (
        <button key={o[0]} onClick={() => onChange(o[0])} style={{ padding:'6px 11px', border:'none', borderRadius:'7px', fontSize:'12.5px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: value===o[0] ? '#5b8def' : 'transparent', color: value===o[0] ? '#fff' : C.t1 }}>{o[1]}</button>
      ))}
    </div>
  );
}

function KpiCard({ C, P, label, value, valueColor, compare, level, onClick }){
  const l = level ? levelOf(level, P) : null;
  return (
    <button onClick={onClick} style={{ textAlign:'left', background:C.bg2, border:'1px solid '+C.b1, borderLeft:'3px solid '+(l ? l.color : C.b3), borderRadius:'12px', padding:'14px 15px', cursor: onClick ? 'pointer' : 'default', color:C.t0, minWidth:0, display:'flex', flexDirection:'column', gap:'6px' }}>
      <span style={{ fontSize:'12px', color:C.t1, fontWeight:600 }}>{label}</span>
      <span style={{ fontFamily:MONO, fontSize:'21px', fontWeight:600, color: valueColor || C.t0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{value}</span>
      <span style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11.5px', color:C.t2, lineHeight:1.35 }}>
        {level ? <Light level={level} P={P} size={15} /> : null}
        <span>{compare}</span>
      </span>
    </button>
  );
}

/* Barra orizzontale con tacca del periodo precedente (guida, Spese – grafico A). */
function HBar({ C, P, label, sub, value, prev, max, color, rightText, onClick, active }){
  const w = max > 0 ? Math.max(1.5, (value/max)*100) : 0;
  const tick = (prev != null && max > 0) ? Math.min(100, (prev/max)*100) : null;
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e)=>{ if(e.key==='Enter') onClick(); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default', padding:'6px 8px', margin:'0 -8px', borderRadius:'8px', background: active ? 'rgba(91,141,239,0.10)' : 'transparent' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:'10px', fontSize:'12.5px', marginBottom:'5px' }}>
        <span style={{ fontWeight:600, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}{sub ? <span style={{ color:C.t2, fontWeight:500 }}>{'  '}{sub}</span> : null}</span>
        <span style={{ fontFamily:MONO, color:C.t1, flexShrink:0 }}>{rightText}</span>
      </div>
      <div style={{ position:'relative', height:'10px', background:C.b1, borderRadius:'5px' }}>
        <div style={{ height:'100%', width:w+'%', background:color, borderRadius:'5px' }} />
        {tick != null ? <div title={'Periodo precedente: ' + e0(prev)} style={{ position:'absolute', top:'-3px', bottom:'-3px', left:'calc('+tick+'% - 1px)', width:'2px', background:C.t0, borderRadius:'1px' }} /> : null}
      </div>
    </div>
  );
}

function Legend({ C, items }){
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 16px', marginTop:'10px', fontSize:'11.5px', color:C.t1 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'6px' }}>
          {it.dash
            ? <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={it.color} strokeWidth="2" strokeDasharray={it.dash} /></svg>
            : <span style={{ width:'10px', height:'10px', borderRadius:'2px', background:it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------- grafici SVG ---------------- */
function CumulativeChart({ C, P, D, budget, actual, elapsed, forecastEnd, lineColor, onDay }){
  const [ref, W] = useWidth();
  const H = 220, l = 46, r = 10, t = 10, b = 24;
  const iw = Math.max(10, W - l - r), ih = H - t - b;
  const maxY = niceMax(Math.max(budget, forecastEnd || 0, ...actual.slice(0, elapsed+1), 1) * 1.05);
  const x = (d) => l + (d / D) * iw;
  const y = (v) => t + ih - (v / maxY) * ih;
  const ideal = (d) => budget * d / D;
  const pts = []; for(let d=0; d<=elapsed; d++) pts.push([x(d), y(actual[d])]);
  const actualPath = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  let over = '';
  if(elapsed > 0 && budget > 0){
    const top=[], bottom=[];
    for(let d=0; d<=elapsed; d++){ top.push([x(d), y(Math.max(actual[d], ideal(d)))]); bottom.push([x(d), y(ideal(d))]); }
    over = 'M' + top.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L') + ' L' + bottom.reverse().map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L') + ' Z';
  }
  const ticks = [0, maxY/2, maxY];
  const xl = [1, 10, 20, D];
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Spesa cumulata del mese rispetto al budget">
        {ticks.map((v,i)=>(<g key={i}><line x1={l} x2={l+iw} y1={y(v)} y2={y(v)} stroke={C.b1} /><text x={l-6} y={y(v)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(v)}</text></g>))}
        {xl.map((d,i)=>(<text key={i} x={x(d)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{d}</text>))}
        {budget > 0 ? <line x1={x(0)} y1={y(0)} x2={x(D)} y2={y(budget)} stroke={C.t2} strokeWidth="1.5" strokeDasharray="5 4" /> : null}
        {over ? <path d={over} fill={P.red} opacity="0.22" /> : null}
        {elapsed > 0 ? <path d={actualPath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {(elapsed > 0 && elapsed < D && forecastEnd != null) ? <line x1={x(elapsed)} y1={y(actual[elapsed])} x2={x(D)} y2={y(forecastEnd)} stroke={lineColor} strokeWidth="2" strokeDasharray="1.5 4" strokeLinecap="round" /> : null}
        {elapsed > 0 ? <circle cx={x(elapsed)} cy={y(actual[elapsed])} r="4" fill={lineColor} stroke={C.bg2} strokeWidth="2" /> : null}
        {Array.from({ length:D }, (_, i) => i+1).map(d => (
          <rect key={d} x={x(d-1)} y={t} width={Math.max(1, iw/D)} height={ih} fill="transparent" style={{ cursor: d<=elapsed ? 'pointer' : 'default' }} onClick={() => { if(d<=elapsed) onDay(d); }}>
            <title>{'Giorno ' + d + (d<=elapsed ? ' · speso ' + e0(actual[d]) : '') + (budget>0 ? ' · ideale ' + e0(ideal(d)) : '')}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

function StackedMonthly({ C, labels, series, line, lineLabel, onMonth }){
  const [ref, W] = useWidth();
  const H = 220, l = 42, r = 8, t = 10, b = 24;
  const n = labels.length; const iw = Math.max(10, W-l-r), ih = H-t-b;
  const totals = labels.map((_,i)=>sum(series.map(s=>s.values[i])));
  const maxY = niceMax(Math.max(1, ...totals, ...(line||[0])) * 1.05);
  const slot = iw / n; const bw = Math.min(28, slot*0.62);
  const y = (v) => t + ih - (v/maxY)*ih;
  const cx = (i) => l + slot*i + slot/2;
  const linePath = line ? line.map((v,i)=>(i?'L':'M')+cx(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ') : '';
  const every = n > 8 && W < 520 ? 2 : 1;
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Composizione mensile della spesa">
        {[0, maxY/2, maxY].map((v,i)=>(<g key={i}><line x1={l} x2={l+iw} y1={y(v)} y2={y(v)} stroke={C.b1} /><text x={l-6} y={y(v)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(v)}</text></g>))}
        {labels.map((lb,i)=>{
          let acc = 0;
          return (
            <g key={i} style={{ cursor:'pointer' }} onClick={() => onMonth(i)}>
              <rect x={l+slot*i} y={t} width={slot} height={ih} fill="transparent" />
              {series.map((s,si)=>{ const v=s.values[i]; const y1=y(acc+v), y0=y(acc); acc+=v; return v>0 ? <rect key={si} x={cx(i)-bw/2} y={y1} width={bw} height={Math.max(0.5,y0-y1)} fill={s.color} /> : null; })}
              {(i % every === 0) ? <text x={cx(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{lb}</text> : null}
              <title>{lb + ' · ' + series.map(s=>s.label+' '+e0(s.values[i])).join(' · ') + (line ? ' · ' + lineLabel + ' ' + e0(line[i]) : '')}</title>
            </g>
          );
        })}
        {line ? <path d={linePath} fill="none" stroke={C.t0} strokeWidth="2" strokeLinejoin="round" /> : null}
        {line ? line.map((v,i)=>(<circle key={i} cx={cx(i)} cy={y(v)} r="3" fill={C.t0} />)) : null}
      </svg>
    </div>
  );
}

function LineTrend({ C, labels, values, color, extra }){
  const [ref, W] = useWidth();
  const H = 170, l = 42, r = 10, t = 10, b = 24;
  const n = labels.length; const iw = Math.max(10, W-l-r), ih = H-t-b;
  const all = values.concat((extra||[]).filter(v=>v!=null));
  const maxY = niceMax(Math.max(1, ...all) * 1.08);
  const x = (i) => l + (n>1 ? (i/(n-1))*iw : iw/2);
  const y = (v) => t + ih - (v/maxY)*ih;
  const path = (vals) => { let d=''; let started=false; vals.forEach((v,i)=>{ if(v==null){ started=false; return; } d += (started?'L':'M') + x(i).toFixed(1)+' '+y(v).toFixed(1)+' '; started=true; }); return d; };
  const every = n > 8 && W < 520 ? 2 : 1;
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Andamento della categoria">
        {[0, maxY/2, maxY].map((v,i)=>(<g key={i}><line x1={l} x2={l+iw} y1={y(v)} y2={y(v)} stroke={C.b1} /><text x={l-6} y={y(v)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(v)}</text></g>))}
        {labels.map((lb,i)=> (i % every === 0) ? <text key={i} x={x(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{lb}</text> : null)}
        {extra ? <path d={path(extra)} fill="none" stroke={C.t1} strokeWidth="1.6" strokeDasharray="5 4" /> : null}
        <path d={path(values)} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
        {values.map((v,i)=>(<circle key={i} cx={x(i)} cy={y(v)} r="3" fill={color}><title>{labels[i] + ': ' + e0(v)}</title></circle>))}
      </svg>
    </div>
  );
}

/* Entrate (blu) e spese (arancio); area verde dove entrate > spese, rossa al contrario. */
function IncomeExpenseChart({ C, P, labels, income, expense, onMonth }){
  const [ref, W] = useWidth();
  const H = 220, l = 42, r = 10, t = 10, b = 24;
  const n = labels.length; const iw = Math.max(10, W-l-r), ih = H-t-b;
  const maxY = niceMax(Math.max(1, ...income, ...expense) * 1.05);
  const x = (i) => l + (n>1 ? (i/(n-1))*iw : iw/2);
  const y = (v) => t + ih - (v/maxY)*ih;
  const polys = [];
  for(let i=0;i<n-1;i++){
    const d0 = income[i]-expense[i], d1 = income[i+1]-expense[i+1];
    if((d0>=0) === (d1>=0)){
      polys.push({ pos: d0+d1>=0, pts:[[x(i),y(income[i])],[x(i+1),y(income[i+1])],[x(i+1),y(expense[i+1])],[x(i),y(expense[i])]] });
    } else {
      const f = d0/(d0-d1); const xm = x(i) + f*(x(i+1)-x(i)); const vm = income[i] + f*(income[i+1]-income[i]);
      polys.push({ pos: d0>=0, pts:[[x(i),y(income[i])],[xm,y(vm)],[x(i),y(expense[i])]] });
      polys.push({ pos: d1>=0, pts:[[xm,y(vm)],[x(i+1),y(income[i+1])],[x(i+1),y(expense[i+1])]] });
    }
  }
  const path = (vals) => vals.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const every = n > 8 && W < 520 ? 2 : 1;
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Entrate e spese negli ultimi mesi">
        {[0, maxY/2, maxY].map((v,i)=>(<g key={i}><line x1={l} x2={l+iw} y1={y(v)} y2={y(v)} stroke={C.b1} /><text x={l-6} y={y(v)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(v)}</text></g>))}
        {polys.map((p,i)=>(<polygon key={i} points={p.pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')} fill={p.pos ? P.green : P.red} opacity="0.2" />))}
        <path d={path(expense)} fill="none" stroke="#e08a4b" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={path(income)} fill="none" stroke="#5b8def" strokeWidth="2.2" strokeLinejoin="round" />
        {labels.map((lb,i)=>(
          <g key={i} style={{ cursor:'pointer' }} onClick={()=>onMonth(i)}>
            <rect x={x(i)-iw/(2*Math.max(1,n-1))} y={t} width={iw/Math.max(1,n-1)} height={ih} fill="transparent" />
            {(i % every === 0) ? <text x={x(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{lb}</text> : null}
            <title>{lb + ' · entrate ' + e0(income[i]) + ' · spese ' + e0(expense[i])}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Barre del risparmio mensile + linea del tasso % (asse destro) e media mobile 3 mesi. */
function SavingsBars({ C, P, labels, savings, rates, onMonth }){
  const [ref, W] = useWidth();
  const H = 190, l = 42, r = 38, t = 10, b = 24;
  const n = labels.length; const iw = Math.max(10, W-l-r), ih = H-t-b;
  const maxAbs = niceMax(Math.max(1, ...savings.map(Math.abs)));
  const hasNeg = savings.some(v=>v<0);
  const lo = hasNeg ? -maxAbs : 0, hi = maxAbs;
  const y = (v) => t + ih - ((v-lo)/(hi-lo))*ih;
  const rv = rates.filter(v=>v!=null);
  const rLo = Math.min(0, ...rv, 0), rHi = Math.max(10, ...rv);
  const rMin = Math.floor(rLo/10)*10, rMax = Math.ceil(rHi/10)*10;
  const yr = (v) => t + ih - ((v-rMin)/((rMax-rMin)||1))*ih;
  const slot = iw/n; const bw = Math.min(24, slot*0.55); const cx = (i) => l + slot*i + slot/2;
  const lp = (vals) => { let d=''; let s=false; vals.forEach((v,i)=>{ if(v==null){ s=false; return; } d+=(s?'L':'M')+cx(i).toFixed(1)+' '+yr(v).toFixed(1)+' '; s=true; }); return d; };
  const avg = ma3(rates.map(v=>v==null?0:v));
  const every = n > 8 && W < 520 ? 2 : 1;
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Risparmio mensile e tasso di risparmio">
        <line x1={l} x2={l+iw} y1={y(0)} y2={y(0)} stroke={C.b3} />
        <text x={l-6} y={y(hi)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(hi)}</text>
        <text x={l-6} y={y(0)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>0</text>
        {hasNeg ? <text x={l-6} y={y(lo)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(lo)}</text> : null}
        <text x={l+iw+6} y={yr(rMax)+4} fontSize="10.5" fill={C.t2}>{rMax}%</text>
        <text x={l+iw+6} y={yr(rMin)+4} fontSize="10.5" fill={C.t2}>{rMin}%</text>
        {savings.map((v,i)=>{ const y1 = v>=0 ? y(v) : y(0); const h = Math.max(1, Math.abs(y(v)-y(0))); return (
          <g key={i} style={{ cursor:'pointer' }} onClick={()=>onMonth(i)}>
            <rect x={l+slot*i} y={t} width={slot} height={ih} fill="transparent" />
            <rect x={cx(i)-bw/2} y={y1} width={bw} height={h} fill={v>=0 ? P.green : P.red} opacity="0.75" rx="2" />
            {(i % every === 0) ? <text x={cx(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{labels[i]}</text> : null}
            <title>{labels[i] + ' · risparmio ' + e0(v) + (rates[i]!=null ? ' · tasso ' + Math.round(rates[i]) + '%' : '')}</title>
          </g>
        ); })}
        <path d={lp(avg)} fill="none" stroke={C.t1} strokeWidth="1.6" strokeDasharray="5 4" />
        <path d={lp(rates)} fill="none" stroke="#8b7cf6" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function NetWorthArea({ C, P, labels, stacks, debts, net, onMonth }){
  const [ref, W] = useWidth();
  const H = 240, l = 46, r = 10, t = 10, b = 24;
  const n = labels.length; const iw = Math.max(10, W-l-r), ih = H-t-b;
  const posTot = labels.map((_,i)=>sum(stacks.map(s=>s.values[i])));
  const hi = niceMax(Math.max(1, ...posTot, ...net) * 1.05);
  const minNeg = Math.min(0, ...debts, ...net);
  const lo = minNeg < 0 ? -niceMax(-minNeg * 1.05) : 0;
  const x = (i) => l + (n>1 ? (i/(n-1))*iw : iw/2);
  const y = (v) => t + ih - ((v-lo)/(hi-lo))*ih;
  const area = (top, bottom) => 'M' + top.map((v,i)=>x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' L') + ' L' + bottom.map((v,i)=>[x(i),v]).reverse().map(p=>p[0].toFixed(1)+' '+y(p[1]).toFixed(1)).join(' L') + ' Z';
  let base = labels.map(()=>0);
  const layers = stacks.map(s => { const top = base.map((v,i)=>v+s.values[i]); const d = area(top, base); base = top; return { d, color:s.color, label:s.label }; });
  const every = n > 8 && W < 520 ? 2 : 1;
  const grid = lo < 0 ? [lo, 0, hi] : [0, hi/2, hi];
  return (
    <div ref={ref} style={{ width:'100%' }}>
      <svg width={W} height={H} style={{ display:'block' }} role="img" aria-label="Patrimonio: attività, debiti e netto">
        {grid.map((v,i)=>(<g key={i}><line x1={l} x2={l+iw} y1={y(v)} y2={y(v)} stroke={v===0?C.b3:C.b1} /><text x={l-6} y={y(v)+4} textAnchor="end" fontSize="10.5" fill={C.t2}>{fmtK(v)}</text></g>))}
        {layers.map((ly,i)=>(<path key={i} d={ly.d} fill={ly.color} opacity="0.55" />))}
        {lo < 0 ? <path d={area(debts, labels.map(()=>0))} fill={P.red} opacity="0.45" /> : null}
        <path d={net.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ')} fill="none" stroke={C.t0} strokeWidth="3" strokeLinejoin="round" />
        {labels.map((lb,i)=>(
          <g key={i} style={{ cursor:'pointer' }} onClick={()=>onMonth(i)}>
            <rect x={x(i)-iw/(2*Math.max(1,n-1))} y={t} width={iw/Math.max(1,n-1)} height={ih} fill="transparent" />
            {(i % every === 0) ? <text x={x(i)} y={H-6} textAnchor="middle" fontSize="10.5" fill={C.t2}>{lb}</text> : null}
            <title>{lb + ' · netto ' + e0(net[i])}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Waterfall orizzontale: dal budget al forecast, una barra per scostamento. */
function Waterfall({ C, P, start, end, steps, startLabel, endLabel }){
  let cum = start; const rows = [{ label:startLabel, from:0, to:start, kind:'total' }];
  steps.forEach(s => { rows.push({ label:s.label, from:cum, to:cum+s.value, kind: s.value>0 ? 'up' : 'down', value:s.value }); cum += s.value; });
  rows.push({ label:endLabel, from:0, to:end, kind:'total' });
  const lo = Math.min(0, ...rows.map(r=>Math.min(r.from,r.to)));
  const hi = Math.max(1, ...rows.map(r=>Math.max(r.from,r.to)));
  const pos = (v) => ((v-lo)/(hi-lo))*100;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
      {rows.map((r,i)=>{
        const a = pos(Math.min(r.from,r.to)), w = Math.max(0.8, pos(Math.max(r.from,r.to)) - a);
        const color = r.kind==='total' ? C.t2 : (r.kind==='up' ? P.red : P.green);
        return (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'minmax(90px,34%) 1fr auto', alignItems:'center', gap:'10px', fontSize:'12px' }}>
            <span style={{ fontWeight: r.kind==='total' ? 700 : 500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</span>
            <div style={{ position:'relative', height:'14px' }}>
              <div style={{ position:'absolute', left:a+'%', width:w+'%', top:0, bottom:0, background:color, borderRadius:'3px', opacity: r.kind==='total' ? 0.6 : 0.9 }} />
            </div>
            <span style={{ fontFamily:MONO, color: r.kind==='total' ? C.t0 : color, minWidth:'64px', textAlign:'right' }}>{r.kind==='total' ? e0(r.to) : signed(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================ */

export default function Dashboard({ app }){
  const st = app.state;
  const C = app.getPalette(st.theme);
  const isLight = st.theme === 'light';
  const P = isLight
    ? { text:C.t0, muted:C.t1, dim:C.t2, accent:'#3d6fd6', green:'#0b7d45', red:'#d93025', amber:'#a35200' }
    : { text:C.t0, muted:C.t1, dim:C.t2, accent:'#5b8def', green:'#3ecf8e', red:'#f0616d', amber:'#e2b341' };
  const isMobile = st.isMobile;
  const dash = st.dash;
  const pn = (v) => app.parseNum(v);
  const mask = (s) => app.mask(s);
  const today = app.today();
  const cur = today.slice(0,7);
  const month = dash.month || cur;
  const tab = DASH_TABS.some(x=>x[0]===dash.tab) ? dash.tab : 'overview';
  const setDash = (patch) => app.setState({ dash: Object.assign({}, app.state.dash, patch) });
  const abbr = (mo) => app.monthAbbr(mo);
  const [showAllCats, setShowAllCats] = React.useState(false);
  const [plan, setPlan] = React.useState(null);
  const [editTargets, setEditTargets] = React.useState(false);
  const touchX = React.useRef(null);

  /* ---- impostazioni (target risparmio e regola 50/30/20, salvati nel record Settings) ---- */
  const settings = (app.store && app.store.get('Settings','settings')) || {};
  const savingsTarget = settings.savingsTarget != null ? pn(settings.savingsTarget) : 20;
  const rule = Object.assign({ needs:50, wants:30, savings:20 }, settings.rule || {});
  const saveSettings = (patch) => {
    const s = app.store; if(!s) return;
    if(s.get('Settings','settings')) s.update('Settings','settings',patch); else s.create('Settings', Object.assign({ id:'settings' }, patch));
    app.forceUpdate();
  };

  /* ---- macro-gruppi ---- */
  const groupMacro = {}; let unclassified = 0;
  st.groups.forEach(g => { const mk = g.macro || (g.fixed ? 'fisse' : ''); if(!mk) unclassified++; groupMacro[g.name] = mk || 'essenziali'; });
  const catById = {}; st.categories.forEach(c => { catById[c.id] = c; });
  const macroOf = (cid) => { const c = catById[cid]; if(!c) return 'essenziali'; return groupMacro[c.group||''] || 'essenziali'; };
  const expenseCats = st.categories.filter(c => c.type==='Expense');
  const spendCats = expenseCats.filter(c => macroOf(c.id) !== 'risparmio');
  const catName = (cid) => cid==='__none__' ? 'Senza categoria' : ((catById[cid]||{}).name || 'Senza categoria');

  /* ---- indici (calcolati una volta per cambio dati, non a ogni render) ---- */
  const idx = React.useMemo(() => buildIndex(st.transactions, pn), [st.transactions]); // eslint-disable-line react-hooks/exhaustive-deps
  const idxA = React.useMemo(() => dash.accountId ? buildIndex(st.transactions.filter(t => t.accountId===dash.accountId || t.toAccountId===dash.accountId), pn) : idx, [idx, st.transactions, dash.accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const bal = React.useMemo(() => buildBalances(st.accounts, st.transactions, pn), [st.accounts, st.transactions]); // eslint-disable-line react-hooks/exhaustive-deps
  const bud = React.useMemo(() => { const m={}; st.budgets.forEach(b => { if(!b.month) return; (m[b.month]||(m[b.month]={}))[b.categoryId] = pn(b.assigned); }); return m; }, [st.budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const spentCat = (ix, mo, cid) => ((ix.exp[mo]||{})[cid]) || 0;
  const budCat = (mo, cid) => ((bud[mo]||{})[cid]) || 0;
  const elapsedOf = (mo) => mo < cur ? daysIn(mo) : (mo === cur ? parseInt(today.slice(8,10),10) : 0);
  const spentFor = (ix, mo, cats) => sum(cats.map(c => spentCat(ix, mo, c.id)));
  const catsOfMacro = (keys) => expenseCats.filter(c => keys.indexOf(macroOf(c.id)) > -1);

  /* ---- forecast per categoria (guida, pagina 3) ---- */
  const avg3 = (cid, mo) => (spentCat(idx, addM(mo,-1), cid) + spentCat(idx, addM(mo,-2), cid) + spentCat(idx, addM(mo,-3), cid)) / 3;
  const forecastCat = (cid, mo) => {
    const spent = spentCat(idx, mo, cid); const budget = budCat(mo, cid);
    if(mo < cur) return spent;
    if(mo > cur) return Math.max(spent, budget);
    const D = daysIn(mo), d = elapsedOf(mo);
    // Le spese fisse non si proiettano in modo lineare: si somma solo quanto resta da pagare.
    if(macroOf(cid) === 'fisse') return spent + Math.max(0, budget - spent);
    const linear = d > 0 ? spent + (spent / d) * (D - d) : spent;
    // Nei primi 5 giorni il ritmo lineare è poco affidabile: media dei 3 mesi precedenti.
    if(d <= 5){ const a = avg3(cid, mo); return a > 0 ? Math.max(spent, a) : Math.max(spent, linear); }
    return linear;
  };
  const budgetRows = (mo) => spendCats.map(c => {
    const budget = budCat(mo, c.id), spent = spentCat(idx, mo, c.id);
    if(budget < 0.005 && spent < 0.005) return null;
    const forecast = forecastCat(c.id, mo);
    const dev = forecast - budget;
    const ratio = budget > 0 ? forecast / budget : (forecast > 0 ? Infinity : 0);
    const level = ratio < 0.9 ? 'ok' : (ratio <= 1 ? 'warn' : 'bad');
    const devPct = budget > 0 ? (dev / budget) * 100 : null;
    const significant = Math.abs(dev) > 20 && (devPct == null || Math.abs(devPct) > 10);
    return { id:c.id, name:c.name, group:c.group||'', macro:macroOf(c.id), budget, spent, forecast, dev, devPct, ratio, level, significant, consumed: budget>0 ? (spent/budget)*100 : null };
  }).filter(Boolean).sort((a,b) => b.dev - a.dev);

  /* ---- "Disponibile del mese" a un certo giorno (guida, card KPI 1) ---- */
  const fixedCats = catsOfMacro(['fisse']);
  const savingCats = catsOfMacro(['risparmio']);
  const availableAt = (mo, day) => {
    const D = daysIn(mo); const list = (idx.byMonth[mo]||[]).filter(t => parseInt((t.date||'').slice(8,10),10) <= day);
    let income = 0; const spentBy = {};
    list.forEach(t => { const a = pn(t.amount); if(t.type==='Income') income += a; else if(t.type==='Expense'){ const k=t.categoryId||'__none__'; spentBy[k]=(spentBy[k]||0)+a; } });
    const spent = sum(spendCats.map(c => spentBy[c.id]||0)) + (spentBy.__none__||0);
    const fixedResidual = day < D ? sum(fixedCats.map(c => Math.max(0, budCat(mo,c.id) - (spentBy[c.id]||0)))) : 0;
    const savingsPlanned = sum(savingCats.map(c => budCat(mo, c.id)));
    return { value: income - spent - fixedResidual - savingsPlanned, income, spent, fixedResidual, savingsPlanned };
  };

  const netWorthAt = (mo) => sum(st.accounts.map(a => bal.at(a.id, mo)));
  const liquidAt = (mo) => sum(st.accounts.filter(a => a.onBudget!==false && LIQUID_TYPES[a.type]).map(a => bal.at(a.id, mo)));
  const drill = (from, to, extra) => app.setState({ view:'transactions', drawerOpen:false, txnLimit:150, filters: Object.assign({ from, to, accountId: dash.accountId||'', categoryId:'', type:'', search:'' }, extra||{}) });
  const drillMonth = (mo, extra) => drill(mo+'-01', app.lastDayOf(mo), extra);

  /* ---- periodo per Spese / Entrate ---- */
  const periodKey = dash.period || '1';
  const periodMonths = (() => {
    if(periodKey === 'ytd'){ const a=[]; let m=month.slice(0,4)+'-01'; while(m<=month){ a.push(m); m=addM(m,1); } return a; }
    return monthsBack(month, parseInt(periodKey,10) || 1);
  })();
  const prevPeriodMonths = periodKey === 'ytd' ? periodMonths.map(m => addM(m,-12)) : periodMonths.map(m => addM(m, -periodMonths.length));
  const periodLabel = periodMonths.length > 1 ? abbr(periodMonths[0]) + ' – ' + abbr(periodMonths[periodMonths.length-1]) : app.monthLabel(month);
  const prevLabel = periodKey === 'ytd' ? 'stesso periodo ' + (parseInt(month.slice(0,4),10)-1) : (periodMonths.length > 1 ? 'periodo precedente' : abbr(addM(month,-1)));

  /* ============================== intestazione ============================== */
  const onTouchStart = (e) => { touchX.current = e.touches && e.touches[0] ? e.touches[0].clientX : null; };
  const onTouchEnd = (e) => { if(touchX.current == null) return; const dx = (e.changedTouches[0].clientX - touchX.current); touchX.current = null; if(Math.abs(dx) > 50) setDash({ month: addM(month, dx < 0 ? 1 : -1) }); };
  const monthBtn = { width:'32px', height:'32px', borderRadius:'8px', border:'1px solid '+C.b2, background:C.bg1, color:C.t0, cursor:'pointer', fontSize:'16px', lineHeight:1 };
  const selectStyle = { padding:'7px 10px', background:C.bg1, border:'1px solid '+C.b2, borderRadius:'9px', color:C.t0, fontSize:'13px', fontWeight:500, maxWidth:'100%' };
  const usesPeriod = tab === 'spese' || tab === 'entrate';

  const header = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', marginBottom:'18px' }}>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <button aria-label="Mese precedente" style={monthBtn} onClick={() => setDash({ month: addM(month,-1) })}>‹</button>
        <div style={{ minWidth:'128px', textAlign:'center', fontWeight:700, fontSize:'15px' }}>{app.monthLabel(month)}</div>
        <button aria-label="Mese successivo" style={monthBtn} onClick={() => setDash({ month: addM(month,1) })}>›</button>
        {month !== cur ? <button onClick={() => setDash({ month: cur })} style={{ marginLeft:'4px', padding:'6px 10px', borderRadius:'8px', border:'none', background:'transparent', color:P.accent, fontWeight:600, fontSize:'12.5px', cursor:'pointer' }}>Oggi</button> : null}
      </div>
      {usesPeriod ? (
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
          <Segmented C={C} value={periodKey} onChange={(v)=>setDash({ period:v })} options={[['1','Mese'],['3','3 mesi'],['12','12 mesi'],['ytd','Anno']]} />
          <select value={dash.accountId||''} onChange={(e)=>setDash({ accountId:e.target.value })} style={selectStyle}>
            <option value="">Tutti i conti</option>
            {st.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {tab === 'spese' ? (
            <select value={dash.macro||''} onChange={(e)=>setDash({ macro:e.target.value, spendCat:'' })} style={selectStyle}>
              <option value="">Tutte le spese</option>
              {MACROS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const unclassifiedNote = (unclassified > 0 && (tab==='overview' || tab==='spese' || tab==='entrate' || tab==='budgetvs')) ? (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', padding:'10px 14px', marginBottom:'16px', borderRadius:'10px', background: isLight ? '#fbf1e1' : 'rgba(226,179,65,0.10)', border:'1px solid '+(isLight ? '#ecd3a8' : 'rgba(226,179,65,0.25)'), fontSize:'12.5px', color:C.t0 }}>
      <span>{unclassified === 1 ? '1 gruppo non ha' : unclassified + ' gruppi non hanno'} un macro-gruppo: per ora {unclassified === 1 ? 'conta' : 'contano'} come «Variabili essenziali». Assegnalo dalla modifica del gruppo.</span>
      <button onClick={() => app.go('categories')} style={{ padding:'6px 11px', borderRadius:'8px', border:'1px solid '+C.b3, background:C.bg2, color:C.t0, fontWeight:600, fontSize:'12px', cursor:'pointer' }}>Apri categorie</button>
    </div>
  ) : null;

  const tabsMobile = isMobile ? (
    <div style={{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'12px', marginBottom:'6px' }}>
      {DASH_TABS.map(x => (
        <button key={x[0]} onClick={() => setDash({ tab:x[0] })} style={{ padding:'8px 14px', borderRadius:'999px', border:'1px solid '+(tab===x[0]?'#5b8def':C.b2), background: tab===x[0]?'#5b8def':C.bg1, color: tab===x[0]?'#fff':C.t1, fontSize:'12.5px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>{x[1]}</button>
      ))}
    </div>
  ) : null;

  const grid2 = { display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap:'16px' };
  const kpiGrid = { display:'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fit, minmax(170px, 1fr))', gap:'12px', marginBottom:'16px' };

  /* ============================== 1. PANORAMICA ============================== */
  const renderOverview = () => {
    const D = daysIn(month), d = elapsedOf(month);
    const mode = dash.chartMode === 'variable' ? 'variable' : 'all';
    const prev = addM(month, -1);
    // KPI 1 – Disponibile del mese, confronto con lo stesso giorno del mese scorso
    const avNow = availableAt(month, d);
    const avPrev = availableAt(prev, Math.min(d || daysIn(prev), daysIn(prev)));
    // KPI 2 – Budget consumato vs % di mese trascorso
    const budTot = sum(spendCats.map(c => budCat(month, c.id)));
    const spentTot = spentFor(idx, month, spendCats) + spentCat(idx, month, '__none__');
    const consumed = budTot > 0 ? (spentTot / budTot) * 100 : null;
    const timePct = (d / D) * 100;
    const consumedLevel = consumed == null ? null : (consumed <= timePct ? 'ok' : (consumed <= timePct + 10 ? 'warn' : 'bad'));
    // KPI 3 – Tasso di risparmio vs obiettivo e media 3 mesi
    const incomeM = idx.inc[month] || 0;
    const rate = incomeM > 0 ? ((incomeM - spentTot) / incomeM) * 100 : null;
    const prev3 = [1,2,3].map(k => addM(month,-k));
    const inc3 = sum(prev3.map(m => idx.inc[m]||0)), sp3 = sum(prev3.map(m => spentFor(idx, m, spendCats)));
    const rate3 = inc3 > 0 ? ((inc3 - sp3) / inc3) * 100 : null;
    const rateLevel = rate == null ? null : (rate >= savingsTarget ? 'ok' : (rate >= 10 ? 'warn' : 'bad'));
    // KPI 4 – Patrimonio netto vs fine mese precedente
    const nw = netWorthAt(month), nwPrev = netWorthAt(prev); const nwDelta = nw - nwPrev;
    const nwPct = Math.abs(nwPrev) > 0.5 ? (nwDelta / Math.abs(nwPrev)) * 100 : null;
    // KPI 5 – Fondo emergenza in mesi di spese essenziali
    const essCats = catsOfMacro(['fisse','essenziali']);
    const essAvg = sum(prev3.map(m => spentFor(idx, m, essCats))) / 3;
    const liquid = liquidAt(month);
    const efMonths = essAvg > 0 ? liquid / essAvg : null;
    const efLevel = efMonths == null ? null : (efMonths < 3 ? 'bad' : (efMonths <= 6 ? 'warn' : 'ok'));

    const kpis = [
      { label:'Disponibile del mese', value: e0(avNow.value), valueColor: avNow.value < 0 ? P.red : C.t0, level: avNow.value < 0 ? 'bad' : null,
        compare: (month === cur ? 'Allo stesso giorno di ' : 'A fine ') + abbr(prev) + ': ' + e0(avPrev.value), onClick: () => setDash({ tab:'budgetvs' }) },
      { label:'Budget consumato', value: consumed == null ? '—' : pctTxt(consumed), level: consumedLevel,
        compare: consumed == null ? 'Nessun budget per questo mese' : 'Mese trascorso: ' + pctTxt(timePct), onClick: () => setDash({ tab:'budgetvs' }) },
      { label:'Tasso di risparmio', value: pctTxt(rate), level: rateLevel,
        compare: 'Obiettivo ' + Math.round(savingsTarget) + '% · media 3 mesi ' + pctTxt(rate3), onClick: () => setDash({ tab:'entrate', period:'12' }) },
      { label:'Patrimonio netto', value: mask(e0(nw)),
        compare: (nwDelta >= 0 ? '▲ ' : '▼ ') + mask(signed(nwDelta)) + (nwPct != null ? ' (' + signedPct(nwPct) + ')' : '') + ' su ' + abbr(prev), onClick: () => setDash({ tab:'patrimonio' }) },
      { label:'Fondo emergenza', value: efMonths == null ? '—' : (efMonths.toFixed(1).replace('.',',') + ' mesi'), level: efLevel,
        compare: efMonths == null ? 'Servono 3 mesi di spese essenziali' : 'Obiettivo 3–6 mesi di spese essenziali', onClick: () => setDash({ tab:'patrimonio' }) },
    ];

    // Grafico spesa cumulata vs budget
    const chartCats = mode === 'variable' ? catsOfMacro(VARIABLE_MACROS) : spendCats;
    const chartSet = {}; chartCats.forEach(c => { chartSet[c.id] = 1; }); if(mode==='all') chartSet.__none__ = 1;
    const daily = new Array(D+1).fill(0);
    (idx.byMonth[month]||[]).forEach(t => { if(t.type==='Expense' && chartSet[t.categoryId||'__none__']){ const dd = parseInt((t.date||'').slice(8,10),10); if(dd>=1 && dd<=D) daily[dd] += pn(t.amount); } });
    const cumul = daily.reduce((acc,v,i) => { acc.push((i ? acc[i-1] : 0) + v); return acc; }, []);
    const chartBudget = sum(chartCats.map(c => budCat(month, c.id)));
    const chartForecast = sum(chartCats.map(c => forecastCat(c.id, month))) + (mode==='all' ? spentCat(idx, month, '__none__') : 0);
    const idealNow = chartBudget * d / D;
    const ratioNow = idealNow > 0 ? cumul[d] / idealNow : 0;
    const lineLevel = ratioNow <= 1 ? 'ok' : (ratioNow <= 1.1 ? 'warn' : 'bad');
    const lineColor = levelOf(lineLevel, P).color;

    const worst = budgetRows(month).filter(r => r.budget > 0).slice(0, 5);
    const maxWorst = Math.max(1, ...worst.map(r => Math.max(r.budget, r.forecast)));
    const latest = st.transactions.slice().sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5);
    const accName = (id) => ((st.accounts.find(a => a.id===id))||{}).name || '—';

    return (
      <React.Fragment>
        <div style={{ fontSize:'12.5px', color:C.t1, marginBottom:'10px' }}>Liquidità sui conti di budget: <b style={{ fontFamily:MONO, color:C.t0 }}>{mask(e0(liquid))}</b></div>
        <div style={kpiGrid}>{kpis.map((k,i) => <KpiCard key={i} C={C} P={P} {...k} />)}</div>
        <Panel C={C} title="Spesa cumulata vs budget" style={{ marginBottom:'16px' }}
          sub={chartBudget > 0 ? ('Budget ' + e0(chartBudget) + ' · speso ' + e0(cumul[d]) + (month===cur ? ' · previsione a fine mese ' + e0(chartForecast) : '')) : 'Assegna un budget alle categorie per vedere la traiettoria ideale.'}
          right={<Segmented C={C} value={mode} onChange={(v)=>setDash({ chartMode:v })} options={[['all','Tutte'],['variable','Solo variabili']]} />}>
          {month > cur ? <Empty C={C} text="Questo mese non è ancora iniziato." /> : (
            <React.Fragment>
              <CumulativeChart C={C} P={P} D={D} budget={chartBudget} actual={cumul} elapsed={d} forecastEnd={month===cur ? chartForecast : null} lineColor={lineColor}
                onDay={(day) => { const iso = month + '-' + String(day).padStart(2,'0'); drill(iso, iso, { type:'Expense' }); }} />
              <Legend C={C} items={[{ color:C.t2, label:'Budget ideale', dash:'5 4' }, { color:lineColor, label:'Spesa reale' }, { color:lineColor, label:'Proiezione', dash:'1.5 4' }, { color:P.red, label:'Sopra il ritmo ideale' }]} />
            </React.Fragment>
          )}
        </Panel>
        <div style={grid2}>
          <Panel C={C} title="Categorie da tenere d'occhio" sub="Le 5 con lo scostamento previsto peggiore rispetto al budget." right={<button onClick={() => setDash({ tab:'budgetvs' })} style={{ border:'none', background:'transparent', color:P.accent, fontWeight:600, fontSize:'12.5px', cursor:'pointer', whiteSpace:'nowrap' }}>Vedi tutte</button>}>
            {worst.length === 0 ? <Empty C={C} text="Nessun budget assegnato per questo mese." actionLabel="Aggiungi il tuo primo budget" onAction={() => app.go('budget')} /> :
              <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {worst.map(r => (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <Light level={r.level} P={P} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <HBar C={C} P={P} label={r.name} value={r.spent} prev={r.budget} max={maxWorst} color={levelOf(r.level,P).color}
                        rightText={e0(r.spent) + ' / ' + e0(r.budget)} onClick={() => drillMonth(month, { categoryId:r.id, type:'Expense' })} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:'11px', color:C.t2, marginTop:'4px' }}>La tacca indica il budget della categoria.</div>
              </div>}
          </Panel>
          <Panel C={C} title="Ultimi movimenti" right={<button onClick={() => app.go('transactions')} style={{ border:'none', background:'transparent', color:P.accent, fontWeight:600, fontSize:'12.5px', cursor:'pointer', whiteSpace:'nowrap' }}>Vedi tutti</button>}>
            {latest.length === 0 ? <Empty C={C} text="Non hai ancora registrato movimenti." actionLabel="Aggiungi un movimento" onAction={() => app.newTransaction()} /> :
              <div style={{ display:'flex', flexDirection:'column' }}>
                {latest.map(t => {
                  const isInc = t.type==='Income', isTr = t.type==='Transfer';
                  return (
                    <button key={t.id} onClick={() => app.editTransaction(t)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'9px 0', border:'none', borderBottom:'1px solid '+C.b1, background:'transparent', color:C.t0, cursor:'pointer', textAlign:'left' }}>
                      <span style={{ minWidth:0 }}>
                        <span style={{ display:'block', fontSize:'13px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description}</span>
                        <span style={{ display:'block', fontSize:'11.5px', color:C.t2 }}>{app.fmtDate(t.date)} · {isTr ? 'Trasferimento' : catName(t.categoryId||'__none__')} · {accName(t.accountId)}</span>
                      </span>
                      <span style={{ fontFamily:MONO, fontSize:'13px', fontWeight:600, color: isInc ? P.green : (isTr ? C.t1 : C.t0), flexShrink:0 }}>{(isInc ? '+' : (isTr ? '' : '−')) + app.fmtEur(pn(t.amount))}</span>
                    </button>
                  );
                })}
              </div>}
          </Panel>
        </div>
      </React.Fragment>
    );
  };

  /* ============================== 2. SPESE ============================== */
  const renderSpese = () => {
    const macroF = dash.macro || '';
    const cats = macroF ? catsOfMacro([macroF]) : spendCats;
    const catSet = {}; cats.forEach(c => { catSet[c.id] = 1; }); if(!macroF) catSet.__none__ = 1;
    const totals = (months) => { const m = {}; months.forEach(mo => { Object.keys(idxA.exp[mo]||{}).forEach(k => { if(catSet[k]) m[k] = (m[k]||0) + idxA.exp[mo][k]; }); }); return m; };
    const curT = totals(periodMonths), prevT = totals(prevPeriodMonths);
    const total = sum(Object.values(curT)), prevTotal = sum(Object.values(prevT));
    const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
    const periodTxns = []; periodMonths.forEach(mo => (idxA.byMonth[mo]||[]).forEach(t => { if(t.type==='Expense' && catSet[t.categoryId||'__none__']) periodTxns.push(t); }));
    const elapsedDays = sum(periodMonths.map(elapsedOf));
    const daily = elapsedDays > 0 ? total / elapsedDays : 0;

    let rows = Object.keys(curT).map(k => ({ id:k, name:catName(k), value:curT[k], prev:prevT[k]||0 })).sort((a,b) => b.value - a.value);
    let collapsed = false;
    if(rows.length > 8 && !showAllCats){
      const rest = rows.slice(7);
      rows = rows.slice(0,7).concat([{ id:'__other__', name:'Altro (' + rest.length + ')', value:sum(rest.map(r=>r.value)), prev:sum(rest.map(r=>r.prev)) }]);
      collapsed = true;
    }
    const maxV = Math.max(1, ...rows.map(r => Math.max(r.value, r.prev)));

    // Grafico C: trend di una categoria (si apre dal drill-down)
    const selCat = dash.spendCat && catById[dash.spendCat] ? dash.spendCat : '';
    const m12 = monthsBack(month, 12);
    let catTrend = null;
    if(selCat){
      const vals = m12.map(mo => spentCat(idxA, mo, selCat));
      const tx = periodTxns.filter(t => t.categoryId === selCat);
      catTrend = { vals, avg: ma3(vals), count: tx.length, ticket: tx.length ? sum(tx.map(t=>pn(t.amount))) / tx.length : 0 };
    }

    // Grafico B: composizione mensile per macro-gruppo + linea entrate
    const stackSeries = SPEND_MACROS.map(k => ({ key:k, label:MACRO_BY_KEY[k].short, color:MACRO_BY_KEY[k].color, values: m12.map(mo => spentFor(idxA, mo, catsOfMacro([k]))) }));
    const incomeLine = m12.map(mo => idxA.inc[mo]||0);

    const top = periodTxns.slice().sort((a,b) => pn(b.amount) - pn(a.amount)).slice(0,10);
    const fromMo = periodMonths[0], toMo = periodMonths[periodMonths.length-1];

    return (
      <React.Fragment>
        <div style={kpiGrid}>
          <KpiCard C={C} P={P} label={'Speso · ' + periodLabel} value={e0(total)} compare={(change == null ? 'Nessun dato nel ' : signedPct(change) + ' rispetto al ') + prevLabel} level={change == null ? null : (change <= 0 ? 'ok' : (change <= 10 ? 'warn' : 'bad'))} />
          <KpiCard C={C} P={P} label="Spesa media giornaliera" value={app.fmtEur(daily)} compare={elapsedDays + ' giorni considerati'} />
          <KpiCard C={C} P={P} label="Movimenti di spesa" value={String(periodTxns.length)} compare={'Scontrino medio ' + app.fmtEur(periodTxns.length ? total / periodTxns.length : 0)} />
        </div>
        <div style={grid2}>
          <Panel C={C} title="Spesa per categoria" sub="Tocca una categoria per vederne l'andamento. La tacca indica il periodo precedente.">
            {rows.length === 0 ? <Empty C={C} text="Nessuna spesa in questo periodo." actionLabel="Importa movimenti" onAction={() => app.openImport()} /> :
              <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                {rows.map((r,i) => (
                  <HBar key={r.id} C={C} P={P} label={r.name} value={r.value} prev={r.prev} max={maxV} color={r.id==='__other__' ? C.t3 : PALETTE[i % PALETTE.length]}
                    rightText={e0(r.value) + ' · ' + pctTxt(total > 0 ? (r.value/total)*100 : 0)} active={selCat === r.id}
                    onClick={r.id==='__other__' ? () => setShowAllCats(true) : (r.id==='__none__' ? () => drill(fromMo+'-01', app.lastDayOf(toMo), { type:'Expense' }) : () => setDash({ spendCat: selCat===r.id ? '' : r.id }))} />
                ))}
                {(!collapsed && showAllCats && rows.length > 8) ? <button onClick={() => setShowAllCats(false)} style={{ alignSelf:'flex-start', marginTop:'6px', border:'none', background:'transparent', color:P.accent, fontWeight:600, fontSize:'12px', cursor:'pointer', padding:0 }}>Raggruppa le minori in «Altro»</button> : null}
              </div>}
          </Panel>
          {catTrend ? (
            <Panel C={C} title={catName(selCat) + ' negli ultimi 12 mesi'} sub={'Movimenti nel periodo: ' + catTrend.count + ' · scontrino medio ' + app.fmtEur(catTrend.ticket)}
              right={<button onClick={() => setDash({ spendCat:'' })} aria-label="Chiudi" style={{ border:'none', background:'transparent', color:C.t1, fontSize:'18px', cursor:'pointer', lineHeight:1 }}>×</button>}>
              <LineTrend C={C} labels={m12.map(abbr)} values={catTrend.vals} extra={catTrend.avg} color="#5b8def" />
              <Legend C={C} items={[{ color:'#5b8def', label:'Spesa mensile' }, { color:C.t1, label:'Media mobile 3 mesi', dash:'5 4' }]} />
              <button onClick={() => drill(fromMo+'-01', app.lastDayOf(toMo), { categoryId:selCat, type:'Expense' })} style={{ marginTop:'12px', padding:'8px 13px', borderRadius:'9px', border:'1px solid '+C.b3, background:C.bg1, color:C.t0, fontWeight:600, fontSize:'12.5px', cursor:'pointer' }}>Apri i movimenti del periodo</button>
            </Panel>
          ) : (
            <Panel C={C} title="Composizione mensile" sub="Ultimi 12 mesi per macro-gruppo; la linea sono le entrate. Tocca un mese per aprirne i movimenti.">
              <StackedMonthly C={C} labels={m12.map(abbr)} series={stackSeries} line={incomeLine} lineLabel="entrate" onMonth={(i) => drillMonth(m12[i])} />
              <Legend C={C} items={stackSeries.map(s => ({ color:s.color, label:s.label })).concat([{ color:C.t0, label:'Entrate' }])} />
            </Panel>
          )}
        </div>
        {catTrend ? (
          <Panel C={C} title="Composizione mensile" sub="Ultimi 12 mesi per macro-gruppo; la linea sono le entrate." style={{ marginTop:'16px' }}>
            <StackedMonthly C={C} labels={m12.map(abbr)} series={stackSeries} line={incomeLine} lineLabel="entrate" onMonth={(i) => drillMonth(m12[i])} />
            <Legend C={C} items={stackSeries.map(s => ({ color:s.color, label:s.label })).concat([{ color:C.t0, label:'Entrate' }])} />
          </Panel>
        ) : null}
        <Panel C={C} title="Le 10 spese più alte del periodo" style={{ marginTop:'16px' }}>
          {top.length === 0 ? <Empty C={C} text="Nessuna spesa in questo periodo." /> :
            <div style={{ display:'flex', flexDirection:'column' }}>
              {top.map(t => (
                <button key={t.id} onClick={() => app.editTransaction(t)} style={{ display:'grid', gridTemplateColumns:'64px 1fr auto', alignItems:'center', gap:'10px', padding:'8px 0', border:'none', borderBottom:'1px solid '+C.b1, background:'transparent', color:C.t0, cursor:'pointer', textAlign:'left', fontSize:'13px' }}>
                  <span style={{ color:C.t2, fontSize:'12px' }}>{app.fmtDate(t.date)}</span>
                  <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><b style={{ fontWeight:600 }}>{t.description}</b> <span style={{ color:C.t2 }}>· {catName(t.categoryId||'__none__')}</span></span>
                  <span style={{ fontFamily:MONO, fontWeight:600 }}>{app.fmtEur(pn(t.amount))}</span>
                </button>
              ))}
            </div>}
        </Panel>
      </React.Fragment>
    );
  };

  /* ============================== 3. BUDGET VS CONSUNTIVO ============================== */
  const renderBudgetVs = () => {
    const rows = budgetRows(month);
    const budTot = sum(rows.map(r => r.budget)), spentTot = sum(rows.map(r => r.spent)), fcTot = sum(rows.map(r => r.forecast));
    const devTot = fcTot - budTot; const devTotPct = budTot > 0 ? (devTot / budTot) * 100 : null;
    const totLevel = budTot <= 0 ? null : (fcTot / budTot < 0.9 ? 'ok' : (fcTot <= budTot ? 'warn' : 'bad'));
    const d = elapsedOf(month);
    const earlyNote = month === cur && d <= 5 ? 'Nei primi giorni del mese la previsione delle spese variabili usa la media dei 3 mesi precedenti.' : '';
    const sig = rows.filter(r => r.significant).sort((a,b) => Math.abs(b.dev) - Math.abs(a.dev));
    const steps = sig.slice(0,6).map(r => ({ label:r.name, value:r.dev }));
    const restDev = devTot - sum(steps.map(s => s.value));
    if(Math.abs(restDev) > 0.5) steps.push({ label:'Altre categorie', value:restDev });
    const barMax = Math.max(1, ...rows.map(r => Math.max(r.budget, r.forecast)));
    const next = addM(month, 1);

    const openPlan = () => {
      const lines = expenseCats.filter(c => !c.hidden).map(c => {
        const mk = macroOf(c.id);
        let proposal;
        if(mk === 'fisse' || mk === 'risparmio') proposal = budCat(month, c.id);
        else proposal = (forecastCat(c.id, month) + spentCat(idx, addM(month,-1), c.id) + spentCat(idx, addM(month,-2), c.id)) / 3;
        proposal = Math.round(proposal);
        return { id:c.id, name:c.name, macro:mk, current:budCat(next, c.id), proposal, value: String(proposal) };
      });
      setPlan({ month: next, lines });
    };
    const confirmPlan = () => {
      if(!plan || !app.store) return;
      const entries = plan.lines.map(l => [l.id, Math.max(0, pn(l.value))]);
      if(app.store.upsertBudgets) app.store.upsertBudgets(plan.month, entries);
      else entries.forEach(e => app.store.upsertBudget(plan.month, e[0], e[1]));
      app.refresh(); setPlan(null);
    };

    const th = { textAlign:'right', padding:'8px 8px', fontSize:'11.5px', color:C.t2, fontWeight:600, whiteSpace:'nowrap', borderBottom:'1px solid '+C.b2 };
    const td = { textAlign:'right', padding:'9px 8px', fontFamily:MONO, fontSize:'12.5px', whiteSpace:'nowrap', borderBottom:'1px solid '+C.b1 };

    return (
      <React.Fragment>
        <div style={kpiGrid}>
          <KpiCard C={C} P={P} label="Budget totale" value={e0(budTot)} compare={'Spese pianificate di ' + abbr(month)} />
          <KpiCard C={C} P={P} label="Consuntivo a oggi" value={e0(spentTot)} compare={budTot > 0 ? pctTxt((spentTot/budTot)*100) + ' del budget' : 'Nessun budget'} />
          <KpiCard C={C} P={P} label="Previsione a fine mese" value={e0(fcTot)} level={totLevel} compare={month < cur ? 'Mese chiuso: coincide col consuntivo' : 'Fisse residue + ritmo delle variabili'} />
          <KpiCard C={C} P={P} label="Scostamento previsto" value={signed(devTot)} valueColor={devTot > 0.5 ? P.red : (devTot < -0.5 ? P.green : C.t0)} level={totLevel} compare={devTotPct == null ? '—' : signedPct(devTotPct) + ' rispetto al budget'} />
        </div>
        {earlyNote ? <div style={{ fontSize:'12px', color:C.t1, marginBottom:'12px' }}>{earlyNote}</div> : null}
        {rows.length === 0 ? <Panel C={C}><Empty C={C} text={'Nessun budget assegnato per ' + app.monthLabel(month) + '.'} actionLabel="Aggiungi il tuo primo budget" onAction={() => app.go('budget')} /></Panel> : (
          <React.Fragment>
            <Panel C={C} title="Scostamenti per categoria" sub="Semaforo su previsione ÷ budget: sotto 90% in linea, 90–100% attenzione, oltre 100% fuori. In evidenza solo gli scostamenti oltre ±10% e 20 €." style={{ marginBottom:'16px' }}>
              <div style={{ overflowX:'auto', margin:'0 -4px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth: isMobile ? '560px' : 0 }}>
                  <thead><tr>
                    <th style={Object.assign({}, th, { textAlign:'left' })}>Categoria</th>
                    <th style={th}>Budget</th><th style={th}>Consuntivo</th><th style={th}>% usato</th><th style={th}>Previsione</th><th style={th}>Scostamento</th><th style={Object.assign({}, th, { textAlign:'center' })}> </th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} onClick={() => drillMonth(month, { categoryId:r.id, type:'Expense' })} style={{ cursor:'pointer', opacity: r.significant ? 1 : 0.62 }}>
                        <td style={Object.assign({}, td, { textAlign:'left', fontFamily:'inherit', fontSize:'13px', fontWeight: r.significant ? 700 : 500, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis' })}>{r.name}</td>
                        <td style={td}>{e0(r.budget)}</td>
                        <td style={td}>{e0(r.spent)}</td>
                        <td style={td}>{pctTxt(r.consumed)}</td>
                        <td style={td}>{e0(r.forecast)}</td>
                        <td style={Object.assign({}, td, { color: r.significant ? (r.dev > 0 ? P.red : P.green) : C.t1, fontWeight: r.significant ? 700 : 500 })}>{signed(r.dev)}</td>
                        <td style={Object.assign({}, td, { textAlign:'center' })}><Light level={r.level} P={P} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div style={grid2}>
              <Panel C={C} title="Budget e consuntivo" sub="Barra grigia: budget. Barra colorata: speso; la parte chiara è quanto si prevede di spendere fino a fine mese.">
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {rows.slice().sort((a,b) => b.budget - a.budget).slice(0,10).map(r => {
                    const col = levelOf(r.level, P).color;
                    return (
                      <div key={r.id}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12.5px', marginBottom:'4px', gap:'8px' }}>
                          <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
                          <span style={{ fontFamily:MONO, color:C.t1, flexShrink:0 }}>{e0(r.spent)} / {e0(r.budget)}</span>
                        </div>
                        <div style={{ height:'6px', width:(r.budget/barMax*100)+'%', background:C.b3, borderRadius:'3px', marginBottom:'3px' }} />
                        <div style={{ position:'relative', height:'8px' }}>
                          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:(r.forecast/barMax*100)+'%', background:col, opacity:0.3, borderRadius:'3px' }} />
                          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:(r.spent/barMax*100)+'%', background:col, borderRadius:'3px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <Panel C={C} title="Da dove viene lo scostamento" sub="Dal budget totale alla previsione: rosso = sforamento, verde = risparmio.">
                <Waterfall C={C} P={P} start={budTot} end={fcTot} steps={steps} startLabel="Budget" endLabel="Previsione" />
              </Panel>
            </div>
          </React.Fragment>
        )}
        <Panel C={C} title={'Pianifica ' + app.monthLabel(next)} style={{ marginTop:'16px' }}
          sub="Proposta: media degli ultimi 3 consuntivi per le spese variabili, importi attuali per fisse e risparmio. Gli avanzi delle categorie si riportano già al mese successivo.">
          {!plan || plan.month !== next ? (
            <button onClick={openPlan} style={{ padding:'9px 15px', borderRadius:'9px', border:'none', background:'#5b8def', color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>Pianifica il mese successivo</button>
          ) : (
            <React.Fragment>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth: isMobile ? '420px' : 0 }}>
                  <thead><tr>
                    <th style={Object.assign({}, th, { textAlign:'left' })}>Categoria</th><th style={th}>Già assegnato</th><th style={th}>Proposta</th><th style={th}>Nuovo budget</th>
                  </tr></thead>
                  <tbody>
                    {plan.lines.map((l, i) => (
                      <tr key={l.id}>
                        <td style={Object.assign({}, td, { textAlign:'left', fontFamily:'inherit', fontSize:'13px' })}>{l.name} <span style={{ color:C.t2, fontSize:'11.5px' }}>{MACRO_BY_KEY[l.macro].short}</span></td>
                        <td style={td}>{l.current ? e0(l.current) : '—'}</td>
                        <td style={td}>{e0(l.proposal)}</td>
                        <td style={Object.assign({}, td, { padding:'5px 8px' })}>
                          <input inputMode="decimal" value={l.value} aria-label={'Nuovo budget ' + l.name}
                            onChange={(e) => { const lines = plan.lines.slice(); lines[i] = Object.assign({}, l, { value:e.target.value }); setPlan(Object.assign({}, plan, { lines })); }}
                            style={{ width:'92px', textAlign:'right', padding:'6px 8px', background:C.bg0, border:'1px solid '+C.b2, borderRadius:'7px', fontFamily:MONO, fontSize:'12.5px' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:'10px', marginTop:'14px', flexWrap:'wrap', alignItems:'center' }}>
                <button onClick={confirmPlan} style={{ padding:'9px 15px', borderRadius:'9px', border:'none', background:'#5b8def', color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>Conferma il budget di {app.monthLabel(next)}</button>
                <button onClick={() => setPlan(null)} style={{ padding:'9px 15px', borderRadius:'9px', border:'1px solid '+C.b3, background:'transparent', color:C.t0, fontWeight:600, fontSize:'13px', cursor:'pointer' }}>Annulla</button>
                <span style={{ fontSize:'12px', color:C.t2 }}>Totale: <b style={{ fontFamily:MONO, color:C.t0 }}>{e0(sum(plan.lines.map(l => Math.max(0, pn(l.value)))))}</b></span>
              </div>
            </React.Fragment>
          )}
        </Panel>
      </React.Fragment>
    );
  };

  /* ============================== 4. ENTRATE E RISPARMIO ============================== */
  const renderEntrate = () => {
    const incOf = (months) => sum(months.map(mo => idxA.inc[mo]||0));
    const spOf = (months, cats) => sum(months.map(mo => spentFor(idxA, mo, cats || spendCats)));
    const I = incOf(periodMonths), S = spOf(periodMonths), Sv = I - S;
    const rate = I > 0 ? (Sv / I) * 100 : null;
    const Ip = incOf(prevPeriodMonths), Sp = spOf(prevPeriodMonths); const rateP = Ip > 0 ? ((Ip - Sp) / Ip) * 100 : null;
    const m12 = monthsBack(month, 12);
    const I12 = incOf(m12), S12 = spOf(m12); const rate12 = I12 > 0 ? ((I12 - S12) / I12) * 100 : null;
    const rateLevel = (r) => r == null ? null : (r >= savingsTarget ? 'ok' : (r >= 10 ? 'warn' : 'bad'));
    const incSeries = m12.map(mo => idxA.inc[mo]||0);
    const expSeries = m12.map(mo => spentFor(idxA, mo, spendCats));
    const savSeries = m12.map((_,i) => incSeries[i] - expSeries[i]);
    const rateSeries = m12.map((_,i) => incSeries[i] > 0 ? (savSeries[i] / incSeries[i]) * 100 : null);
    const hasData = I12 > 0 || S12 > 0;

    // 50/30/20 sul periodo scelto
    const needs = spOf(periodMonths, catsOfMacro(['fisse','essenziali']));
    const wants = spOf(periodMonths, catsOfMacro(['discrezionali']));
    const saved = I - needs - wants;
    const pN = I > 0 ? needs / I * 100 : 0, pW = I > 0 ? wants / I * 100 : 0, pS = I > 0 ? Math.max(0, saved / I * 100) : 0;
    const scale = Math.max(100, pN + pW + pS);
    const segs = [
      { label:'Necessità', pct:pN, target:rule.needs, color:'#5b8def', amt:needs },
      { label:'Desideri', pct:pW, target:rule.wants, color:'#c98bd0', amt:wants },
      { label:'Risparmio', pct:pS, target:rule.savings, color:'#3ecf8e', amt:Math.max(0, saved) },
    ];

    // Entrate per fonte
    const srcCur = {}, srcPrev = {};
    periodMonths.forEach(mo => Object.keys(idxA.incCat[mo]||{}).forEach(k => { srcCur[k] = (srcCur[k]||0) + idxA.incCat[mo][k]; }));
    prevPeriodMonths.forEach(mo => Object.keys(idxA.incCat[mo]||{}).forEach(k => { srcPrev[k] = (srcPrev[k]||0) + idxA.incCat[mo][k]; }));
    const src = Object.keys(srcCur).map(k => ({ id:k, name:catName(k), value:srcCur[k], prev:srcPrev[k]||0 })).sort((a,b) => b.value - a.value);
    const srcMax = Math.max(1, ...src.map(s => Math.max(s.value, s.prev)));
    const aom = app.ageOfMoney(periodMonths, dash.accountId || '');

    const numInput = (val, onChange, label) => (
      <input inputMode="decimal" defaultValue={String(val)} aria-label={label} onBlur={(e) => onChange(Math.max(0, Math.min(100, pn(e.target.value))))}
        style={{ width:'56px', padding:'5px 7px', textAlign:'right', background:C.bg0, border:'1px solid '+C.b2, borderRadius:'7px', fontFamily:MONO, fontSize:'12.5px' }} />
    );

    return (
      <React.Fragment>
        <div style={kpiGrid}>
          <KpiCard C={C} P={P} label={'Entrate · ' + periodLabel} value={e0(I)} compare={'Prima: ' + e0(Ip) + ' (' + prevLabel + ')'} />
          <KpiCard C={C} P={P} label="Risparmiato" value={e0(Sv)} valueColor={Sv < 0 ? P.red : C.t0} compare={'Prima: ' + e0(Ip - Sp)} />
          <KpiCard C={C} P={P} label="Tasso di risparmio" value={pctTxt(rate)} level={rateLevel(rate)} compare={'Obiettivo ' + Math.round(savingsTarget) + '% · prima ' + pctTxt(rateP)} />
          <KpiCard C={C} P={P} label="Media ultimi 12 mesi" value={pctTxt(rate12)} level={rateLevel(rate12)} compare={'Età del denaro: ' + (aom == null ? '—' : aom + ' giorni')} />
        </div>
        {!hasData ? <Panel C={C}><Empty C={C} text="Registra entrate e spese per vedere quanto riesci a mettere da parte." actionLabel="Aggiungi un movimento" onAction={() => app.newTransaction()} /></Panel> : (
          <React.Fragment>
            <div style={grid2}>
              <Panel C={C} title="Entrate e spese, ultimi 12 mesi" sub="Area verde quando le entrate superano le spese, rossa al contrario. Tocca un mese per i movimenti.">
                <IncomeExpenseChart C={C} P={P} labels={m12.map(abbr)} income={incSeries} expense={expSeries} onMonth={(i) => drillMonth(m12[i])} />
                <Legend C={C} items={[{ color:'#5b8def', label:'Entrate' }, { color:'#e08a4b', label:'Spese' }]} />
              </Panel>
              <Panel C={C} title="Risparmio mensile" sub="Barre: euro risparmiati. Linea viola: tasso di risparmio (asse destro); tratteggio: media mobile 3 mesi.">
                <SavingsBars C={C} P={P} labels={m12.map(abbr)} savings={savSeries} rates={rateSeries} onMonth={(i) => drillMonth(m12[i])} />
                <Legend C={C} items={[{ color:P.green, label:'Risparmio' }, { color:'#8b7cf6', label:'Tasso %' }, { color:C.t1, label:'Media 3 mesi', dash:'5 4' }]} />
              </Panel>
            </div>
            <div style={Object.assign({}, grid2, { marginTop:'16px' })}>
              <Panel C={C} title={'Regola ' + rule.needs + '/' + rule.wants + '/' + rule.savings}
                sub={'Come si dividono le entrate di ' + periodLabel + ': necessità (fisse + essenziali), desideri (discrezionali), risparmio (quanto resta).'}
                right={<button onClick={() => setEditTargets(!editTargets)} style={{ border:'none', background:'transparent', color:P.accent, fontWeight:600, fontSize:'12.5px', cursor:'pointer', whiteSpace:'nowrap' }}>{editTargets ? 'Fatto' : 'Modifica target'}</button>}>
                {I <= 0 ? <Empty C={C} text="Nessuna entrata nel periodo." /> : (
                  <React.Fragment>
                    <div style={{ position:'relative', height:'26px', display:'flex', borderRadius:'7px', overflow:'hidden', background:C.b1 }}>
                      {segs.map((s,i) => <div key={i} title={s.label + ' ' + pctTxt(s.pct)} style={{ width:(s.pct/scale*100)+'%', background:s.color }} />)}
                      {[rule.needs, rule.needs + rule.wants].map((v,i) => <div key={i} style={{ position:'absolute', top:'-2px', bottom:'-2px', left:'calc(' + (v/scale*100) + '% - 1px)', width:'2px', background:C.t0 }} />)}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'14px' }}>
                      {segs.map((s,i) => {
                        const lv = i === 2 ? (s.pct >= s.target ? 'ok' : (s.pct >= s.target/2 ? 'warn' : 'bad')) : (s.pct <= s.target ? 'ok' : (s.pct <= s.target + 10 ? 'warn' : 'bad'));
                        return (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'12.5px' }}>
                            <span style={{ width:'10px', height:'10px', borderRadius:'2px', background:s.color, flexShrink:0 }} />
                            <span style={{ flex:1, fontWeight:600 }}>{s.label}</span>
                            <span style={{ fontFamily:MONO, color:C.t1 }}>{e0(s.amt)}</span>
                            <span style={{ fontFamily:MONO, minWidth:'78px', textAlign:'right' }}>{pctTxt(s.pct)} <span style={{ color:C.t2 }}>/ {s.target}%</span></span>
                            <Light level={lv} P={P} size={16} />
                          </div>
                        );
                      })}
                    </div>
                    {saved < 0 ? <div style={{ marginTop:'10px', fontSize:'12px', color:P.red }}>Nel periodo hai speso {e0(-saved)} più delle entrate.</div> : null}
                  </React.Fragment>
                )}
                {editTargets ? (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'10px 16px', marginTop:'14px', paddingTop:'12px', borderTop:'1px solid '+C.b1, fontSize:'12.5px', color:C.t1, alignItems:'center' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:'6px' }}>Necessità {numInput(rule.needs, (v) => saveSettings({ rule:Object.assign({}, rule, { needs:v }) }), 'Target necessità')}%</label>
                    <label style={{ display:'flex', alignItems:'center', gap:'6px' }}>Desideri {numInput(rule.wants, (v) => saveSettings({ rule:Object.assign({}, rule, { wants:v }) }), 'Target desideri')}%</label>
                    <label style={{ display:'flex', alignItems:'center', gap:'6px' }}>Risparmio {numInput(rule.savings, (v) => saveSettings({ rule:Object.assign({}, rule, { savings:v }) }), 'Target risparmio')}%</label>
                    <label style={{ display:'flex', alignItems:'center', gap:'6px' }}>Obiettivo tasso di risparmio {numInput(savingsTarget, (v) => saveSettings({ savingsTarget:v }), 'Obiettivo tasso di risparmio')}%</label>
                  </div>
                ) : null}
              </Panel>
              <Panel C={C} title="Entrate per fonte" sub={'Categorie di entrata nel periodo; la tacca indica il ' + prevLabel + '.'}>
                {src.length === 0 ? <Empty C={C} text="Nessuna entrata nel periodo." /> :
                  <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                    {src.map((s,i) => <HBar key={s.id} C={C} P={P} label={s.name} value={s.value} prev={s.prev} max={srcMax} color={PALETTE[i % PALETTE.length]}
                      rightText={e0(s.value) + ' · ' + pctTxt(I > 0 ? s.value/I*100 : 0)}
                      onClick={s.id==='__none__' ? undefined : () => drill(periodMonths[0]+'-01', app.lastDayOf(periodMonths[periodMonths.length-1]), { categoryId:s.id, type:'Income' })} />)}
                  </div>}
              </Panel>
            </div>
          </React.Fragment>
        )}
      </React.Fragment>
    );
  };

  /* ============================== 5. PATRIMONIO ============================== */
  const renderPatrimonio = () => {
    const m12 = monthsBack(month, 12);
    const classOf = (a) => ACC_CLASS[a.type] || 'altro';
    const stacks = ACC_CLASSES.map(cl => ({ label:cl.label, color:cl.color, values: m12.map(mo => sum(st.accounts.filter(a => classOf(a)===cl.key).map(a => Math.max(0, bal.at(a.id, mo))))) }));
    const debts = m12.map(mo => sum(st.accounts.map(a => Math.min(0, bal.at(a.id, mo)))));
    const net = m12.map(mo => netWorthAt(mo));
    const nw = net[net.length-1], nwPrev = netWorthAt(addM(month,-1)), nw12 = netWorthAt(addM(month,-12));
    const dM = nw - nwPrev, d12 = nw - nw12;
    const pctOf = (d, base) => Math.abs(base) > 0.5 ? (d / Math.abs(base)) * 100 : null;
    const prev3 = [0,1,2].map(k => addM(month,-k));
    const loanAccs = st.accounts.filter(a => a.type==='Loan' || bal.at(a.id, month) < -0.5);
    const avgInflow = (a) => Math.max(0, sum(prev3.map(mo => bal.inflow(a.id, mo))) / 3);
    const payments = sum(loanAccs.map(avgInflow));
    const inc3 = sum(prev3.map(mo => idx.inc[mo]||0)) / 3;
    const dti = (loanAccs.length && inc3 > 0) ? (payments / inc3) * 100 : null;
    const dtiLevel = dti == null ? null : (dti < 30 ? 'ok' : (dti <= 35 ? 'warn' : 'bad'));
    const hasAccounts = st.accounts.length > 0;

    return (
      <React.Fragment>
        <div style={kpiGrid}>
          <KpiCard C={C} P={P} label="Patrimonio netto" value={mask(e0(nw))} compare={'Fine ' + abbr(month)} />
          <KpiCard C={C} P={P} label="Variazione del mese" value={mask(signed(dM))} valueColor={dM >= 0 ? P.green : P.red} compare={(dM >= 0 ? '▲ ' : '▼ ') + signedPct(pctOf(dM, nwPrev)) + ' su ' + abbr(addM(month,-1))} />
          <KpiCard C={C} P={P} label="Variazione 12 mesi" value={mask(signed(d12))} valueColor={d12 >= 0 ? P.green : P.red} compare={(d12 >= 0 ? '▲ ' : '▼ ') + signedPct(pctOf(d12, nw12)) + ' su ' + abbr(addM(month,-12))} />
          <KpiCard C={C} P={P} label="Rate / reddito" value={dti == null ? '—' : pctTxt(dti)} level={dtiLevel} compare={loanAccs.length ? 'Rate medie ' + e0(payments) + '/mese · soglia 30%' : 'Nessun prestito registrato'} />
        </div>
        {!hasAccounts ? <Panel C={C}><Empty C={C} text="Aggiungi i tuoi conti per seguire il patrimonio nel tempo." actionLabel="Aggiungi un conto" onAction={() => app.newAccount()} /></Panel> : (
          <React.Fragment>
            <Panel C={C} title="Composizione nel tempo" sub="Attività impilate sopra lo zero, debiti sotto; la linea spessa è il patrimonio netto a fine mese." style={{ marginBottom:'16px' }}>
              <NetWorthArea C={C} P={P} labels={m12.map(abbr)} stacks={stacks} debts={debts} net={net} onMonth={(i) => setDash({ month:m12[i] })} />
              <Legend C={C} items={ACC_CLASSES.map(c => ({ color:c.color, label:c.label })).concat([{ color:P.red, label:'Debiti' }, { color:C.t0, label:'Patrimonio netto' }])} />
            </Panel>
            <div style={grid2}>
              <Panel C={C} title="Conti" sub={'Saldi a fine ' + abbr(month) + ' e variazione sul mese precedente.'}>
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {ACC_CLASSES.concat([{ key:'debt', label:'Prestiti e mutui', color:P.red }]).map(cl => {
                    const accs = st.accounts.filter(a => classOf(a)===cl.key); if(!accs.length) return null;
                    return (
                      <div key={cl.key} style={{ marginBottom:'10px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'12px', color:C.t1, fontWeight:700, padding:'4px 0' }}><span style={{ width:'9px', height:'9px', borderRadius:'2px', background:cl.color }} />{cl.label}</div>
                        {accs.map(a => { const b = bal.at(a.id, month), dd = b - bal.at(a.id, addM(month,-1)); return (
                          <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'7px 0', borderBottom:'1px solid '+C.b1, fontSize:'13px' }}>
                            <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name} <span style={{ color:C.t2, fontSize:'11.5px' }}>{a.bank && a.bank!=='—' && a.bank!==a.name ? a.bank : ''}</span></span>
                            <span style={{ display:'flex', gap:'10px', alignItems:'baseline', flexShrink:0 }}>
                              <span style={{ fontFamily:MONO, fontSize:'11.5px', color: Math.abs(dd) < 0.5 ? C.t2 : (dd > 0 ? P.green : P.red) }}>{Math.abs(dd) < 0.5 ? '' : mask(signed(dd))}</span>
                              <span style={{ fontFamily:MONO, fontWeight:600, color: b < 0 ? P.red : C.t0 }}>{mask(e0(b))}</span>
                            </span>
                          </div>
                        ); })}
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <Panel C={C} title="Debiti" sub="Rata media degli ultimi 3 mesi = trasferimenti in entrata sul conto del prestito.">
                {loanAccs.length === 0 ? <Empty C={C} text="Nessun debito. Per seguire un prestito, crea un conto di tipo «Prestito / mutuo» con saldo iniziale negativo e registra le rate come trasferimenti verso quel conto." /> :
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    {loanAccs.map(a => {
                      const residual = Math.max(0, -bal.at(a.id, month));
                      const initial = Math.max(0, -pn(a.initialBalance));
                      const repaid = initial > 0 ? Math.max(0, Math.min(100, (1 - residual/initial) * 100)) : null;
                      const pay = avgInflow(a);
                      const left = pay > 0 ? Math.ceil(residual / pay) : null;
                      const leftFaster = pay > 0 ? Math.ceil(residual / (pay + 100)) : Math.ceil(residual / 100);
                      return (
                        <div key={a.id} style={{ paddingBottom:'12px', borderBottom:'1px solid '+C.b1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', gap:'10px', fontSize:'13px', marginBottom:'6px' }}>
                            <b>{a.name}</b><span style={{ fontFamily:MONO, fontWeight:600, color:P.red }}>{mask(e0(residual))}</span>
                          </div>
                          {repaid != null ? (
                            <div style={{ marginBottom:'6px' }}>
                              <div style={{ height:'8px', background:C.b1, borderRadius:'4px' }}><div style={{ height:'100%', width:repaid+'%', background:P.green, borderRadius:'4px' }} /></div>
                              <div style={{ fontSize:'11.5px', color:C.t2, marginTop:'4px' }}>{pctTxt(repaid)} rimborsato</div>
                            </div>
                          ) : null}
                          <div style={{ fontSize:'12px', color:C.t1, lineHeight:1.55 }}>
                            {pay > 0 ? <span>Rata media {e0(pay)}/mese · estinzione stimata {app.monthLabel(addM(month, left))}</span> : <span>Nessuna rata registrata negli ultimi 3 mesi.</span>}
                            {residual > 0 ? <span style={{ display:'block' }}>Con +100 €/mese: {pay > 0 ? ('finisci ' + Math.max(0, left - leftFaster) + ' mesi prima') : ('estinto in ' + leftFaster + ' mesi')}.</span> : null}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize:'11px', color:C.t2 }}>Il calcolo degli interessi risparmiati richiede il tasso del finanziamento, che non è ancora tra i dati del conto.</div>
                  </div>}
              </Panel>
            </div>
          </React.Fragment>
        )}
      </React.Fragment>
    );
  };

  const body = tab === 'spese' ? renderSpese() : tab === 'budgetvs' ? renderBudgetVs() : tab === 'entrate' ? renderEntrate() : tab === 'patrimonio' ? renderPatrimonio() : renderOverview();
  return (
    <div style={{ maxWidth:'1080px', margin:'0 auto' }}>
      {tabsMobile}
      {header}
      {unclassifiedNote}
      {body}
    </div>
  );
}
