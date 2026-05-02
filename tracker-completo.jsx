import { useState, useEffect } from "react";

// ── PRESETS DE SISTEMA ────────────────────────────────────
const SYSTEMS = {
  "25k": {
    label: "$25K",
    START: 25000,
    DD: 1000,
    TRADE_RISK: 500,
    TRADE_CROSS: 500,
    FUNDED: 26500,
    ENCUBADORA: 26000,
    EMPUJE_LO: 25500,
    EMPUJE_HI: 25750,
    REZAGADA: 24500,
    BURN: 24000,
    // Funded phase
    FUNDED_START: 25000,
    FUNDED_TRADE: 1000,
    FUNDED_DD: 1000,
    FUNDED_BURN: 24000,
    ORDENO_THRESHOLD: 26000,
    defaultCost: 65,
    costPresets: [50, 65, 70, 79, 84, 100],
  },
  "50k": {
    label: "$50K",
    START: 50000,
    DD: 2000,
    TRADE_RISK: 1000,
    TRADE_CROSS: 1000,
    FUNDED: 53000,
    ENCUBADORA: 52000,
    EMPUJE_LO: 51000,
    EMPUJE_HI: 51500,
    REZAGADA: 49000,
    BURN: 48000,
    // Funded phase
    FUNDED_START: 50000,
    FUNDED_TRADE: 2000,
    FUNDED_DD: 2000,
    FUNDED_BURN: 48000,
    ORDENO_THRESHOLD: 52000,
    defaultCost: 99,
    costPresets: [84, 98, 99, 149, 200, 500],
  },
};

const $f = n => `$${Number(n).toLocaleString()}`;

// ── ROLES POR SALDO (usa sys param) ───────────────────────
function getRole(acc, sys) {
  const b = acc.balance;
  if (b <= sys.BURN || b <= acc.floor)        return "burned";
  if (b >= sys.FUNDED)                        return "funded";
  if (b >= sys.ENCUBADORA)                    return "encubadora";
  if (b >= sys.EMPUJE_LO)                     return "empuje";
  if (b > sys.REZAGADA && b < sys.EMPUJE_LO)  return "base";
  if (b === sys.REZAGADA)                     return "rezagada";
  return "riesgo";
}

const ROLES = {
  burned:     {color:"#FF1744", label:"QUEMADA",     emoji:"🔥"},
  riesgo:     {color:"#FF6D00", label:"RIESGO",      emoji:"🔴"},
  rezagada:   {color:"#FF8A65", label:"REZAGADA",    emoji:"🟠"},
  base:       {color:"#90A4AE", label:"BASE",        emoji:"⚪"},
  empuje:     {color:"#FFD600", label:"EMPUJE",      emoji:"🟡"},
  encubadora: {color:"#00E5FF", label:"ENCUBADORA",  emoji:"🧊"},
  funded:     {color:"#00E676", label:"FUNDED",      emoji:"🏆"},
};

// ── CUENTA ────────────────────────────────────────────────
function mkAcc(id, sys) {
  return { id, balance: sys.START, maxReached: sys.START, floor: sys.START - sys.DD, history: [] };
}
function applyT(acc, delta, sys) {
  const balance = acc.balance + delta;
  const maxReached = Math.max(acc.maxReached, balance);
  const floor = maxReached - sys.DD;
  return { ...acc, balance, maxReached, floor, history: [...acc.history, delta > 0 ? "W" : "L"] };
}
const margin = a => a.balance - a.floor;

// ── STORAGE ───────────────────────────────────────────────
const JOURNAL_PREFIX = "jall:";

function hasStorage() {
  try {
    return typeof window !== "undefined" && window.storage && typeof window.storage.set === "function";
  } catch (e) {
    return false;
  }
}
async function listJournals() {
  if (!hasStorage()) return [];
  try {
    const result = await window.storage.list(JOURNAL_PREFIX, false);
    if (!result || !result.keys || result.keys.length === 0) return [];
    const journals = [];
    for (const key of result.keys) {
      try {
        const r = await window.storage.get(key, false);
        if (r && r.value) journals.push(JSON.parse(r.value));
      } catch (e) {}
    }
    return journals.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  } catch (e) { return []; }
}
async function saveJournal(j) {
  if (!hasStorage()) return false;
  try {
    const r = await window.storage.set(JOURNAL_PREFIX + j.id, JSON.stringify(j), false);
    return !!r;
  } catch (e) { return false; }
}
async function deleteJournal(id) {
  if (!hasStorage()) return false;
  try { await window.storage.delete(JOURNAL_PREFIX + id, false); return true; } catch (e) { return false; }
}
function newJournalId() { return "j_" + Date.now() + "_" + Math.random().toString(36).slice(2,7); }
function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("es-MX",{year:"numeric",month:"short",day:"numeric"})
    + " " + d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
}

// ── IMAGE EXPORT ──────────────────────────────────────────
async function exportImage(state, sys, cycleNum, journalName) {
  const W = 900, padding = 30;
  const accs = state.accounts;
  const crosses = state.crosses || [];
  const fundedN = accs.filter(a => getRole(a, sys) === "funded").length;
  const burnedN = accs.filter(a => getRole(a, sys) === "burned").length;
  const invested = accs.length * state.costPerAccount;

  const headerH = 130, cardsH = 80, rowH = 32;
  const tableH = 50 + accs.length * rowH;
  const crossesH = crosses.length > 0 ? 50 + crosses.length * 28 : 0;
  const H = headerH + cardsH + tableH + crossesH + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e222d"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = "#00E5FF"; ctx.fillRect(0,0,W,3);

  let y = padding + 10;
  ctx.fillStyle = "#00E5FF";
  ctx.font = "bold 28px monospace";
  ctx.fillText(`${journalName || "JOURNAL"} — CICLO #${cycleNum}`, padding, y + 22);
  y += 36;

  ctx.fillStyle = "#787b85";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`SISTEMA ${sys.label}`, padding, y + 12);
  y += 18;

  ctx.fillStyle = "#787b85";
  ctx.font = "12px monospace";
  const dateStr = new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"})
    + " · " + new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
  ctx.fillText(dateStr + `  ·  Costo/cuenta: $${state.costPerAccount}`, padding, y + 14);
  y += 38;

  const cardW = (W - padding * 2 - 30) / 4;
  const cards = [
    {l:"CUENTAS", v:String(accs.length), c:"#9ba1ac"},
    {l:"INVERTIDO", v:`$${invested.toLocaleString()}`, c:"#FF6D00"},
    {l:"FUNDED", v:String(fundedN), c:"#00E676"},
    {l:"QUEMADAS", v:String(burnedN), c:"#FF1744"},
  ];
  cards.forEach((card,i) => {
    const x = padding + i * (cardW + 10);
    ctx.fillStyle = "#262a35"; ctx.fillRect(x,y,cardW,60);
    ctx.strokeStyle = card.c + "55"; ctx.lineWidth = 1; ctx.strokeRect(x,y,cardW,60);
    ctx.fillStyle = card.c; ctx.fillRect(x,y,cardW,2);
    ctx.fillStyle = card.c;
    ctx.font = "bold 22px monospace"; ctx.textAlign = "center";
    ctx.fillText(card.v, x + cardW/2, y + 32);
    ctx.fillStyle = "#6a6e78"; ctx.font = "10px monospace";
    ctx.fillText(card.l, x + cardW/2, y + 50);
    ctx.textAlign = "left";
  });
  y += 78;

  ctx.fillStyle = "#22262f"; ctx.fillRect(padding,y,W-padding*2,26);
  ctx.fillStyle = "#00E5FF"; ctx.fillRect(padding,y,4,26);
  ctx.fillStyle = "#00E5FF";
  ctx.font = "bold 13px monospace";
  ctx.fillText("CUENTAS", padding + 12, y + 18);
  y += 30;

  const cols = [80,110,110,110,100,80,130];
  const colNames = ["ID","SALDO","MAXIMO","PISO","MARGEN","TRADES","ROL"];
  let cx = padding + 5;
  ctx.fillStyle = "#787b85"; ctx.font = "bold 11px monospace";
  colNames.forEach((name,i) => { ctx.fillText(name, cx, y + 14); cx += cols[i]; });
  ctx.strokeStyle = "#363a45"; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(padding, y + 22); ctx.lineTo(W - padding, y + 22); ctx.stroke();
  y += 26;

  accs.forEach((acc,idx) => {
    const role = getRole(acc, sys); const rc = ROLES[role];
    if (idx % 2 === 0) { ctx.fillStyle = "#22262f"; ctx.fillRect(padding, y - 2, W - padding*2, rowH); }
    const cells = [acc.id, "$"+acc.balance.toLocaleString(), "$"+acc.maxReached.toLocaleString(),
      "$"+acc.floor.toLocaleString(), "$"+(acc.balance-acc.floor).toLocaleString(),
      String(acc.history.length), rc.emoji + " " + rc.label];
    let cellX = padding + 5;
    ctx.font = "12px monospace";
    cells.forEach((cell,i) => {
      ctx.fillStyle = i === 6 ? rc.color : i === 0 ? "#9ba1ac" : "#c8ccd5";
      ctx.fillText(cell, cellX, y + 18);
      cellX += cols[i];
    });
    y += rowH;
  });
  y += 12;

  if (crosses.length > 0) {
    ctx.fillStyle = "#22262f"; ctx.fillRect(padding,y,W-padding*2,26);
    ctx.fillStyle = "#FFD600"; ctx.fillRect(padding,y,4,26);
    ctx.fillStyle = "#FFD600"; ctx.font = "bold 13px monospace";
    ctx.fillText("HISTORIAL DE CRUCES", padding + 12, y + 18);
    y += 30;
    crosses.forEach((cr,idx) => {
      if (idx % 2 === 0) { ctx.fillStyle = "#22262f"; ctx.fillRect(padding, y - 2, W - padding*2, 28); }
      const tc = cr.type === "funded" ? "#FFD600" : cr.type === "riesgo" ? "#FF6D00" : "#00E5FF";
      ctx.fillStyle = tc; ctx.font = "bold 11px monospace";
      ctx.fillText(cr.type.toUpperCase(), padding + 8, y + 18);
      ctx.fillStyle = "#9ba1ac"; ctx.font = "12px monospace";
      ctx.fillText(`${cr.idA} x ${cr.idB}`, padding + 100, y + 18);
      ctx.fillStyle = "#6a6e78";
      ctx.fillText(`${cr.trades} trades`, padding + 250, y + 18);
      ctx.fillStyle = "#00E676"; ctx.font = "bold 12px monospace";
      ctx.fillText(`v ${cr.winnerId}`, padding + 380, y + 18);
      y += 28;
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("toBlob failed")); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (journalName || "journal").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      a.download = cleanName + "-" + sys.label.toLowerCase().replace("$","") + "-ciclo-" + cycleNum + ".png";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); resolve(); }, 100);
    }, "image/png");
  });
}

// ── UI ATOMS ──────────────────────────────────────────────
function RoleTag({ role }) {
  const r = ROLES[role];
  return (
    <span style={{background:`${r.color}1c`, border:`1px solid ${r.color}55`, color:r.color, borderRadius:5, padding:"2px 7px", fontSize:9, fontWeight:800, fontFamily:"monospace", letterSpacing:1, whiteSpace:"nowrap"}}>
      {r.emoji} {r.label}
    </span>
  );
}

function AccountCard({ acc, sys, selected, onSelect, selectable, onDelete }) {
  const role = getRole(acc, sys);
  const r = ROLES[role];
  const m = margin(acc);
  const burned = role === "burned";
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div onClick={selectable && !burned ? onSelect : undefined}
      style={{
        background: selected ? `${r.color}1a` : burned ? "rgba(255,23,68,0.04)" : "rgba(255,255,255,0.025)",
        border: `1.5px solid ${selected ? r.color : r.color+"22"}`,
        borderRadius:12, padding:13, position:"relative", overflow:"hidden",
        cursor: selectable && !burned ? "pointer" : "default",
        transition:"all 0.15s",
        flex:1, minWidth:155,
      }}>
      <div style={{position:"absolute", top:0, left:0, right:0, height:3, background:r.color}}/>
      {burned && (
        <div style={{position:"absolute", inset:0, background:"rgba(30,34,45,0.85)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2, zIndex:2, borderRadius:12}}>
          <span style={{fontSize:24}}>🔥</span>
          <span style={{color:"#FF1744", fontWeight:900, fontSize:11, letterSpacing:2, fontFamily:"monospace"}}>QUEMADA</span>
          {onDelete && !confirmDel && (
            <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(true);}} style={{marginTop:6, padding:"3px 8px", borderRadius:5, border:"1px solid #FF174450", background:"rgba(255,23,68,0.15)", color:"#FF1744", fontSize:9, fontWeight:900, cursor:"pointer", fontFamily:"monospace", zIndex:3}}>🗑 ELIMINAR</button>
          )}
          {onDelete && confirmDel && (
            <div style={{display:"flex", gap:4, marginTop:6, zIndex:3}}>
              <button onClick={(e)=>{e.stopPropagation(); onDelete(acc.id); setConfirmDel(false);}} style={{padding:"3px 7px", borderRadius:5, border:"1px solid #FF174480", background:"rgba(255,23,68,0.3)", color:"#FF1744", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✓ SÍ</button>
              <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(false);}} style={{padding:"3px 7px", borderRadius:5, border:"1px solid #5d6068", background:"transparent", color:"#9aa3b0", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
            </div>
          )}
        </div>
      )}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, gap:4}}>
        <span style={{fontSize:13, fontWeight:900, color:"#d1d4dc", fontFamily:"monospace", letterSpacing:1}}>{acc.id}</span>
        <div style={{display:"flex", alignItems:"center", gap:4}}>
          <RoleTag role={role}/>
          {onDelete && !burned && !selectable && !confirmDel && (
            <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(true);}} style={{padding:"2px 5px", borderRadius:4, border:"1px solid #FF174420", background:"transparent", color:"#FF174488", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace", lineHeight:1}}>🗑</button>
          )}
          {onDelete && !burned && !selectable && confirmDel && (
            <>
              <button onClick={(e)=>{e.stopPropagation(); onDelete(acc.id); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #FF174480", background:"rgba(255,23,68,0.2)", color:"#FF1744", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✓</button>
              <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #5d6068", background:"transparent", color:"#9aa3b0", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
            </>
          )}
        </div>
      </div>
      <div style={{fontSize:21, fontWeight:900, color: burned ? "#FF1744" : "#d1d4dc", fontFamily:"monospace"}}>{$f(acc.balance)}</div>
      <div style={{fontSize:9, color:"#9aa3b0", marginTop:3}}>
        Piso <span style={{color:"#FF6D00"}}>{$f(acc.floor)}</span>
        <span style={{marginLeft:6, color: m<=sys.TRADE_RISK?"#FF6D00":"#5d6068"}}>· margen {$f(m)}</span>
      </div>
      {!burned && m <= sys.TRADE_RISK && (
        <div style={{marginTop:6, padding:"4px 7px", borderRadius:5, background:"rgba(255,23,68,0.12)", border:"1px solid #FF174440", display:"flex", alignItems:"center", gap:5}}>
          <span style={{fontSize:11}}>🚨</span>
          <span style={{fontSize:9, fontWeight:900, color:"#FF1744", letterSpacing:1, fontFamily:"monospace"}}>1 LOSS = QUEMA</span>
        </div>
      )}
      {!burned && m > sys.TRADE_RISK && m <= sys.DD && (
        <div style={{marginTop:6, padding:"4px 7px", borderRadius:5, background:"rgba(255,109,0,0.1)", border:"1px solid #FF6D0035", display:"flex", alignItems:"center", gap:5}}>
          <span style={{fontSize:11}}>⚠️</span>
          <span style={{fontSize:9, fontWeight:900, color:"#FF6D00", letterSpacing:1, fontFamily:"monospace"}}>2 LOSSES = QUEMA</span>
        </div>
      )}
      {acc.history.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:2, marginTop:7}}>
          {acc.history.slice(-20).map((h,i) => (
            <div key={i} style={{width:7, height:7, borderRadius:1, background: h==="W" ? "rgba(0,230,118,0.45)" : "rgba(255,23,68,0.4)"}}/>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, color, children, disabled, full }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"10px 16px", borderRadius:8, fontFamily:"monospace", fontSize:11, fontWeight:900,
      letterSpacing:1, cursor:disabled?"not-allowed":"pointer",
      border:`1.5px solid ${color}45`, background:`${color}14`, color:disabled?"#5d6068":color,
      opacity:disabled?0.4:1, transition:"all 0.15s",
      width: full ? "100%" : undefined,
    }}>{children}</button>
  );
}

// ── ROLE BOARD ────────────────────────────────────────────
function RoleBoard({ accounts, sys }) {
  const order = ["funded","encubadora","empuje","base","rezagada","riesgo","burned"];
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:5, marginBottom:14}}>
      {order.map(r => {
        const role = ROLES[r];
        const accs = accounts.filter(a => getRole(a, sys) === r);
        const n = accs.length;
        return (
          <div key={r} style={{
            background: n>0 ? `${role.color}10` : "rgba(255,255,255,0.02)",
            border:`1px solid ${n>0 ? role.color+"35" : "#363a45"}`,
            borderRadius:8, padding:"8px 5px", textAlign:"center", position:"relative", overflow:"hidden"
          }}>
            <div style={{position:"absolute", top:0, left:0, right:0, height:2, background:role.color, opacity: n>0?1:0.2}}/>
            <div style={{fontSize:14, marginBottom:2}}>{role.emoji}</div>
            <div style={{fontSize:18, fontWeight:900, color: n>0?role.color:"#4a4d55", fontFamily:"monospace"}}>{n}</div>
            <div style={{fontSize:7, color:"#9aa3b0", letterSpacing:0.5, textTransform:"uppercase", marginTop:1}}>{role.label}</div>
            {accs.length > 0 && (
              <div style={{fontSize:8, color:"#5d6068", marginTop:3, fontFamily:"monospace", lineHeight:1.4, wordBreak:"break-word"}}>
                {accs.map(a => a.id).join(",")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CRUCE PANEL ───────────────────────────────────────────
function CrucePanel({ pair, accounts, sys, onTrade, onCancel, onUndo }) {
  const accA = accounts.find(a => a.id === pair.idA);
  const accB = accounts.find(a => a.id === pair.idB);
  if (!accA || !accB) return null;
  const tradeSize = pair.type === "funded" ? sys.TRADE_CROSS : sys.TRADE_RISK;
  const typeLabel = {
    main:    {label:"CRUCE PRINCIPAL", color:"#00E5FF", desc:`Espejo $${sys.TRADE_RISK.toLocaleString()}/trade`},
    rescue:  {label:"RESCATE",         color:"#FF6D00", desc:`Atrapada x ayudante $${sys.TRADE_RISK.toLocaleString()}/trade`},
    riesgo:  {label:"RECICLAJE",       color:"#FF8A65", desc:`Rezagada x rezagada — una sube a ${$f(sys.START)}, otra se quema`},
    funded:  {label:"CRUCE FINAL",     color:"#FFD600", desc:`Encubadora x encubadora — $${sys.TRADE_CROSS.toLocaleString()} → FUNDED`},
  }[pair.type];

  return (
    <div style={{background:"rgba(255,255,255,0.025)", border:`1.5px solid ${typeLabel.color}30`, borderRadius:14, padding:16, marginBottom:14, position:"relative", overflow:"hidden"}}>
      <div style={{position:"absolute", top:0, left:0, right:0, height:3, background:typeLabel.color}}/>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:6}}>
        <div>
          <div style={{fontSize:9, color:typeLabel.color, fontWeight:900, letterSpacing:2, marginBottom:2}}>⚡ {typeLabel.label} ACTIVO</div>
          <div style={{fontSize:10, color:"#8d95a1"}}>{typeLabel.desc}</div>
        </div>
        <button onClick={onCancel} style={{padding:"4px 10px", borderRadius:6, border:"1px solid #FF174428", background:"transparent", color:"#FF1744", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>✕ CANCELAR</button>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
        <AccountCard acc={accA} sys={sys}/>
        <AccountCard acc={accB} sys={sys}/>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <button onClick={()=>onTrade("A")} style={{padding:"13px 0", borderRadius:9, fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:1, cursor:"pointer", border:`1.5px solid ${typeLabel.color}45`, background:`${typeLabel.color}10`, color:typeLabel.color}}>
          ▲ GANA {accA.id}
          <div style={{fontSize:9, fontWeight:400, opacity:0.5, marginTop:2}}>+${tradeSize.toLocaleString()}</div>
        </button>
        <button onClick={()=>onTrade("B")} style={{padding:"13px 0", borderRadius:9, fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:1, cursor:"pointer", border:`1.5px solid ${typeLabel.color}45`, background:`${typeLabel.color}10`, color:typeLabel.color}}>
          ▲ GANA {accB.id}
          <div style={{fontSize:9, fontWeight:400, opacity:0.5, marginTop:2}}>+${tradeSize.toLocaleString()}</div>
        </button>
      </div>
      {pair.trades > 0 && (
        <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:2}}>Trades: <span style={{color:typeLabel.color, fontWeight:900}}>{pair.trades}</span></div>
          <button onClick={onUndo} style={{padding:"5px 12px", borderRadius:6, border:"1px solid #bbc4cf", background:"transparent", color:"#8d95a1", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>↩ DESHACER</button>
        </div>
      )}
    </div>
  );
}

// ── CRUCE BUILDER ─────────────────────────────────────────
function CruceBuilder({ accounts, sys, onCreate, onCancel }) {
  const [selected, setSelected] = useState([]);
  const eligible = accounts.filter(a => getRole(a, sys) !== "burned" && getRole(a, sys) !== "funded");

  function toggle(id) {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else if (selected.length < 2) setSelected([...selected, id]);
  }

  let detectedType = null;
  let detectionLabel = "";
  if (selected.length === 2) {
    const [aA, aB] = selected.map(id => accounts.find(a => a.id === id));
    const rA = getRole(aA, sys), rB = getRole(aB, sys);
    if (rA === "encubadora" && rB === "encubadora") {
      detectedType = "funded";
      detectionLabel = `🥚×🥚 CRUCE FINAL — $${sys.TRADE_CROSS.toLocaleString()} → FUNDED ${$f(sys.FUNDED)}`;
    } else if (rA === "rezagada" && rB === "rezagada") {
      detectedType = "riesgo";
      detectionLabel = `🟠×🟠 RECICLAJE — una sube a ${$f(sys.START)}, otra se quema`;
    } else if (rA === "rezagada" || rB === "rezagada") {
      detectedType = "rescue";
      const rescuer = rA === "rezagada" ? aB.id : aA.id;
      const rescued = rA === "rezagada" ? aA.id : aB.id;
      detectionLabel = `🟠 RESCATE — ${rescuer} ayuda a ${rescued}`;
    } else if ((rA === "empuje" && rB === "base") || (rA === "base" && rB === "empuje")) {
      detectedType = "main";
      detectionLabel = `🟡⚪ EMPUJE × BASE — $${sys.TRADE_RISK.toLocaleString()}/trade espejado`;
    } else {
      detectedType = "main";
      detectionLabel = `⚡ CRUCE NORMAL — $${sys.TRADE_RISK.toLocaleString()}/trade espejado`;
    }
  }

  return (
    <div style={{background:"rgba(0,229,255,0.04)", border:"1.5px solid rgba(0,229,255,0.25)", borderRadius:14, padding:16, marginBottom:14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
        <div style={{fontSize:10, color:"#00E5FF", fontWeight:900, letterSpacing:2}}>⚡ NUEVO CRUCE</div>
        <button onClick={onCancel} style={{padding:"4px 10px", borderRadius:6, border:"1px solid #FF174428", background:"transparent", color:"#FF1744", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
      </div>
      <div style={{fontSize:10, color:"#8d95a1", marginBottom:12}}>Selecciona 2 cuentas ({selected.length}/2)</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:8, marginBottom:14}}>
        {eligible.map(acc => (
          <AccountCard key={acc.id} acc={acc} sys={sys} selected={selected.includes(acc.id)} onSelect={()=>toggle(acc.id)} selectable/>
        ))}
      </div>
      {selected.length === 2 && detectedType && (
        <div style={{padding:11, borderRadius:9, background:"rgba(255,214,0,0.06)", border:"1px solid #FFD60022", marginBottom:12}}>
          <div style={{fontSize:9, color:"#FFD600", fontWeight:900, letterSpacing:1, marginBottom:4}}>TIPO DETECTADO</div>
          <div style={{fontSize:11, color:"#d1d4dc", fontFamily:"monospace"}}>{detectionLabel}</div>
        </div>
      )}
      <Btn onClick={()=> detectedType && onCreate(selected[0], selected[1], detectedType)}
        color={detectedType === "funded" ? "#FFD600" : detectedType === "riesgo" ? "#FF8A65" : "#00E5FF"}
        disabled={selected.length !== 2}
        full>▶ INICIAR CRUCE</Btn>
    </div>
  );
}

function RecyclePrompt({ accounts, sys, onStart }) {
  const r = accounts.filter(a => getRole(a, sys) === "rezagada");
  if (r.length < 2) return null;
  return (
    <div style={{background:"rgba(255,138,101,0.06)", border:"1.5px solid #FF8A6530", borderRadius:12, padding:13, marginBottom:14}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:10, color:"#FF8A65", fontWeight:900, letterSpacing:1, marginBottom:3}}>🟠 RECICLAJE DISPONIBLE</div>
          <div style={{fontSize:10, color:"#8a929e", lineHeight:1.6}}>{r.length} rezagadas ({r.map(a=>a.id).join(", ")}). Una sube a {$f(sys.START)}, otra se quema.</div>
        </div>
        <Btn onClick={()=>onStart(r[0].id, r[1].id)} color="#FF8A65">🔁 RECICLAR {r[0].id} × {r[1].id}</Btn>
      </div>
    </div>
  );
}

function FundedPrompt({ accounts, sys, onStart }) {
  const enc = accounts.filter(a => getRole(a, sys) === "encubadora");
  if (enc.length < 2) return null;
  const winnerBalance = sys.FUNDED;
  const loserBalance = sys.ENCUBADORA - sys.TRADE_CROSS;
  return (
    <div style={{background:"rgba(255,214,0,0.07)", border:"1.5px solid #FFD60035", borderRadius:12, padding:13, marginBottom:14}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:10, color:"#FFD600", fontWeight:900, letterSpacing:1, marginBottom:3}}>🧊🧊 CRUCE FINAL DISPONIBLE</div>
          <div style={{fontSize:10, color:"#8a929e", lineHeight:1.6}}>{enc.length} encubadoras ({enc.map(a=>a.id).join(", ")}). Ganadora {$f(winnerBalance)} FUNDED, perdedora {$f(loserBalance)}.</div>
        </div>
        <Btn onClick={()=>onStart(enc[0].id, enc[1].id)} color="#FFD600">🥚×🥚 CRUZAR {enc[0].id} × {enc[1].id}</Btn>
      </div>
    </div>
  );
}

// ── JOURNAL LIST ──────────────────────────────────────────
function JournalList({ onOpen, onNew }) {
  const [journals, setJournals] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await Promise.race([
          listJournals(),
          new Promise(resolve => setTimeout(() => resolve([]), 3000))
        ]);
        if (!cancelled) setJournals(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error("Error loading journals:", e);
        if (!cancelled) setJournals([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleDelete(id) {
    await deleteJournal(id);
    setJournals(j => j.filter(x => x.id !== id));
    setConfirmDel(null);
  }

  return (
    <div style={{minHeight:"100vh", background:"#1e222d", display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'Courier New',monospace"}}>
      <div style={{width:"100%", maxWidth:480}}>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:9, letterSpacing:5, color:"#4a4d55", marginBottom:8}}>SISTEMA DE CUENTAS ESPEJADAS</div>
          <div style={{fontSize:26, fontWeight:900, color:"#d1d4dc", letterSpacing:-1}}>MIS <span style={{color:"#00E5FF"}}>JOURNALS</span></div>
          <div style={{fontSize:10, color:"#8d95a1", marginTop:4}}>$25K o $50K · Configurable por journal</div>
        </div>
        <button onClick={onNew} style={{
          width:"100%", padding:"15px 0", borderRadius:12, fontFamily:"monospace", fontSize:13, fontWeight:900,
          letterSpacing:2, cursor:"pointer", border:"1.5px solid #00E5FF",
          background:"rgba(0,229,255,0.1)", color:"#00E5FF", marginBottom:18
        }}>+ NUEVO JOURNAL</button>

        {journals === null && <div style={{textAlign:"center", color:"#8d95a1", fontSize:11, padding:20}}>Cargando...</div>}

        {journals !== null && journals.length === 0 && !hasStorage() && (
          <div style={{padding:14, borderRadius:10, background:"rgba(255,109,0,0.06)", border:"1px solid #FF6D0030", fontSize:11, color:"#FF6D00", lineHeight:1.6}}>
            ⚠️ El almacenamiento no está disponible. Los journals no se guardarán entre sesiones.
          </div>
        )}

        {journals !== null && journals.length === 0 && hasStorage() && (
          <div style={{textAlign:"center", color:"#8d95a1", fontSize:11, padding:30, background:"rgba(255,255,255,0.02)", borderRadius:12, border:"1px dashed #363a45"}}>
            No tienes journals guardados.<br/>Crea uno nuevo para empezar.
          </div>
        )}

        {journals !== null && journals.length > 0 && (
          <div>
            <div style={{fontSize:9, color:"#8d95a1", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Guardados ({journals.length})</div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {journals.map(j => {
                const isConfirm = confirmDel === j.id;
                const accs = j.accounts || [];
                const sysKey = j.systemKey || "50k";
                const sys = SYSTEMS[sysKey] || SYSTEMS["50k"];
                const fundedN = accs.filter(a => a.balance >= sys.FUNDED).length;
                const burnedN = accs.filter(a => a.balance <= sys.BURN || a.balance <= a.floor).length;
                const sysColor = sysKey === "25k" ? "#FF8A65" : "#00E5FF";
                return (
                  <div key={j.id} style={{background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:11, padding:14, position:"relative", overflow:"hidden"}}>
                    <div style={{position:"absolute", top:0, left:0, bottom:0, width:3, background:sysColor, opacity:0.6}}/>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:8}}>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:3}}>
                          <span style={{fontSize:8, fontWeight:900, color:sysColor, padding:"2px 6px", borderRadius:4, background:`${sysColor}20`, fontFamily:"monospace", letterSpacing:1}}>{sys.label}</span>
                          <div style={{fontSize:13, fontWeight:900, color:"#d1d4dc", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0}}>{j.name || "Sin nombre"}</div>
                        </div>
                        <div style={{fontSize:9, color:"#8d95a1", letterSpacing:1}}>📅 {fmtDate(j.createdAt)}</div>
                        <div style={{fontSize:9, color:"#8a929e", marginTop:4, fontFamily:"monospace"}}>
                          {accs.length} cuentas · ciclo #{j.cycleNum||1}
                          {fundedN > 0 && <span style={{color:"#00E676", marginLeft:6}}>🏆 {fundedN}</span>}
                          {burnedN > 0 && <span style={{color:"#FF1744", marginLeft:4}}>🔥 {burnedN}</span>}
                        </div>
                      </div>
                      {!isConfirm ? (
                        <button onClick={()=>setConfirmDel(j.id)} style={{padding:"4px 8px", borderRadius:5, border:"1px solid #FF174420", background:"transparent", color:"#FF1744", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>🗑</button>
                      ) : (
                        <div style={{display:"flex", gap:4}}>
                          <button onClick={()=>handleDelete(j.id)} style={{padding:"4px 8px", borderRadius:5, border:"1px solid #FF174450", background:"rgba(255,23,68,0.15)", color:"#FF1744", fontSize:9, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✓ ELIMINAR</button>
                          <button onClick={()=>setConfirmDel(null)} style={{padding:"4px 8px", borderRadius:5, border:"1px solid #bbc4cf", background:"transparent", color:"#8d95a1", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
                        </div>
                      )}
                    </div>
                    <button onClick={()=>onOpen(j)} style={{width:"100%", padding:"8px 0", borderRadius:7, border:`1px solid ${sysColor}35`, background:`${sysColor}12`, color:sysColor, fontFamily:"monospace", fontSize:11, fontWeight:900, letterSpacing:1, cursor:"pointer", marginTop:4}}>▶ ABRIR</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SETUP ─────────────────────────────────────────────────
function Setup({ onStart, onBack }) {
  const [systemKey, setSystemKey] = useState("50k");
  const sys = SYSTEMS[systemKey];
  const [cost, setCost] = useState(sys.defaultCost);
  const [numAccs, setNumAccs] = useState(5);
  const [names, setNames] = useState(["A","B","C","D","E"]);
  const [journalName, setJournalName] = useState("");

  // When system changes, update default cost
  useEffect(() => {
    setCost(SYSTEMS[systemKey].defaultCost);
  }, [systemKey]);

  function updateName(idx, val) {
    const n = [...names];
    n[idx] = val.toUpperCase().slice(0,12);
    setNames(n);
  }
  function changeNumAccs(n) {
    setNumAccs(n);
    const defs = ["A","B","C","D","E","F","G","H","I","J"];
    const newNames = [];
    for (let i=0; i<n; i++) newNames.push(names[i] || defs[i]);
    setNames(newNames);
  }

  const slice = names.slice(0, numAccs);
  const validNames = slice.every(n => n && n.trim());
  const uniqueNames = new Set(slice.map(n => n.trim())).size === numAccs;
  const canStart = validNames && uniqueNames;

  return (
    <div style={{minHeight:"100vh", background:"#1e222d", display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'Courier New',monospace"}}>
      <div style={{width:"100%", maxWidth:440}}>
        <div style={{marginBottom:18}}>
          {onBack && <button onClick={onBack} style={{padding:"5px 10px", borderRadius:6, border:"1px solid #bbc4cf", background:"transparent", color:"#8a929e", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", marginBottom:14}}>← VOLVER</button>}
          <div style={{fontSize:9, letterSpacing:5, color:"#4a4d55", marginBottom:8}}>NUEVO JOURNAL</div>
          <div style={{fontSize:24, fontWeight:900, color:"#d1d4dc", letterSpacing:-1}}>CONFIGURAR <span style={{color:"#00E5FF"}}>SISTEMA</span></div>
        </div>

        {/* Tamaño de cuenta */}
        <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:16, marginBottom:12}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Tamaño de cuenta</div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
            {Object.entries(SYSTEMS).map(([key, s]) => {
              const active = systemKey === key;
              const c = key === "25k" ? "#FF8A65" : "#00E5FF";
              return (
                <button key={key} onClick={()=>setSystemKey(key)} style={{
                  padding:"14px 10px", borderRadius:10, fontFamily:"monospace", cursor:"pointer",
                  border:`1.5px solid ${active ? c : "#363a45"}`,
                  background: active ? `${c}15` : "transparent",
                  color: active ? c : "#5d6068",
                  textAlign:"center"
                }}>
                  <div style={{fontSize:18, fontWeight:900, letterSpacing:-0.5}}>{s.label}</div>
                  <div style={{fontSize:8, marginTop:4, opacity:0.8, lineHeight:1.5}}>
                    DD ${s.DD.toLocaleString()}<br/>
                    Riesgo ${s.TRADE_RISK}/trade
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{fontSize:9, color:"#8d95a1", marginTop:10, lineHeight:1.6}}>
            ${sys.START.toLocaleString()} → quema ${sys.BURN.toLocaleString()} · funded ${sys.FUNDED.toLocaleString()}
          </div>
        </div>

        {/* Nombre journal */}
        <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:16, marginBottom:12}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Nombre del journal</div>
          <input type="text" value={journalName} onChange={e=>setJournalName(e.target.value.slice(0,30))} placeholder={`Ej: ${sys.label} Octubre`} maxLength={30}
            style={{width:"100%", boxSizing:"border-box", background:"rgba(0,0,0,0.25)", border:"1px solid #c8d0d9", borderRadius:7, padding:"9px 12px", color:"#d1d4dc", fontFamily:"monospace", fontSize:13, fontWeight:800, outline:"none"}}/>
        </div>

        {/* Num cuentas */}
        <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:16, marginBottom:12}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>¿Cuántas cuentas?</div>
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {[1,2,3,4,5,6,7,8].map(n => (
              <button key={n} onClick={()=>changeNumAccs(n)}
                style={{padding:"8px 14px", borderRadius:8, fontFamily:"monospace", fontSize:13, fontWeight:900,
                  border:`1px solid ${numAccs===n?"#00E5FF":"#363a45"}`,
                  background:numAccs===n?"rgba(0,229,255,0.1)":"transparent",
                  color:numAccs===n?"#00E5FF":"#5d6068", cursor:"pointer"}}>{n}</button>
            ))}
          </div>
        </div>

        {/* Nombres */}
        <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:16, marginBottom:12}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Nombres</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8}}>
            {slice.map((name, i) => {
              const isDup = slice.filter(n => n.trim() === name.trim()).length > 1;
              const isEmpty = !name || !name.trim();
              return (
                <div key={i} style={{display:"flex", alignItems:"center", gap:6}}>
                  <span style={{fontSize:9, color:"#8d95a1", fontWeight:700, fontFamily:"monospace", width:14}}>{i+1}.</span>
                  <input type="text" value={name} onChange={e => updateName(i, e.target.value)} placeholder="Nombre" maxLength={12}
                    style={{flex:1, background:"rgba(0,0,0,0.25)", border:`1px solid ${isDup||isEmpty?"#FF174450":"#c8d0d9"}`, borderRadius:7, padding:"7px 10px", color:"#d1d4dc", fontFamily:"monospace", fontSize:12, fontWeight:800, outline:"none", textTransform:"uppercase"}}/>
                </div>
              );
            })}
          </div>
          {!uniqueNames && validNames && <div style={{fontSize:9, color:"#FF1744", marginTop:8}}>⚠️ Los nombres deben ser únicos</div>}
        </div>

        {/* Costo */}
        <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:16, marginBottom:14}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Costo por cuenta (USD)</div>
          <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:8}}>
            {sys.costPresets.map(v => (
              <button key={v} onClick={()=>setCost(v)}
                style={{padding:"6px 12px", borderRadius:7, fontFamily:"monospace", fontSize:11, fontWeight:800,
                  border:`1px solid ${cost===v?"#FFD600":"#363a45"}`,
                  background:cost===v?"rgba(255,214,0,0.1)":"transparent",
                  color:cost===v?"#FFD600":"#5d6068", cursor:"pointer"}}>${v}</button>
            ))}
          </div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={{fontSize:9, color:"#9aa3b0"}}>Otro:</span>
            <input type="number" value={cost} onChange={e=>setCost(Math.max(1, +e.target.value||1))}
              style={{background:"rgba(0,0,0,0.25)", border:"1px solid #c8d0d9", borderRadius:7, padding:"5px 10px", color:"#d1d4dc", fontFamily:"monospace", fontSize:13, fontWeight:800, width:90, outline:"none"}}/>
          </div>
        </div>

        {/* Resumen */}
        <div style={{background:"rgba(0,230,118,0.05)", border:"1px solid rgba(0,230,118,0.12)", borderRadius:12, padding:12, marginBottom:18, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          {[
            {l:"Sistema", v:sys.label},
            {l:"Cuentas", v:String(numAccs)},
            {l:"Costo c/u", v:$f(cost)},
            {l:"Total invertido", v:$f(numAccs*cost)},
            {l:"Balance virtual", v:$f(numAccs*sys.START)},
            {l:"Funded por cuenta", v:$f(sys.FUNDED)},
          ].map(({l,v}, i) => (
            <div key={i} style={{background:"rgba(0,0,0,0.25)", borderRadius:7, padding:"7px 9px"}}>
              <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:1, textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:13, fontWeight:900, color:i>=3?"#00E676":"#d1d4dc", fontFamily:"monospace", marginTop:1}}>{v}</div>
            </div>
          ))}
        </div>

        <button onClick={()=>canStart && onStart(systemKey, cost, slice, journalName.trim() || "Sin nombre")} disabled={!canStart}
          style={{width:"100%", padding:"15px 0", borderRadius:12, fontFamily:"monospace", fontSize:13, fontWeight:900, letterSpacing:2,
            cursor:canStart?"pointer":"not-allowed",
            border:`1.5px solid ${canStart?"#00E5FF":"#363a45"}`,
            background:canStart?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.02)",
            color:canStart?"#00E5FF":"#5d6068", opacity:canStart?1:0.5}}>
          ▶ INICIAR
        </button>
      </div>
    </div>
  );
}

// ── FUNDED CARD ───────────────────────────────────────────
function FundedCard({ acc, sys, selected, onSelect, selectable, onDelete, onPromote }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const m = acc.balance - acc.floor;
  const burned = acc.balance <= sys.FUNDED_BURN || acc.balance <= acc.floor;
  const ready = acc.balance >= sys.ORDENO_THRESHOLD;
  const profit = acc.balance - sys.FUNDED_START;
  const cardColor = burned ? "#FF1744" : ready ? "#FFD600" : profit > 0 ? "#00E676" : "#9ba1ac";
  
  return (
    <div onClick={selectable && !burned && !ready ? onSelect : undefined}
      style={{
        background: selected ? `${cardColor}1a` : "rgba(255,255,255,0.025)",
        border: `1.5px solid ${selected ? cardColor : cardColor+"30"}`,
        borderRadius:12, padding:13, position:"relative", overflow:"hidden",
        cursor: selectable && !burned && !ready ? "pointer" : "default",
        flex:1, minWidth:155,
      }}>
      <div style={{position:"absolute", top:0, left:0, right:0, height:3, background:cardColor}}/>
      {burned && (
        <div style={{position:"absolute", inset:0, background:"rgba(30,34,45,0.85)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:4, zIndex:2, borderRadius:12}}>
          <span style={{fontSize:24}}>🔥</span>
          <span style={{color:"#FF1744", fontWeight:900, fontSize:11, letterSpacing:2, fontFamily:"monospace"}}>QUEMADA</span>
          {onDelete && !confirmDel && (
            <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(true);}} style={{padding:"3px 8px", borderRadius:5, border:"1px solid #FF174450", background:"rgba(255,23,68,0.15)", color:"#FF1744", fontSize:9, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>🗑</button>
          )}
          {onDelete && confirmDel && (
            <div style={{display:"flex", gap:4}}>
              <button onClick={(e)=>{e.stopPropagation(); onDelete(acc.id); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #FF174480", background:"rgba(255,23,68,0.3)", color:"#FF1744", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✓ SÍ</button>
              <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #5d6068", background:"transparent", color:"#9aa3b0", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
            </div>
          )}
        </div>
      )}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, gap:4}}>
        <span style={{fontSize:13, fontWeight:900, color:"#d1d4dc", fontFamily:"monospace", letterSpacing:1}}>{acc.id}</span>
        <div style={{display:"flex", gap:4, alignItems:"center"}}>
          <span style={{background:`${cardColor}20`, color:cardColor, fontSize:8, fontWeight:900, padding:"2px 6px", borderRadius:4, letterSpacing:1, fontFamily:"monospace"}}>
            {ready ? "✓ ORDEÑO" : burned ? "🔥" : "🏆 FUNDED"}
          </span>
          {onDelete && !burned && !confirmDel && !selectable && (
            <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(true);}} style={{padding:"2px 5px", borderRadius:4, border:"1px solid #FF174420", background:"transparent", color:"#FF174488", fontSize:9, cursor:"pointer", fontFamily:"monospace", lineHeight:1}}>🗑</button>
          )}
          {onDelete && !burned && confirmDel && !selectable && (
            <>
              <button onClick={(e)=>{e.stopPropagation(); onDelete(acc.id); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #FF174480", background:"rgba(255,23,68,0.2)", color:"#FF1744", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✓</button>
              <button onClick={(e)=>{e.stopPropagation(); setConfirmDel(false);}} style={{padding:"2px 6px", borderRadius:4, border:"1px solid #5d6068", background:"transparent", color:"#9aa3b0", fontSize:8, fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
            </>
          )}
        </div>
      </div>
      <div style={{fontSize:21, fontWeight:900, color: cardColor, fontFamily:"monospace"}}>{$f(acc.balance)}</div>
      <div style={{fontSize:9, color:"#9aa3b0", marginTop:3}}>
        Profit <span style={{color: profit>=0?"#00E676":"#FF1744"}}>{profit>=0?"+":""}{$f(profit)}</span>
        <span style={{marginLeft:6, color:"#5d6068"}}>· margen {$f(m)}</span>
      </div>
      {ready && onPromote && (
        <button onClick={(e)=>{e.stopPropagation(); onPromote(acc.id);}} style={{
          width:"100%", marginTop:8, padding:"7px 0", borderRadius:6, fontFamily:"monospace", fontSize:10, fontWeight:900,
          letterSpacing:1, cursor:"pointer", border:"1px solid #FFD60050", background:"rgba(255,214,0,0.12)", color:"#FFD600"
        }}>🐄 PASAR A ORDEÑO</button>
      )}
      {acc.history.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:2, marginTop:7}}>
          {acc.history.slice(-20).map((h,i) => (
            <div key={i} style={{width:7, height:7, borderRadius:1, background: h==="W" ? "rgba(0,230,118,0.45)" : "rgba(255,23,68,0.4)"}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ORDEÑO SETUP ─────────────────────────────────────────
function OrdenoSetupModal({ acc, sys, onSave, onCancel }) {
  const [days, setDays] = useState(4);
  const [amount, setAmount] = useState(sys.FUNDED_TRADE);
  return (
    <div style={{background:"rgba(255,214,0,0.07)", border:"1.5px solid #FFD60050", borderRadius:12, padding:14, marginBottom:14}}>
      <div style={{fontSize:10, color:"#FFD600", fontWeight:900, letterSpacing:2, marginBottom:10}}>🐄 CONFIGURAR ORDEÑO · {acc.id}</div>
      <div style={{fontSize:10, color:"#8d95a1", marginBottom:12, lineHeight:1.6}}>Capital actual: <strong style={{color:"#d1d4dc"}}>${acc.balance.toLocaleString()}</strong></div>
      
      <div style={{marginBottom:10}}>
        <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:2, textTransform:"uppercase", marginBottom:4}}>Días requeridos por la firma</div>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {[3,4,5,7,10].map(n => (
            <button key={n} onClick={()=>setDays(n)} style={{padding:"6px 12px", borderRadius:7, fontFamily:"monospace", fontSize:11, fontWeight:900, border:`1px solid ${days===n?"#FFD600":"#363a45"}`, background:days===n?"rgba(255,214,0,0.1)":"transparent", color:days===n?"#FFD600":"#5d6068", cursor:"pointer"}}>{n}</button>
          ))}
          <input type="number" value={days} onChange={e=>setDays(Math.max(1,+e.target.value||1))} min={1}
            style={{width:60, background:"rgba(0,0,0,0.25)", border:"1px solid #c8d0d9", borderRadius:7, padding:"5px 8px", color:"#d1d4dc", fontFamily:"monospace", fontSize:12, fontWeight:800, outline:"none", textAlign:"center"}}/>
        </div>
      </div>
      
      <div style={{marginBottom:12}}>
        <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:2, textTransform:"uppercase", marginBottom:4}}>Monto/día (lo que pide la firma)</div>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {[100, 150, 200, 500, 1000].map(v => (
            <button key={v} onClick={()=>setAmount(v)} style={{padding:"6px 12px", borderRadius:7, fontFamily:"monospace", fontSize:11, fontWeight:900, border:`1px solid ${amount===v?"#00E676":"#363a45"}`, background:amount===v?"rgba(0,230,118,0.08)":"transparent", color:amount===v?"#00E676":"#5d6068", cursor:"pointer"}}>${v}</button>
          ))}
          <input type="number" value={amount} onChange={e=>setAmount(Math.max(1,+e.target.value||1))} min={1}
            style={{width:80, background:"rgba(0,0,0,0.25)", border:"1px solid #c8d0d9", borderRadius:7, padding:"5px 8px", color:"#d1d4dc", fontFamily:"monospace", fontSize:12, fontWeight:800, outline:"none", textAlign:"center"}}/>
        </div>
      </div>
      
      <div style={{padding:9, borderRadius:7, background:"rgba(0,0,0,0.25)", marginBottom:10, fontSize:10, color:"#9ba1ac", fontFamily:"monospace", lineHeight:1.7}}>
        <strong style={{color:"#d1d4dc"}}>{days}</strong> días × <strong style={{color:"#00E676"}}>${amount}</strong> = <strong style={{color:"#FFD600"}}>${(days*amount).toLocaleString()}</strong> profit total<br/>
        Capital final: <strong style={{color:"#00E676"}}>${(acc.balance + days*amount).toLocaleString()}</strong>
      </div>
      
      <div style={{display:"flex", gap:8}}>
        <Btn onClick={()=>onSave(acc.id, days, amount)} color="#FFD600" full>✓ INICIAR ORDEÑO</Btn>
        <Btn onClick={onCancel} color="#FF1744">✕</Btn>
      </div>
    </div>
  );
}

// ── ORDEÑO CARD ───────────────────────────────────────────
function OrdenoCard({ acc, onLogDay, onUndoDay, onCollect, onDelete }) {
  const pct = (acc.daysCompleted / acc.daysRequired) * 100;
  const remaining = acc.daysRequired - acc.daysCompleted;
  return (
    <div style={{background:"rgba(255,214,0,0.04)", border:"1.5px solid #FFD60035", borderRadius:12, padding:13, position:"relative", overflow:"hidden"}}>
      <div style={{position:"absolute", top:0, left:0, right:0, height:3, background: acc.paymentReady ? "#00E676" : "#FFD600"}}/>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, gap:4}}>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          <span style={{fontSize:13, fontWeight:900, color:"#d1d4dc", fontFamily:"monospace", letterSpacing:1}}>{acc.id}</span>
          {acc.totalPayments > 0 && <span style={{fontSize:8, color:"#00E676", background:"rgba(0,230,118,0.15)", padding:"1px 5px", borderRadius:3, fontFamily:"monospace"}}>💰 {acc.totalPayments}</span>}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:4}}>
          <span style={{fontSize:8, fontWeight:900, color:"#FFD600", padding:"2px 6px", borderRadius:4, background:"rgba(255,214,0,0.15)", fontFamily:"monospace", letterSpacing:1}}>🐄 ORDEÑO</span>
          <button onClick={()=>onDelete(acc.id)} style={{padding:"2px 5px", borderRadius:4, border:"1px solid #FF174420", background:"transparent", color:"#FF174488", fontSize:9, cursor:"pointer", fontFamily:"monospace", lineHeight:1}}>🗑</button>
        </div>
      </div>
      <div style={{fontSize:21, fontWeight:900, color:"#FFD600", fontFamily:"monospace"}}>{$f(acc.balance)}</div>
      <div style={{fontSize:9, color:"#9aa3b0", marginTop:3, lineHeight:1.6}}>
        ${acc.dailyAmount}/día × {acc.daysRequired} días<br/>
        Profit acumulado: <span style={{color:"#00E676"}}>+${acc.profitTotal.toLocaleString()}</span>
      </div>
      
      {/* Progress bar */}
      <div style={{marginTop:8, height:6, background:"rgba(0,0,0,0.3)", borderRadius:3, overflow:"hidden"}}>
        <div style={{width:`${Math.min(100,pct)}%`, height:"100%", background: acc.paymentReady ? "#00E676" : "#FFD600", transition:"width 0.3s"}}/>
      </div>
      <div style={{fontSize:9, color:"#8d95a1", marginTop:4, fontFamily:"monospace", textAlign:"center"}}>
        {acc.daysCompleted}/{acc.daysRequired} días {acc.paymentReady ? "✅" : `(faltan ${remaining})`}
      </div>
      
      {/* Day dots */}
      <div style={{display:"flex", flexWrap:"wrap", gap:3, marginTop:7, justifyContent:"center"}}>
        {Array.from({length: acc.daysRequired}).map((_, i) => (
          <div key={i} style={{
            width:14, height:14, borderRadius:3,
            background: i < acc.daysCompleted ? "#00E676" : "rgba(255,255,255,0.06)",
            border: i < acc.daysCompleted ? "1px solid #00E676" : "1px solid #363a45",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:8, fontWeight:900, color: i < acc.daysCompleted ? "#0a3a1a" : "#5d6068", fontFamily:"monospace"
          }}>{i+1}</div>
        ))}
      </div>
      
      {/* Actions */}
      {!acc.paymentReady && (
        <div style={{display:"flex", gap:6, marginTop:9}}>
          <button onClick={()=>onLogDay(acc.id)} style={{flex:2, padding:"8px 0", borderRadius:6, fontFamily:"monospace", fontSize:10, fontWeight:900, letterSpacing:1, cursor:"pointer", border:"1px solid #00E67645", background:"rgba(0,230,118,0.1)", color:"#00E676"}}>✓ DÍA OK +${acc.dailyAmount}</button>
          {acc.daysCompleted > 0 && <button onClick={()=>onUndoDay(acc.id)} style={{padding:"8px 10px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:700, cursor:"pointer", border:"1px solid #5d6068", background:"transparent", color:"#9aa3b0"}}>↩</button>}
        </div>
      )}
      {acc.paymentReady && (
        <button onClick={()=>onCollect(acc.id)} style={{
          width:"100%", marginTop:9, padding:"10px 0", borderRadius:6, fontFamily:"monospace", fontSize:11, fontWeight:900,
          letterSpacing:1, cursor:"pointer", border:"1.5px solid #00E676", background:"rgba(0,230,118,0.15)", color:"#00E676"
        }}>💰 COBRAR ${acc.profitTotal.toLocaleString()} & RESETEAR</button>
      )}
    </div>
  );
}

// ── PHASE TABS ────────────────────────────────────────────
function PhaseTabs({ phase, onChange, evalCount, fundedCount, ordenoCount }) {
  const tabs = [
    {id:"eval", label:"EVAL", icon:"📊", count:evalCount, color:"#00E5FF"},
    {id:"funded", label:"FUNDED", icon:"🏆", count:fundedCount, color:"#FFD600"},
    {id:"ordeno", label:"ORDEÑO", icon:"🐄", count:ordenoCount, color:"#00E676"},
  ];
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6, marginBottom:14}}>
      {tabs.map(t => {
        const active = phase === t.id;
        return (
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            padding:"10px 8px", borderRadius:9, fontFamily:"monospace", cursor:"pointer",
            border:`1.5px solid ${active ? t.color : "#363a45"}`,
            background: active ? `${t.color}12` : "rgba(255,255,255,0.02)",
            color: active ? t.color : "#5d6068",
            display:"flex", flexDirection:"column", alignItems:"center", gap:3
          }}>
            <span style={{fontSize:14}}>{t.icon}</span>
            <span style={{fontSize:9, fontWeight:900, letterSpacing:2}}>{t.label}</span>
            <span style={{fontSize:14, fontWeight:900, fontFamily:"monospace"}}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── FUNDED CRUCE BUILDER ──────────────────────────────────
function FundedCruceBuilder({ accounts, sys, onCreate, onCancel }) {
  const [selected, setSelected] = useState([]);
  const eligible = accounts.filter(a => {
    const burned = a.balance <= sys.FUNDED_BURN || a.balance <= a.floor;
    const ready = a.balance >= sys.ORDENO_THRESHOLD;
    return !burned && !ready;
  });

  function toggle(id) {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else if (selected.length < 2) setSelected([...selected, id]);
  }

  return (
    <div style={{background:"rgba(255,214,0,0.04)", border:"1.5px solid rgba(255,214,0,0.25)", borderRadius:14, padding:16, marginBottom:14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
        <div style={{fontSize:10, color:"#FFD600", fontWeight:900, letterSpacing:2}}>⚡ NUEVO CRUCE FUNDED</div>
        <button onClick={onCancel} style={{padding:"4px 10px", borderRadius:6, border:"1px solid #FF174428", background:"transparent", color:"#FF1744", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>✕</button>
      </div>
      <div style={{fontSize:10, color:"#8d95a1", marginBottom:12}}>Selecciona 2 cuentas funded ({selected.length}/2) · Trade: ${sys.FUNDED_TRADE}/lado</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:8, marginBottom:14}}>
        {eligible.map(acc => (
          <FundedCard key={acc.id} acc={acc} sys={sys} selected={selected.includes(acc.id)} onSelect={()=>toggle(acc.id)} selectable/>
        ))}
      </div>
      <Btn onClick={()=> onCreate(selected[0], selected[1])} color="#FFD600" disabled={selected.length !== 2} full>
        ▶ INICIAR CRUCE FUNDED
      </Btn>
    </div>
  );
}

// ── FUNDED CRUCE PANEL (active) ──────────────────────────
function FundedCrucePanel({ pair, accounts, sys, onTrade, onCancel, onUndo }) {
  const accA = accounts.find(a => a.id === pair.idA);
  const accB = accounts.find(a => a.id === pair.idB);
  if (!accA || !accB) return null;
  return (
    <div style={{background:"rgba(255,255,255,0.025)", border:"1.5px solid #FFD60040", borderRadius:14, padding:16, marginBottom:14, position:"relative", overflow:"hidden"}}>
      <div style={{position:"absolute", top:0, left:0, right:0, height:3, background:"#FFD600"}}/>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:6}}>
        <div>
          <div style={{fontSize:9, color:"#FFD600", fontWeight:900, letterSpacing:2, marginBottom:2}}>🏆 CRUCE FUNDED ACTIVO</div>
          <div style={{fontSize:10, color:"#8d95a1"}}>Espejo ${sys.FUNDED_TRADE}/trade · Una llega a ${sys.ORDENO_THRESHOLD.toLocaleString()} → ordeño</div>
        </div>
        <button onClick={onCancel} style={{padding:"4px 10px", borderRadius:6, border:"1px solid #FF174428", background:"transparent", color:"#FF1744", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>✕ CANCELAR</button>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
        <FundedCard acc={accA} sys={sys}/>
        <FundedCard acc={accB} sys={sys}/>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <button onClick={()=>onTrade("A")} style={{padding:"13px 0", borderRadius:9, fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:1, cursor:"pointer", border:"1.5px solid #FFD60050", background:"rgba(255,214,0,0.1)", color:"#FFD600"}}>
          ▲ GANA {accA.id}
          <div style={{fontSize:9, fontWeight:400, opacity:0.5, marginTop:2}}>+${sys.FUNDED_TRADE.toLocaleString()}</div>
        </button>
        <button onClick={()=>onTrade("B")} style={{padding:"13px 0", borderRadius:9, fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:1, cursor:"pointer", border:"1.5px solid #FFD60050", background:"rgba(255,214,0,0.1)", color:"#FFD600"}}>
          ▲ GANA {accB.id}
          <div style={{fontSize:9, fontWeight:400, opacity:0.5, marginTop:2}}>+${sys.FUNDED_TRADE.toLocaleString()}</div>
        </button>
      </div>
      {pair.trades > 0 && (
        <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
          <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:2}}>Trades: <span style={{color:"#FFD600", fontWeight:900}}>{pair.trades}</span></div>
          <button onClick={onUndo} style={{padding:"5px 12px", borderRadius:6, border:"1px solid #bbc4cf", background:"transparent", color:"#8d95a1", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace"}}>↩ DESHACER</button>
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("list");
  const [journalId, setJournalId] = useState(null);
  const [journalName, setJournalName] = useState("");
  const [createdAt, setCreatedAt] = useState(null);
  const [systemKey, setSystemKey] = useState("50k");

  const [setup, setSetup] = useState(null);
  const [cycleNum, setCycleNum] = useState(1);
  const [accounts, setAccounts] = useState([]);
  const [activePair, setActivePair] = useState(null);
  const [crosses, setCrosses] = useState([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [accCounter, setAccCounter] = useState(5);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showAdd, setShowAdd] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccBalance, setNewAccBalance] = useState("");
  const [newAccLossCount, setNewAccLossCount] = useState(0);
  
  // Funded & Ordeño phases
  const [fundedAccounts, setFundedAccounts] = useState([]);  // cuentas en cruce funded
  const [ordenoAccounts, setOrdenoAccounts] = useState([]);  // cuentas en ordeño
  const [activeFundedPair, setActiveFundedPair] = useState(null);
  const [phase, setPhase] = useState("eval"); // "eval" | "funded" | "ordeno"
  const [showOrdenoSetup, setShowOrdenoSetup] = useState(null); // ID de cuenta a configurar para ordeño

  const sys = SYSTEMS[systemKey] || SYSTEMS["50k"];

  useEffect(() => {
    if (screen !== "journal" || !journalId || !setup) return;
    const journal = { id:journalId, name:journalName, systemKey, createdAt, updatedAt:Date.now(), setup, cycleNum, accounts, fundedAccounts, ordenoAccounts, activePair, activeFundedPair, crosses, accCounter };
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      try {
        const ok = await saveJournal(journal);
        setSaveStatus(ok ? "saved" : "error");
      } catch (e) {
        setSaveStatus("error");
      }
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 400);
    return () => clearTimeout(t);
  }, [screen, journalId, journalName, systemKey, createdAt, setup, cycleNum, accounts, fundedAccounts, ordenoAccounts, activePair, activeFundedPair, crosses, accCounter]);

  function handleOpen(j) {
    if (!j) return;
    const accs = Array.isArray(j.accounts) ? j.accounts : [];
    const sysKey = j.systemKey || "50k";
    const sysFromJ = SYSTEMS[sysKey] || SYSTEMS["50k"];
    let recoveredSetup = j.setup;
    if (!recoveredSetup || !recoveredSetup.accountNames) {
      const names = accs.map(a => a.id).filter(Boolean);
      recoveredSetup = {
        costPerAccount: (j.setup && j.setup.costPerAccount) || sysFromJ.defaultCost,
        accountNames: names.length > 0 ? names : ["A","B","C","D","E"],
      };
    }
    setJournalId(j.id);
    setJournalName(j.name || "Sin nombre");
    setSystemKey(sysKey);
    setCreatedAt(j.createdAt || Date.now());
    setSetup(recoveredSetup);
    setCycleNum(j.cycleNum || 1);
    setAccounts(accs);
    setFundedAccounts(Array.isArray(j.fundedAccounts) ? j.fundedAccounts : []);
    setOrdenoAccounts(Array.isArray(j.ordenoAccounts) ? j.ordenoAccounts : []);
    setActivePair(j.activePair || null);
    setActiveFundedPair(j.activeFundedPair || null);
    setCrosses(Array.isArray(j.crosses) ? j.crosses : []);
    setAccCounter(j.accCounter || accs.length || 5);
    setShowBuilder(false); setShowEnd(false); setShowAdd(false);
    setPhase("eval");
    setScreen("journal");
  }
  function handleNewJournal() { setScreen("setup"); }
  function handleStart(sysKey, costPerAccount, accountNames, name) {
    const sysSel = SYSTEMS[sysKey];
    setJournalId(newJournalId());
    setJournalName(name);
    setSystemKey(sysKey);
    setCreatedAt(Date.now());
    setSetup({costPerAccount, accountNames});
    setAccounts(accountNames.map(id => mkAcc(id, sysSel)));
    setFundedAccounts([]);
    setOrdenoAccounts([]);
    setActivePair(null);
    setActiveFundedPair(null);
    setCrosses([]); setShowBuilder(false); setShowEnd(false);
    setAccCounter(accountNames.length);
    setCycleNum(1);
    setPhase("eval");
    setScreen("journal");
  }
  function backToList() {
    setScreen("list");
    setJournalId(null); setJournalName(""); setCreatedAt(null);
    setSetup(null); setAccounts([]); setActivePair(null); setCrosses([]);
    setCycleNum(1); setShowBuilder(false); setShowEnd(false);
  }
  function handleNewCycle() {
    setCycleNum(p => p + 1);
    setAccounts(setup.accountNames.map(id => mkAcc(id, sys)));
    setActivePair(null); setCrosses([]); setShowEnd(false);
  }

  function startCross(idA, idB, type) {
    setActivePair({idA, idB, type, trades:0});
    setShowBuilder(false);
  }
  function cancelCross() { setActivePair(null); }

  function handleTrade(side) {
    if (!activePair) return;
    const tradeSize = activePair.type === "funded" ? sys.TRADE_CROSS : sys.TRADE_RISK;
    setAccounts(prev => {
      const next = prev.map(a => {
        if (a.id === activePair.idA) return applyT(a, side === "A" ? +tradeSize : -tradeSize, sys);
        if (a.id === activePair.idB) return applyT(a, side === "B" ? +tradeSize : -tradeSize, sys);
        return a;
      });
      const accA = next.find(a => a.id === activePair.idA);
      const accB = next.find(a => a.id === activePair.idB);
      const rA = getRole(accA, sys), rB = getRole(accB, sys);
      let shouldEnd = false, winnerId = null;
      if (activePair.type === "funded") {
        if (rA === "funded" || rB === "funded") {
          shouldEnd = true;
          winnerId = rA === "funded" ? accA.id : accB.id;
        }
      } else if (activePair.type === "riesgo") {
        if (accA.balance === sys.START || accB.balance === sys.START || rA === "burned" || rB === "burned") {
          shouldEnd = true;
          winnerId = accA.balance === sys.START ? accA.id : accB.balance === sys.START ? accB.id : rA !== "burned" ? accA.id : accB.id;
        }
      } else {
        if (rA === "encubadora" || rA === "burned" || rB === "encubadora" || rB === "burned") {
          shouldEnd = true;
          winnerId = rA === "encubadora" ? accA.id : rB === "encubadora" ? accB.id : rA !== "burned" ? accA.id : accB.id;
        }
      }
      if (shouldEnd) {
        setCrosses(c => [...c, {type:activePair.type, idA:activePair.idA, idB:activePair.idB, trades:activePair.trades + 1, winnerId, finalA:accA.balance, finalB:accB.balance}]);
        setActivePair(null);
        
        // Auto-promote funded accounts: move to fundedAccounts with RESET balance
        if (activePair.type === "funded") {
          const winnerAcc = next.find(a => a.id === winnerId);
          if (winnerAcc) {
            // Remove from eval accounts
            const filtered = next.filter(a => a.id !== winnerId);
            // Create new funded account with reset balance
            const newFunded = {
              id: winnerAcc.id + "-F",
              originalId: winnerAcc.id,
              balance: sys.FUNDED_START,
              maxReached: sys.FUNDED_START,
              floor: sys.FUNDED_START - sys.FUNDED_DD,
              history: [],
              promotedAt: Date.now(),
            };
            setFundedAccounts(prev => [...prev, newFunded]);
            return filtered;
          }
        }
      } else {
        setActivePair(p => ({...p, trades:p.trades + 1}));
      }
      return next;
    });
  }

  function undoTrade() {
    if (!activePair) return;
    setAccounts(prev => prev.map(a => {
      if (a.id !== activePair.idA && a.id !== activePair.idB) return a;
      if (a.history.length === 0) return a;
      const lastWasW = a.history[a.history.length - 1] === "W";
      const tradeSize = activePair.type === "funded" ? sys.TRADE_CROSS : sys.TRADE_RISK;
      const reverted = lastWasW ? -tradeSize : +tradeSize;
      return {...a, balance:a.balance + reverted, history:a.history.slice(0, -1)};
    }));
    setActivePair(p => ({...p, trades:Math.max(0, p.trades - 1)}));
  }

  function deleteAccount(id) {
    // Don't delete if part of an active cross
    if (activePair && (activePair.idA === id || activePair.idB === id)) {
      alert("No puedes eliminar una cuenta que está en un cruce activo. Cancela el cruce primero.");
      return;
    }
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  function addNewAccount() {
    const trimmed = newAccName.trim().toUpperCase();
    if (!trimmed) return;
    if (accounts.find(a => a.id === trimmed)) { alert("Ya existe una cuenta con ese nombre"); return; }
    
    // Parse balance: empty = default START, or use custom value
    const customBalance = newAccBalance === "" ? sys.START : Math.max(0, +newAccBalance || sys.START);
    
    // Build the account based on the imported state
    // We assume the cuenta started at sys.START and lost trades to reach customBalance
    // floor = customBalance + (sys.START - customBalance was lost) — but trailing rules say floor follows max
    // Since the cuenta never went above START (it only lost), maxReached = START, floor = START - DD
    const maxReached = Math.max(sys.START, customBalance);
    const floor = maxReached - sys.DD;
    
    // Build history with N losses (or empty if no losses recorded)
    const lossCount = Math.max(0, +newAccLossCount || 0);
    const history = Array(lossCount).fill("L");
    
    const newAcc = {
      id: trimmed,
      balance: customBalance,
      maxReached,
      floor,
      history,
    };
    
    setAccounts(prev => [...prev, newAcc]);
    setAccCounter(p => p + 1);
    setNewAccName("");
    setNewAccBalance("");
    setNewAccLossCount(0);
    setShowAdd(false);
  }

  // ── FUNDED PHASE FUNCTIONS ──────────────────────────────
  function startFundedCross(idA, idB) {
    setActiveFundedPair({ idA, idB, trades: 0 });
  }
  function cancelFundedCross() { setActiveFundedPair(null); }
  
  function handleFundedTrade(side) {
    if (!activeFundedPair) return;
    setFundedAccounts(prev => {
      const next = prev.map(a => {
        if (a.id === activeFundedPair.idA) {
          const delta = side === "A" ? +sys.FUNDED_TRADE : -sys.FUNDED_TRADE;
          const balance = a.balance + delta;
          const maxReached = Math.max(a.maxReached, balance);
          const floor = maxReached - sys.FUNDED_DD;
          return { ...a, balance, maxReached, floor, history: [...a.history, delta > 0 ? "W" : "L"] };
        }
        if (a.id === activeFundedPair.idB) {
          const delta = side === "B" ? +sys.FUNDED_TRADE : -sys.FUNDED_TRADE;
          const balance = a.balance + delta;
          const maxReached = Math.max(a.maxReached, balance);
          const floor = maxReached - sys.FUNDED_DD;
          return { ...a, balance, maxReached, floor, history: [...a.history, delta > 0 ? "W" : "L"] };
        }
        return a;
      });
      const accA = next.find(a => a.id === activeFundedPair.idA);
      const accB = next.find(a => a.id === activeFundedPair.idB);
      
      // Check: did anyone reach ordeño threshold OR get burned?
      const aReached = accA.balance >= sys.ORDENO_THRESHOLD;
      const bReached = accB.balance >= sys.ORDENO_THRESHOLD;
      const aBurned = accA.balance <= sys.FUNDED_BURN || accA.balance <= accA.floor;
      const bBurned = accB.balance <= sys.FUNDED_BURN || accB.balance <= accB.floor;
      
      if (aReached || bReached || aBurned || bBurned) {
        setActiveFundedPair(null);
      } else {
        setActiveFundedPair(p => ({ ...p, trades: p.trades + 1 }));
      }
      return next;
    });
  }
  
  function undoFundedTrade() {
    if (!activeFundedPair) return;
    setFundedAccounts(prev => prev.map(a => {
      if (a.id !== activeFundedPair.idA && a.id !== activeFundedPair.idB) return a;
      if (a.history.length === 0) return a;
      const lastWasW = a.history[a.history.length - 1] === "W";
      const reverted = lastWasW ? -sys.FUNDED_TRADE : +sys.FUNDED_TRADE;
      return { ...a, balance: a.balance + reverted, history: a.history.slice(0, -1) };
    }));
    setActiveFundedPair(p => ({ ...p, trades: Math.max(0, p.trades - 1) }));
  }
  
  function deleteFundedAccount(id) {
    if (activeFundedPair && (activeFundedPair.idA === id || activeFundedPair.idB === id)) {
      alert("No puedes eliminar una cuenta en cruce activo. Cancela primero.");
      return;
    }
    setFundedAccounts(prev => prev.filter(a => a.id !== id));
  }
  
  function promoteToOrdeno(fundedAccId, daysRequired, dailyAmount) {
    const acc = fundedAccounts.find(a => a.id === fundedAccId);
    if (!acc) return;
    const newOrdeno = {
      id: acc.id,
      originalId: acc.originalId || acc.id,
      balance: acc.balance,
      daysRequired: Math.max(1, +daysRequired || 4),
      daysCompleted: 0,
      dailyAmount: Math.max(1, +dailyAmount || 100),
      profitTotal: 0,
      promotedAt: Date.now(),
      paymentReady: false,
    };
    setOrdenoAccounts(prev => [...prev, newOrdeno]);
    setFundedAccounts(prev => prev.filter(a => a.id !== fundedAccId));
    setShowOrdenoSetup(null);
  }
  
  function logOrdenoDay(id) {
    setOrdenoAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      const newDays = a.daysCompleted + 1;
      const newProfit = a.profitTotal + a.dailyAmount;
      return {
        ...a,
        daysCompleted: newDays,
        profitTotal: newProfit,
        balance: a.balance + a.dailyAmount,
        paymentReady: newDays >= a.daysRequired,
      };
    }));
  }
  
  function undoOrdenoDay(id) {
    setOrdenoAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      if (a.daysCompleted === 0) return a;
      const newDays = a.daysCompleted - 1;
      return {
        ...a,
        daysCompleted: newDays,
        profitTotal: Math.max(0, a.profitTotal - a.dailyAmount),
        balance: a.balance - a.dailyAmount,
        paymentReady: newDays >= a.daysRequired,
      };
    }));
  }
  
  function collectPayment(id) {
    if (!confirm("¿Cobrar pago y reiniciar ordeño?")) return;
    setOrdenoAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      return {
        ...a,
        balance: sys.FUNDED_START,
        daysCompleted: 0,
        profitTotal: 0,
        paymentReady: false,
        lastPaymentAt: Date.now(),
        totalPayments: (a.totalPayments || 0) + 1,
      };
    }));
  }
  
  function deleteOrdenoAccount(id) {
    if (!confirm("¿Eliminar esta cuenta de ordeño?")) return;
    setOrdenoAccounts(prev => prev.filter(a => a.id !== id));
  }

  if (screen === "list") return <JournalList onOpen={handleOpen} onNew={handleNewJournal}/>;
  if (screen === "setup") return <Setup onStart={handleStart} onBack={()=>setScreen("list")}/>;
  if (!setup) {
    return (
      <div style={{minHeight:"100vh", background:"#1e222d", display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'Courier New',monospace"}}>
        <div style={{maxWidth:400, textAlign:"center"}}>
          <div style={{fontSize:32, marginBottom:12}}>⚠️</div>
          <div style={{fontSize:14, color:"#d1d4dc", marginBottom:14}}>El journal no tiene datos válidos</div>
          <button onClick={()=>setScreen("list")} style={{padding:"10px 18px", borderRadius:8, background:"rgba(0,229,255,0.1)", border:"1px solid #00E5FF", color:"#00E5FF", fontWeight:900, cursor:"pointer", fontFamily:"monospace"}}>← VOLVER A LISTA</button>
        </div>
      </div>
    );
  }

  const totalAccs = accounts.length;
  const fundedN = accounts.filter(a => getRole(a, sys) === "funded").length;
  const burnedN = accounts.filter(a => getRole(a, sys) === "burned").length;
  const invested = totalAccs * setup.costPerAccount;

  const sortedAccs = [...accounts].sort((a, b) => {
    const order = {funded:0, encubadora:1, empuje:2, base:3, rezagada:4, riesgo:5, burned:6};
    const ra = getRole(a, sys), rb = getRole(b, sys);
    if (order[ra] !== order[rb]) return order[ra] - order[rb];
    return b.balance - a.balance;
  });

  const sysColor = systemKey === "25k" ? "#FF8A65" : "#00E5FF";

  return (
    <div style={{minHeight:"100vh", background:"#1e222d", color:"#d1d4dc", fontFamily:"'Courier New',monospace", display:"flex", flexDirection:"column"}}>
      <div style={{position:"sticky", top:0, zIndex:50, background:"rgba(30,34,45,0.97)", backdropFilter:"blur(10px)", borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"9px 16px"}}>
        <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
          <div style={{display:"flex", flexDirection:"column", gap:1}}>
            <div style={{display:"flex", alignItems:"center", gap:6}}>
              <span style={{fontSize:8, fontWeight:900, color:sysColor, padding:"2px 6px", borderRadius:4, background:`${sysColor}20`, fontFamily:"monospace", letterSpacing:1}}>{sys.label}</span>
              <span style={{fontSize:11, fontWeight:900, color:"#00E5FF", fontFamily:"monospace", letterSpacing:2}}>{journalName||"JOURNAL"}</span>
            </div>
            <span style={{fontSize:8, color:"#8d95a1", fontFamily:"monospace", letterSpacing:1}}>
              CICLO #{cycleNum}
              {saveStatus==="saving" && <span style={{color:"#FFD600", marginLeft:6}}>● guardando</span>}
              {saveStatus==="saved" && <span style={{color:"#00E676", marginLeft:6}}>✓ guardado</span>}
              {saveStatus==="error" && <span style={{color:"#FF1744", marginLeft:6}}>⚠️ error</span>}
            </span>
          </div>
          <div style={{width:1, height:14, background:"#363a45"}}/>
          {[
            {l:"💰", v:`$${invested.toLocaleString()}`, c:"#FF6D00"},
            {l:"📊", v:totalAccs, c:"#9ba1ac"},
            {l:"🏆", v:fundedN, c:"#00E676"},
            {l:"🔥", v:burnedN, c:"#FF1744"},
          ].map(({l,v,c}, i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap:3}}>
              <span style={{fontSize:9, color:"#9aa3b0"}}>{l}</span>
              <span style={{fontSize:13, fontWeight:900, color:c, fontFamily:"monospace"}}>{v}</span>
            </div>
          ))}
          <div style={{flex:1}}/>
          <button onClick={async()=>{setImgBusy(true); try{await exportImage({accounts, crosses, costPerAccount:setup.costPerAccount}, sys, cycleNum, journalName);}catch(e){console.error(e);} setImgBusy(false);}} disabled={imgBusy}
            style={{padding:"6px 12px", borderRadius:7, background:"rgba(0,230,118,0.08)", border:"1px solid #00E67630", color:"#00E676", fontWeight:900, cursor:imgBusy?"wait":"pointer", fontFamily:"monospace", fontSize:9}}>
            {imgBusy?"⏳":"📸 IMG"}
          </button>
          <button onClick={()=>setShowEnd(p=>!p)} style={{padding:"6px 12px", borderRadius:7, background:"rgba(255,214,0,0.07)", border:"1px solid #FFD60025", color:"#FFD600", fontWeight:900, cursor:"pointer", fontFamily:"monospace", fontSize:9}}>📊 FIN</button>
          <button onClick={backToList} style={{padding:"6px 10px", borderRadius:7, background:"transparent", border:"1px solid #FF174420", color:"#FF1744", fontWeight:900, cursor:"pointer", fontFamily:"monospace", fontSize:9}}>✕</button>
        </div>
      </div>

      {showEnd && (
        <div style={{background:"rgba(0,0,0,0.05)", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:18}}>
          <div style={{maxWidth:480, margin:"0 auto"}}>
            <div style={{textAlign:"center", marginBottom:16}}>
              <div style={{fontSize:24, marginBottom:4}}>📊</div>
              <div style={{fontSize:18, fontWeight:900, color:"#d1d4dc"}}>RESUMEN CICLO #{cycleNum}</div>
            </div>
            <RoleBoard accounts={accounts} sys={sys}/>
            <div style={{display:"flex", gap:8, marginTop:12}}>
              <button onClick={async()=>{setImgBusy(true); try{await exportImage({accounts, crosses, costPerAccount:setup.costPerAccount}, sys, cycleNum, journalName);}catch(e){console.error(e);} setImgBusy(false);}} disabled={imgBusy}
                style={{flex:2, padding:"12px 0", borderRadius:9, fontFamily:"monospace", fontSize:11, fontWeight:900, cursor:imgBusy?"wait":"pointer", border:"1.5px solid #FFD600", background:"rgba(255,214,0,0.1)", color:"#FFD600"}}>
                {imgBusy ? "⏳ GENERANDO..." : "📸 DESCARGAR IMAGEN"}
              </button>
              <button onClick={handleNewCycle} style={{flex:1, padding:"12px 0", borderRadius:9, fontFamily:"monospace", fontSize:11, fontWeight:900, cursor:"pointer", border:"1.5px solid #00E676", background:"rgba(0,230,118,0.08)", color:"#00E676"}}>🔄 NUEVO</button>
            </div>
          </div>
        </div>
      )}

      <div style={{flex:1, overflowY:"auto", padding:16, maxWidth:680, margin:"0 auto", width:"100%"}}>
        <PhaseTabs phase={phase} onChange={setPhase} evalCount={accounts.length} fundedCount={fundedAccounts.length} ordenoCount={ordenoAccounts.length}/>

        {/* ── EVAL PHASE ──────────────────────────────── */}
        {phase === "eval" && <>
          <RoleBoard accounts={accounts} sys={sys}/>

          {activePair && <CrucePanel pair={activePair} accounts={accounts} sys={sys} onTrade={handleTrade} onCancel={cancelCross} onUndo={undoTrade}/>}
          {showBuilder && !activePair && <CruceBuilder accounts={accounts} sys={sys} onCreate={startCross} onCancel={()=>setShowBuilder(false)}/>}

          {showAdd && !activePair && (
            <div style={{background:"rgba(144,164,174,0.08)", border:"1.5px solid rgba(144,164,174,0.3)", borderRadius:12, padding:14, marginBottom:14}}>
              <div style={{fontSize:10, color:"#90A4AE", fontWeight:900, letterSpacing:2, marginBottom:10}}>+ AGREGAR CUENTA</div>
              
              <div style={{marginBottom:10}}>
                <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:2, textTransform:"uppercase", marginBottom:4}}>Nombre</div>
                <input type="text" value={newAccName} onChange={e=>setNewAccName(e.target.value.toUpperCase().slice(0,12))} onKeyDown={e=>e.key==="Enter"&&addNewAccount()} placeholder="Ej: A, B, C..." autoFocus
                  style={{width:"100%", boxSizing:"border-box", background:"rgba(0,0,0,0.25)", border:"1px solid #bbc4cf", borderRadius:7, padding:"8px 12px", color:"#d1d4dc", fontFamily:"monospace", fontSize:12, fontWeight:800, outline:"none"}}/>
              </div>

              <div style={{marginBottom:10}}>
                <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:2, textTransform:"uppercase", marginBottom:4}}>Saldo actual (vacío = ${sys.START.toLocaleString()})</div>
                <div style={{display:"flex", gap:6, marginBottom:6, flexWrap:"wrap"}}>
                  <button onClick={()=>{setNewAccBalance(""); setNewAccLossCount(0);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:`1px solid ${newAccBalance===""?"#00E5FF":"#363a45"}`, background:newAccBalance===""?"rgba(0,229,255,0.1)":"transparent", color:newAccBalance===""?"#00E5FF":"#5d6068", cursor:"pointer"}}>⚪ NUEVA<br/><span style={{opacity:0.7}}>${sys.START.toLocaleString()}</span></button>
                  <button onClick={()=>{setNewAccBalance(String(sys.REZAGADA)); setNewAccLossCount(1);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:"1px solid #FF8A6555", background:"rgba(255,138,101,0.08)", color:"#FF8A65", cursor:"pointer"}}>🟠 REZAGADA<br/><span style={{opacity:0.7}}>${sys.REZAGADA.toLocaleString()}</span></button>
                  <button onClick={()=>{setNewAccBalance(String(sys.EMPUJE_LO)); setNewAccLossCount(0);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:"1px solid #FFD60055", background:"rgba(255,214,0,0.08)", color:"#FFD600", cursor:"pointer"}}>🟡 EMPUJE<br/><span style={{opacity:0.7}}>${sys.EMPUJE_LO.toLocaleString()}</span></button>
                  <button onClick={()=>{setNewAccBalance(String(sys.ENCUBADORA)); setNewAccLossCount(0);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:"1px solid #00E5FF55", background:"rgba(0,229,255,0.08)", color:"#00E5FF", cursor:"pointer"}}>🧊 ENCUBADORA<br/><span style={{opacity:0.7}}>${sys.ENCUBADORA.toLocaleString()}</span></button>
                  <button onClick={()=>{setNewAccBalance(String(sys.FUNDED)); setNewAccLossCount(0);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:"1px solid #00E67655", background:"rgba(0,230,118,0.08)", color:"#00E676", cursor:"pointer"}}>🏆 FUNDED<br/><span style={{opacity:0.7}}>${sys.FUNDED.toLocaleString()}</span></button>
                  <button onClick={()=>{setNewAccBalance(String(sys.BURN)); setNewAccLossCount(2);}} style={{padding:"5px 9px", borderRadius:6, fontFamily:"monospace", fontSize:9, fontWeight:800, border:"1px solid #FF174455", background:"rgba(255,23,68,0.08)", color:"#FF1744", cursor:"pointer"}}>🔥 QUEMADA<br/><span style={{opacity:0.7}}>${sys.BURN.toLocaleString()}</span></button>
                </div>
                <input type="number" value={newAccBalance} onChange={e=>setNewAccBalance(e.target.value)} placeholder={`${sys.START.toLocaleString()}`} 
                  style={{width:"100%", boxSizing:"border-box", background:"rgba(0,0,0,0.25)", border:"1px solid #bbc4cf", borderRadius:7, padding:"8px 12px", color:"#d1d4dc", fontFamily:"monospace", fontSize:12, fontWeight:800, outline:"none"}}/>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:8, color:"#9aa3b0", letterSpacing:2, textTransform:"uppercase", marginBottom:4}}>Stops ya hechos (historial)</div>
                <div style={{display:"flex", gap:6, alignItems:"center"}}>
                  {[0,1,2,3,4].map(n => (
                    <button key={n} onClick={()=>setNewAccLossCount(n)} style={{padding:"6px 12px", borderRadius:7, fontFamily:"monospace", fontSize:11, fontWeight:900, border:`1px solid ${newAccLossCount===n?"#FFD600":"#363a45"}`, background:newAccLossCount===n?"rgba(255,214,0,0.1)":"transparent", color:newAccLossCount===n?"#FFD600":"#5d6068", cursor:"pointer"}}>{n}</button>
                  ))}
                </div>
              </div>

              {newAccName.trim() && (
                <div style={{padding:9, borderRadius:7, background:"rgba(0,0,0,0.25)", marginBottom:10, fontSize:10, color:"#9ba1ac", fontFamily:"monospace", lineHeight:1.6}}>
                  <strong style={{color:"#d1d4dc"}}>{newAccName.trim().toUpperCase()}</strong> con saldo <strong style={{color:"#00E5FF"}}>${(newAccBalance===""?sys.START:+newAccBalance).toLocaleString()}</strong>
                  {newAccLossCount > 0 && <> · <span style={{color:"#FF1744"}}>{newAccLossCount} stop{newAccLossCount>1?"s":""}</span> en historial</>}
                </div>
              )}

              <div style={{display:"flex", gap:8}}>
                <Btn onClick={addNewAccount} color="#00E676" disabled={!newAccName.trim()} full>✓ AGREGAR</Btn>
                <Btn onClick={()=>{setShowAdd(false); setNewAccName(""); setNewAccBalance(""); setNewAccLossCount(0);}} color="#FF1744">✕</Btn>
              </div>
              <div style={{fontSize:9, color:"#8d95a1", marginTop:8}}>Costo: ${setup.costPerAccount}  ·  Inicio sistema: {$f(sys.START)}  ·  Quema: {$f(sys.BURN)}</div>
            </div>
          )}

          {!activePair && !showBuilder && <FundedPrompt accounts={accounts} sys={sys} onStart={(a,b)=>startCross(a,b,"funded")}/>}
          {!activePair && !showBuilder && <RecyclePrompt accounts={accounts} sys={sys} onStart={(a,b)=>startCross(a,b,"riesgo")}/>}

          {!activePair && !showBuilder && (
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14}}>
              <Btn onClick={()=>setShowBuilder(true)} color="#00E5FF">⚡ NUEVO CRUCE</Btn>
              <Btn onClick={()=>setShowAdd(true)} color="#90A4AE">+ AGREGAR CUENTA (${setup.costPerAccount})</Btn>
            </div>
          )}

          <div style={{marginTop:14}}>
            <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>CUENTAS EVAL · {totalAccs}</div>
            {accounts.length === 0 ? (
              <div style={{textAlign:"center", color:"#5d6068", fontSize:10, padding:24, background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px dashed #363a45"}}>
                No hay cuentas en evaluación.<br/>Crea cuentas o ya pasaron todas a funded.
              </div>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:8}}>
                {sortedAccs.map(acc => <AccountCard key={acc.id} acc={acc} sys={sys} onDelete={deleteAccount}/>)}
              </div>
            )}
          </div>
        </>}

        {/* ── FUNDED PHASE ────────────────────────────── */}
        {phase === "funded" && <>
          {activeFundedPair && <FundedCrucePanel pair={activeFundedPair} accounts={fundedAccounts} sys={sys} onTrade={handleFundedTrade} onCancel={cancelFundedCross} onUndo={undoFundedTrade}/>}
          {showBuilder && !activeFundedPair && <FundedCruceBuilder accounts={fundedAccounts} sys={sys} onCreate={startFundedCross} onCancel={()=>setShowBuilder(false)}/>}
          
          {!activeFundedPair && !showBuilder && fundedAccounts.length >= 2 && (
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14}}>
              <Btn onClick={()=>setShowBuilder(true)} color="#FFD600">⚡ NUEVO CRUCE FUNDED</Btn>
            </div>
          )}
          
          <div style={{marginTop:14}}>
            <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>
              CUENTAS FUNDED · {fundedAccounts.length}
              <span style={{marginLeft:10, color:"#5d6068", textTransform:"none", letterSpacing:1}}>
                Trade ${sys.FUNDED_TRADE} · Ordeño desde ${sys.ORDENO_THRESHOLD.toLocaleString()}
              </span>
            </div>
            {fundedAccounts.length === 0 ? (
              <div style={{textAlign:"center", color:"#5d6068", fontSize:10, padding:24, background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px dashed #363a45"}}>
                No hay cuentas funded todavía.<br/>Cuando una cuenta de eval pase a funded, aparecerá aquí con saldo reseteado a ${sys.FUNDED_START.toLocaleString()}.
              </div>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:8}}>
                {fundedAccounts.map(acc => <FundedCard key={acc.id} acc={acc} sys={sys} onDelete={deleteFundedAccount} onPromote={(id)=>setShowOrdenoSetup(id)}/>)}
              </div>
            )}
          </div>
          
          {showOrdenoSetup && (() => {
            const accForOrdeno = fundedAccounts.find(a => a.id === showOrdenoSetup);
            if (!accForOrdeno) return null;
            return <div style={{marginTop:14}}><OrdenoSetupModal acc={accForOrdeno} sys={sys} onSave={promoteToOrdeno} onCancel={()=>setShowOrdenoSetup(null)}/></div>;
          })()}
        </>}

        {/* ── ORDEÑO PHASE ────────────────────────────── */}
        {phase === "ordeno" && <>
          <div style={{marginTop:14}}>
            <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>
              CUENTAS EN ORDEÑO · {ordenoAccounts.length}
            </div>
            {ordenoAccounts.length === 0 ? (
              <div style={{textAlign:"center", color:"#5d6068", fontSize:10, padding:24, background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px dashed #363a45"}}>
                No hay cuentas en ordeño todavía.<br/>Cuando una cuenta funded llegue a ${sys.ORDENO_THRESHOLD.toLocaleString()}, podrás pasarla aquí.
              </div>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10}}>
                {ordenoAccounts.map(acc => <OrdenoCard key={acc.id} acc={acc} onLogDay={logOrdenoDay} onUndoDay={undoOrdenoDay} onCollect={collectPayment} onDelete={deleteOrdenoAccount}/>)}
              </div>
            )}
          </div>
        </>}

        {/* Historial cruces (siempre visible) */}
        {phase === "eval" && crosses.length > 0 && (
          <div style={{marginTop:20, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:12, padding:14}}>
            <div style={{fontSize:9, color:"#9aa3b0", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>HISTORIAL DE CRUCES · {crosses.length}</div>
            <div style={{display:"flex", flexDirection:"column", gap:5}}>
              {crosses.map((cr, i) => {
                const tc = cr.type==="funded"?"#FFD600":cr.type==="riesgo"?"#FF8A65":"#00E5FF";
                return (
                  <div key={i} style={{padding:"8px 11px", borderRadius:7, background:"rgba(0,0,0,0.25)", border:`1px solid ${tc}15`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
                    <span style={{fontSize:9, fontWeight:900, color:tc, padding:"2px 7px", borderRadius:4, background:`${tc}15`, fontFamily:"monospace", letterSpacing:1}}>{cr.type.toUpperCase()}</span>
                    <span style={{fontSize:11, color:"#9ba1ac", fontFamily:"monospace"}}>{cr.idA} × {cr.idB}</span>
                    <span style={{fontSize:9, color:"#8d95a1"}}>{cr.trades} trades</span>
                    <span style={{fontSize:10, fontWeight:800, color:"#00E676", marginLeft:"auto"}}>✓ {cr.winnerId}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{height:30}}/>
      </div>
    </div>
  );
}
